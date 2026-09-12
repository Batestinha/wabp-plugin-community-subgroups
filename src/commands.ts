import type { CommandMetadata } from '@wabs/plugin-sdk/command-metadata';
import type { FlowSessionSnapshot } from '@wabs/plugin-sdk/flow-engine';
import type { CommandContext } from '@wabs/plugin-sdk/commands';
import type { CommunityCommandPluginContext as PluginCommandContext } from '@wabs/plugin-sdk/community-operations';
import { requireStableIdentityAddress } from '@wabs/plugin-sdk/message-actor';
import { requirePluginStateContext } from '@wabs/plugin-sdk/stateful-plugin';
import { requireScopeId } from '@wabs/plugin-sdk/commands';
import { parseCommunitySubgroupsConfig } from './config';
import {
  createPinDurationFlowDefinition,
  createSubgroupFlowDefinition,
  pinDurationLabel,
  pinDurationPurpose,
  pinDurationSeconds,
  subgroupConfirmPurpose,
  subgroupFlowAnswers,
  subgroupFlowConfirmed
} from './flow';
import { COMMUNITY_SUBGROUPS_PLUGIN_ID } from './manifest';
import {
  COMMUNITY_SUBGROUPS_CANDIDATE_METHOD,
  COMMUNITY_SUBGROUPS_COMPLETE_METHOD,
  COMMUNITY_SUBGROUPS_CONFIGURE_METHOD,
  COMMUNITY_SUBGROUPS_RECONCILE_CREATOR_METHOD,
  COMMUNITY_SUBGROUPS_SERVICE_ID,
  type CommunitySubgroupCandidateOutput,
  type CommunitySubgroupCompleteOutput,
  type CommunitySubgroupConfigureOutput,
  type CommunitySubgroupReconcileCreatorOutput
} from './serviceApi';
import {
  EVENT_SUBGROUP_OWNERSHIP_RESOLVE_METHOD,
  EVENT_SUBGROUP_OWNERSHIP_SERVICE_ID,
  type EventSubgroupOwnershipResolveOutput
} from './contracts/community-events-v1';

interface SubgroupDraft {
  flowSessionId: string;
  flowType: string;
  scopeId: string;
  groupId?: string | undefined;
  groupWid?: string | undefined;
  chatId: string;
  actorIdentityId: string;
  actorWid: string;
  parentCommunityWid: string;
}

interface PinDraft {
  flowSessionId: string;
  flowType: string;
  scopeId: string;
  groupId?: string | undefined;
  groupWid: string;
  chatId: string;
  actorWid: string;
  actorIdentityId?: string | undefined;
  promptQuotedMessageId?: string | undefined;
  messageId: string;
}

const GROUP_MEMBER_COMMAND: Omit<CommandMetadata, 'auditAction' | 'mutation'> = {
  plane: 'group_operation',
  interaction: 'group_same_chat',
  pluginId: COMMUNITY_SUBGROUPS_PLUGIN_ID,
  requiredAccessPlane: 'group_member',
  requiresManagedGroup: true,
  assistant: {
    executable: true,
    requiresConfirmation: true
  }
};

export function registerCommunitySubgroupCommands(context: PluginCommandContext): void {
  const router = context.router;
  registerFlowRecovery(context);

  router.register('subgroup', 'create', commandMetadata({
    auditAction: 'community_subgroups.create',
    usage: '/subgroup create',
    descriptionKey: 'official.community-subgroups.help.create',
    topicId: 'create-subgroup',
    exampleKey: 'official.community-subgroups.help.create.example'
  }), async (ctx) => startCreateFlow(context, ctx));

  router.register('title', '*', commandMetadata({
    auditAction: 'community_subgroups.title',
    usage: '/title new group title',
    descriptionKey: 'official.community-subgroups.help.title',
    topicId: 'edit-subgroup',
    exampleKey: 'official.community-subgroups.help.title.example'
  }), async (ctx) => updateTitle(context, ctx));

  router.register('description', '*', commandMetadata({
    auditAction: 'community_subgroups.description',
    usage: '/description new group description',
    descriptionKey: 'official.community-subgroups.help.description',
    topicId: 'edit-subgroup',
    exampleKey: 'official.community-subgroups.help.description.example'
  }), async (ctx) => updateDescription(context, ctx));

  router.register('pin', '*', commandMetadata({
    auditAction: 'community_subgroups.pin',
    usage: '/pin',
    descriptionKey: 'official.community-subgroups.help.pin',
    topicId: 'pin-messages',
    exampleKey: 'official.community-subgroups.help.pin.example'
  }), async (ctx) => startPinDurationFlow(context, ctx));

  router.register('unpin', '*', commandMetadata({
    auditAction: 'community_subgroups.unpin',
    usage: '/unpin',
    descriptionKey: 'official.community-subgroups.help.unpin',
    topicId: 'pin-messages',
    exampleKey: 'official.community-subgroups.help.unpin.example'
  }), async (ctx) => unpinQuotedMessage(context, ctx));
}

async function startCreateFlow(context: PluginCommandContext, ctx: CommandContext) {
  const runtime = requirePluginStateContext(context);
  const scopeId = requireScopeId(ctx);
  const actor = subgroupCommandActor(ctx);
  const config = parseCommunitySubgroupsConfig(await runtime.configFor(scopeId, actor.identityId));
  if (!config.enabled) {
    return { handled: true, text: ctx.t('official.community-subgroups.disabled') };
  }
  const parentCommunityWid = await resolveParentCommunityWid(context, ctx, scopeId);
  if (!parentCommunityWid) {
    return { handled: true, text: ctx.t('official.community-subgroups.parentMissing') };
  }

  const definition = createSubgroupFlowDefinition({ t: ctx.t });
  registerSubgroupFlowCompletionHandler(context, definition.flowType, ctx.t);
  await context.flowEngine.startFlow({
    definition,
    message: ctx.message,
    scopeId,
    onSessionCreated: async (session) => {
      const draft: SubgroupDraft = {
        flowSessionId: session.id,
        flowType: definition.flowType,
        scopeId,
        ...(ctx.groupId ? { groupId: ctx.groupId } : {}),
        ...(ctx.groupWid ? { groupWid: ctx.groupWid } : {}),
        chatId: ctx.message.chatId,
        actorIdentityId: actor.identityId,
        actorWid: actor.canonicalWid,
        parentCommunityWid
      };
      await runtime.dataStore.set(subgroupDraftKey(scopeId, session.id), draft);
    },
    onSessionStartFailed: async (session) => {
      await runtime.dataStore.delete(subgroupDraftKey(scopeId, session.id));
    }
  });
  return { handled: true, text: ctx.t('official.community-subgroups.create.started') };
}

function registerSubgroupFlowCompletionHandler(
  context: PluginCommandContext,
  flowType: string,
  t: CommandContext['t']
): void {
  const runtime = requirePluginStateContext(context);
  context.flowEngine.registerPromptHandler(subgroupConfirmPurpose(flowType), async (lock, activeTransport) => {
    if (!lock.flowSessionId) {
      return false;
    }
    const snapshot = await context.flowEngine.getSessionSnapshot(lock.flowSessionId);
    if (!snapshot || snapshot.flowType !== flowType || !snapshot.scopeId) {
      return false;
    }
    const draft = await runtime.dataStore.get<SubgroupDraft>(subgroupDraftKey(snapshot.scopeId, lock.flowSessionId));
    if (!draft) {
      return false;
    }
    await runtime.dataStore.delete(subgroupDraftKey(snapshot.scopeId, lock.flowSessionId));
    if (!subgroupFlowConfirmed(snapshot)) {
      await activeTransport.sendText(draft.chatId, t('official.community-subgroups.create.cancelled'));
      return true;
    }
    const answers = subgroupFlowAnswers(snapshot);
    if (!answers || !context.services) {
      await activeTransport.sendText(draft.chatId, t('official.community-subgroups.create.invalid'));
      return true;
    }
    try {
      // Carry stable identity references through candidate creation and linking.
      // The platform completion operation owns authoritative address resolution
      // and records individual failures after the community link is confirmed.
      const participantWids = unique(answers.participantReferences);
      const serviceContext = {
        serviceId: COMMUNITY_SUBGROUPS_SERVICE_ID,
        scopeId: draft.scopeId,
        actorIdentityId: draft.actorIdentityId,
        ...(draft.groupId ? { groupId: draft.groupId } : {}),
        ...(draft.groupWid ? { groupWid: draft.groupWid } : {})
      };
      const candidate = await context.services.call<CommunitySubgroupCandidateOutput>({
        ...serviceContext,
        method: COMMUNITY_SUBGROUPS_CANDIDATE_METHOD,
        input: {
          title: answers.title,
          parentCommunityWid: draft.parentCommunityWid
        }
      });
      const creatorReconciled = await context.services.call<CommunitySubgroupReconcileCreatorOutput>({
        ...serviceContext,
        method: COMMUNITY_SUBGROUPS_RECONCILE_CREATOR_METHOD,
        input: {
          chatId: candidate.created.chatId,
          title: candidate.created.title,
          participants: candidate.created.participants,
          parentCommunityWid: draft.parentCommunityWid
        }
      });
      await context.services.call<CommunitySubgroupConfigureOutput>({
        ...serviceContext,
        method: COMMUNITY_SUBGROUPS_CONFIGURE_METHOD,
        input: {
          chatId: candidate.created.chatId,
          title: candidate.created.title,
          ...(answers.description ? { description: answers.description } : {}),
          participants: creatorReconciled.created.participants,
          parentCommunityWid: draft.parentCommunityWid
        }
      });
      const result = await context.services.call<CommunitySubgroupCompleteOutput>({
        ...serviceContext,
        method: COMMUNITY_SUBGROUPS_COMPLETE_METHOD,
        input: {
          chatId: candidate.created.chatId,
          title: candidate.created.title,
          ...(answers.description ? { description: answers.description } : {}),
          participantWids,
          participants: creatorReconciled.created.participants,
          parentCommunityWid: draft.parentCommunityWid
        }
      });
      await activeTransport.sendText(draft.chatId, t('official.community-subgroups.create.created', {
        title: result.created.title,
        chatId: result.created.chatId
      }));
    } catch (error) {
      await activeTransport.sendText(draft.chatId, t('official.community-subgroups.create.failed', {
        reason: errorMessage(error)
      }));
    }
    return true;
  });
}

async function updateTitle(context: PluginCommandContext, ctx: CommandContext) {
  if (!await scopedConfigEnabled(context, ctx)) {
    return { handled: true, text: ctx.t('official.community-subgroups.disabled') };
  }
  if (!await isCommunityChild(context, ctx)) {
    return { handled: true, text: ctx.t('official.community-subgroups.childOnly') };
  }
  const subject = ctx.command.rawArgs.trim();
  if (!subject) {
    return { handled: true, text: ctx.t('official.community-subgroups.titleUsage') };
  }
  const ownership = await resolveEventSubgroupOwnership(context, ctx);
  if (ownership.kind === 'owned') {
    return {
      handled: true,
      text: ctx.t('official.community-events.titleManaged', { eventId: ownership.eventId })
    };
  }
  if (ownership.kind === 'ambiguous') {
    return { handled: true, text: ctx.t('official.community-events.titleManagedAmbiguous') };
  }
  if (ownership.kind === 'unavailable') {
    return { handled: true, text: ctx.t('official.community-events.titleOwnershipUnavailable') };
  }
  return {
    handled: true,
    text: ctx.t('official.community-subgroups.titleQueued'),
    pluginActions: [{
      type: 'group.setSubject' as const,
      groupWid: ctx.groupWid!,
      subject,
      reason: 'community subgroup member title update'
    }]
  };
}

async function resolveEventSubgroupOwnership(
  context: PluginCommandContext,
  ctx: CommandContext
): Promise<EventSubgroupOwnershipResolveOutput | { kind: 'unavailable' }> {
  if (!context.services) {
    return { kind: 'unavailable' };
  }
  const scopeId = requireScopeId(ctx);
  try {
    return await context.services.call<EventSubgroupOwnershipResolveOutput>({
      serviceId: EVENT_SUBGROUP_OWNERSHIP_SERVICE_ID,
      method: EVENT_SUBGROUP_OWNERSHIP_RESOLVE_METHOD,
      scopeId,
      actorIdentityId: subgroupCommandActor(ctx).identityId,
      ...(ctx.groupId ? { groupId: ctx.groupId } : {}),
      groupWid: ctx.groupWid!,
      managementMode: ctx.managementMode,
      input: { subgroupChatId: ctx.groupWid! }
    });
  } catch (error) {
    context.logger?.warn({
      error,
      scopeId,
      subgroupChatId: ctx.groupWid
    }, 'Unable to resolve event ownership before subgroup title update');
    return { kind: 'unavailable' };
  }
}

async function updateDescription(context: PluginCommandContext, ctx: CommandContext) {
  if (!await scopedConfigEnabled(context, ctx)) {
    return { handled: true, text: ctx.t('official.community-subgroups.disabled') };
  }
  if (!await isCommunityChild(context, ctx)) {
    return { handled: true, text: ctx.t('official.community-subgroups.childOnly') };
  }
  const description = ctx.command.rawArgs.trim();
  if (!description) {
    return { handled: true, text: ctx.t('official.community-subgroups.descriptionUsage') };
  }
  return {
    handled: true,
    text: ctx.t('official.community-subgroups.descriptionQueued'),
    pluginActions: [{
      type: 'group.setDescription' as const,
      groupWid: ctx.groupWid!,
      description,
      reason: 'community subgroup member description update'
    }]
  };
}

async function startPinDurationFlow(context: PluginCommandContext, ctx: CommandContext) {
  const runtime = requirePluginStateContext(context);
  const scopeId = requireScopeId(ctx);
  const config = parseCommunitySubgroupsConfig(await runtime.configFor(scopeId, subgroupCommandActor(ctx).identityId));
  if (!config.enabled) {
    return { handled: true, text: ctx.t('official.community-subgroups.disabled') };
  }
  if (!await isCommunityChild(context, ctx)) {
    return { handled: true, text: ctx.t('official.community-subgroups.childOnly') };
  }
  if (!ctx.message.replyTo) {
    return { handled: true, text: ctx.t('official.community-subgroups.pinQuotedOnly') };
  }
  const messageId = ctx.message.replyTo.messageId;
  const actorWid = ctx.actor?.wid ?? ctx.message.senderWid;
  const definition = createPinDurationFlowDefinition({
    t: ctx.t,
    promptQuotedMessageId: ctx.message.id
  });
  registerPinDurationHandler(context, definition.flowType, ctx.t);
  await context.flowEngine.startFlow({
    definition,
    message: ctx.message,
    scopeId,
    initialData: { actorWid },
    onSessionCreated: async (session) => {
      const draft: PinDraft = {
        flowSessionId: session.id,
        flowType: definition.flowType,
        scopeId,
        ...(ctx.groupId ? { groupId: ctx.groupId } : {}),
        groupWid: ctx.groupWid!,
        chatId: ctx.message.chatId,
        actorWid,
        actorIdentityId: subgroupCommandActor(ctx).identityId,
        promptQuotedMessageId: ctx.message.id,
        messageId
      };
      await runtime.dataStore.set(pinDraftKey(scopeId, session.id), draft);
    },
    onSessionStartFailed: async (session) => {
      await runtime.dataStore.delete(pinDraftKey(scopeId, session.id));
    }
  });
  return { handled: true };
}

function registerPinDurationHandler(
  context: PluginCommandContext,
  flowType: string,
  t: CommandContext['t']
): void {
  const runtime = requirePluginStateContext(context);
  context.flowEngine.registerPromptHandler(pinDurationPurpose(flowType), async (lock, activeTransport) => {
    if (!lock.flowSessionId) {
      return false;
    }
    const snapshot = await context.flowEngine.getSessionSnapshot(lock.flowSessionId);
    if (!snapshot || snapshot.flowType !== flowType || !snapshot.scopeId) {
      return false;
    }
    const draft = await runtime.dataStore.get<PinDraft>(pinDraftKey(snapshot.scopeId, lock.flowSessionId));
    if (!draft) {
      return false;
    }
    await runtime.dataStore.delete(pinDraftKey(snapshot.scopeId, lock.flowSessionId));
    const durationSeconds = pinDurationSeconds(snapshot);
    if (!durationSeconds) {
      await activeTransport.sendText(draft.chatId, t('official.community-subgroups.pin.failed', {
        reason: t('official.community-subgroups.pin.failed.invalidDuration')
      }));
      return true;
    }
    const capabilities = await context.botCapabilitiesFor?.(draft.groupWid);
    if (capabilities && (!capabilities.botIsAdmin || !capabilities.canDeleteMessages)) {
      await activeTransport.sendText(draft.chatId, t('official.community-subgroups.pin.failed', {
        reason: !capabilities.botIsAdmin
          ? t('official.community-subgroups.pin.failed.botNotAdmin')
          : t('official.community-subgroups.pin.failed.unsupported')
      }));
      return true;
    }
    try {
      await activeTransport.pinMessage(draft.messageId, durationSeconds);
      await activeTransport.sendText(draft.chatId, t('official.community-subgroups.pin.done', {
        durationLabel: pinDurationLabel(durationSeconds, t)
      }), { quotedMessageId: draft.messageId });
    } catch (error) {
      context.logger?.warn({
        error,
        scopeId: draft.scopeId,
        groupWid: draft.groupWid,
        messageId: draft.messageId
      }, 'Unable to pin community subgroup message');
      await activeTransport.sendText(draft.chatId, t('official.community-subgroups.pin.failed', {
        reason: t('official.community-subgroups.pin.failed.transport')
      }));
    }
    return true;
  });
}

async function unpinQuotedMessage(context: PluginCommandContext, ctx: CommandContext) {
  if (!await scopedConfigEnabled(context, ctx)) {
    return { handled: true, text: ctx.t('official.community-subgroups.disabled') };
  }
  if (!await isCommunityChild(context, ctx)) {
    return { handled: true, text: ctx.t('official.community-subgroups.childOnly') };
  }
  if (!ctx.message.replyTo) {
    return { handled: true, text: ctx.t('official.community-subgroups.unpinQuotedOnly') };
  }
  return {
    handled: true,
    text: ctx.t('official.community-subgroups.unpinQueued'),
    pluginActions: [{
      type: 'message.unpin' as const,
      messageId: ctx.message.replyTo.messageId,
      reason: 'community subgroup member unpin request'
    }]
  };
}

async function scopedConfigEnabled(context: PluginCommandContext, ctx: CommandContext): Promise<boolean> {
  const runtime = requirePluginStateContext(context);
  const scopeId = requireScopeId(ctx);
  const config = parseCommunitySubgroupsConfig(await runtime.configFor(scopeId, subgroupCommandActor(ctx).identityId));
  return config.enabled;
}

function commandMetadata(input: {
  auditAction: string;
  usage: string;
  descriptionKey: string;
  topicId: 'create-subgroup' | 'edit-subgroup' | 'pin-messages';
  exampleKey: string;
}): CommandMetadata {
  return {
    ...GROUP_MEMBER_COMMAND,
    mutation: 'durable',
    dangerous: true,
    auditAction: input.auditAction,
    help: {
      familyKey: 'official.community-subgroups.help.family',
      featureId: 'subgroups',
      topicId: input.topicId,
      descriptionKey: input.descriptionKey,
      usage: input.usage,
      exampleKeys: [input.exampleKey],
      keywords: ['community', 'subgroup', input.topicId]
    },
    assistant: {
      intentTags: input.usage.replace(/^\//, '').split(/\s+/).filter(Boolean),
      executable: true,
      requiresConfirmation: true
    }
  };
}

function subgroupCommandActor(ctx: CommandContext) {
  if (!ctx.actor) {
    throw new Error('Community subgroup commands require an authoritative message actor.');
  }
  return requireStableIdentityAddress(ctx.actor);
}

async function resolveParentCommunityWid(
  context: PluginCommandContext,
  ctx: CommandContext,
  scopeId: string
): Promise<string | undefined> {
  const mapped = await context.communityGroupWidForScope?.(scopeId);
  if (mapped) {
    return mapped;
  }
  if (!ctx.groupWid) {
    return undefined;
  }
  const parent = await context.communityParentGroupWidForGroup?.(ctx.groupWid);
  if (parent) {
    return parent;
  }
  return ctx.groupWid;
}

async function isCommunityChild(context: PluginCommandContext, ctx: CommandContext): Promise<boolean> {
  if (!ctx.groupWid) {
    return false;
  }
  return await context.isCommunityChildGroup?.(ctx.groupWid) ?? false;
}

function registerFlowRecovery(context: PluginCommandContext): void {
  for (const kind of ['create', 'pin'] as const) {
    const prefix = `${COMMUNITY_SUBGROUPS_PLUGIN_ID}.${kind}.`;
    context.flowEngine.registerDefinitionResolver({
      ownerId: COMMUNITY_SUBGROUPS_PLUGIN_ID,
      flowTypePrefix: prefix,
      async resolve(session) {
        if (!session.scopeId || !session.flowType.startsWith(prefix) || session.flowType === prefix) {
          return undefined;
        }
        const runtime = requirePluginStateContext(context);
        if (kind === 'create') {
          const draft = await runtime.dataStore.get<SubgroupDraft>(subgroupDraftKey(session.scopeId, session.id));
          if (!draftMatchesSession(draft, session) || draft.actorIdentityId !== session.identityId) {
            return undefined;
          }
          const t = await context.i18n.translatorForIdentity(session.identityId, session.scopeId);
          registerSubgroupFlowCompletionHandler(context, session.flowType, t);
          return createSubgroupFlowDefinition({ t, flowType: session.flowType });
        }
        const draft = await runtime.dataStore.get<PinDraft>(pinDraftKey(session.scopeId, session.id));
        if (!draftMatchesSession(draft, session)
          || (draft.actorIdentityId !== undefined && draft.actorIdentityId !== session.identityId)) {
          return undefined;
        }
        const t = await context.i18n.translatorForIdentity(session.identityId, session.scopeId);
        registerPinDurationHandler(context, session.flowType, t);
        return createPinDurationFlowDefinition({ t, flowType: session.flowType, promptQuotedMessageId: draft.promptQuotedMessageId });
      }
    });
  }
}

function draftMatchesSession<T extends SubgroupDraft | PinDraft>(draft: T | undefined, session: FlowSessionSnapshot): draft is T {
  return Boolean(draft && draft.flowSessionId === session.id && draft.flowType === session.flowType
    && draft.scopeId === session.scopeId && draft.chatId === session.chatId);
}

function subgroupDraftKey(scopeId: string, flowSessionId: string): string {
  return `community-subgroup-draft:${scopeId}:${flowSessionId}`;
}

function pinDraftKey(scopeId: string, flowSessionId: string): string {
  return `community-subgroup-pin:${scopeId}:${flowSessionId}`;
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
