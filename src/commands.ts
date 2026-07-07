import type { CommandMetadata } from '../../../adminBot/router/commandMetadata';
import type { CommandContext } from '../../../adminBot/router/commandRouter';
import type { PluginCommandContext } from '../../../platform/pluginRuntime/types';
import { requireOfficialCommandRuntime, requireScopeId } from '../shared';
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

interface SubgroupDraft {
  flowSessionId: string;
  flowType: string;
  scopeId: string;
  groupId?: string | undefined;
  groupWid?: string | undefined;
  chatId: string;
  actorWid: string;
  parentCommunityWid: string;
  autoSendInviteV4: boolean;
  maxParticipants: number;
}

interface PinDraft {
  flowSessionId: string;
  flowType: string;
  scopeId: string;
  groupId?: string | undefined;
  groupWid: string;
  chatId: string;
  actorWid: string;
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

  router.register('subgroup', 'create', commandMetadata({
    auditAction: 'community_subgroups.create',
    usage: '/subgroup create',
    descriptionKey: 'official.community-subgroups.help.create'
  }), async (ctx) => startCreateFlow(context, ctx));

  router.register('title', '*', commandMetadata({
    auditAction: 'community_subgroups.title',
    usage: '/title new group title',
    descriptionKey: 'official.community-subgroups.help.title'
  }), async (ctx) => updateTitle(context, ctx));

  router.register('description', '*', commandMetadata({
    auditAction: 'community_subgroups.description',
    usage: '/description new group description',
    descriptionKey: 'official.community-subgroups.help.description'
  }), async (ctx) => updateDescription(context, ctx));

  router.register('pin', '*', commandMetadata({
    auditAction: 'community_subgroups.pin',
    usage: '/pin',
    descriptionKey: 'official.community-subgroups.help.pin'
  }), async (ctx) => startPinDurationFlow(context, ctx));

  router.register('unpin', '*', commandMetadata({
    auditAction: 'community_subgroups.unpin',
    usage: '/unpin',
    descriptionKey: 'official.community-subgroups.help.unpin'
  }), async (ctx) => unpinQuotedMessage(context, ctx));
}

async function startCreateFlow(context: PluginCommandContext, ctx: CommandContext) {
  const runtime = requireOfficialCommandRuntime(context);
  const scopeId = requireScopeId(ctx);
  const config = parseCommunitySubgroupsConfig(await runtime.configFor(scopeId, ctx.message.senderWid));
  if (!config.enabled) {
    return { handled: true, text: ctx.t('official.community-subgroups.disabled') };
  }
  const parentCommunityWid = await resolveParentCommunityWid(context, ctx, scopeId);
  if (!parentCommunityWid) {
    return { handled: true, text: ctx.t('official.community-subgroups.parentMissing') };
  }

  const definition = createSubgroupFlowDefinition({ t: ctx.t });
  registerSubgroupFlowCompletionHandler(context, definition.flowType, ctx.t);
  const flowSessionId = await context.flowEngine.startFlow({
    definition,
    message: ctx.message,
    scopeId
  });
  const draft: SubgroupDraft = {
    flowSessionId,
    flowType: definition.flowType,
    scopeId,
    ...(ctx.groupId ? { groupId: ctx.groupId } : {}),
    ...(ctx.groupWid ? { groupWid: ctx.groupWid } : {}),
    chatId: ctx.message.chatId,
    actorWid: ctx.actor?.wid ?? ctx.message.senderWid,
    parentCommunityWid,
    autoSendInviteV4: config.autoSendInviteV4,
    maxParticipants: config.maxParticipants
  };
  await runtime.dataStore.set(subgroupDraftKey(scopeId, flowSessionId), draft);
  return { handled: true, text: ctx.t('official.community-subgroups.create.started') };
}

function registerSubgroupFlowCompletionHandler(
  context: PluginCommandContext,
  flowType: string,
  t: CommandContext['t']
): void {
  const runtime = requireOfficialCommandRuntime(context);
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
    if (!answers || !context.createManagedCommunitySubgroup) {
      await activeTransport.sendText(draft.chatId, t('official.community-subgroups.create.invalid'));
      return true;
    }
    const participantWids = unique([draft.actorWid, ...answers.participantWids]);
    if (participantWids.length > draft.maxParticipants) {
      await activeTransport.sendText(draft.chatId, t('official.community-subgroups.create.failed', {
        reason: `member count exceeds configured maximum ${draft.maxParticipants}`
      }));
      return true;
    }
    try {
      const result = await context.createManagedCommunitySubgroup({
        scopeId: draft.scopeId,
        actorWid: draft.actorWid,
        title: answers.title,
        ...(answers.description ? { description: answers.description } : {}),
        participantWids,
        parentCommunityWid: draft.parentCommunityWid,
        autoSendInviteV4: draft.autoSendInviteV4
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
  const runtime = requireOfficialCommandRuntime(context);
  const scopeId = requireScopeId(ctx);
  const config = parseCommunitySubgroupsConfig(await runtime.configFor(scopeId, ctx.message.senderWid));
  if (!config.enabled) {
    return { handled: true, text: ctx.t('official.community-subgroups.disabled') };
  }
  if (!await isCommunityChild(context, ctx)) {
    return { handled: true, text: ctx.t('official.community-subgroups.childOnly') };
  }
  if (!ctx.message.quotedMsgId) {
    return { handled: true, text: ctx.t('official.community-subgroups.pinQuotedOnly') };
  }
  const actorWid = ctx.actor?.wid ?? ctx.message.senderWid;
  const definition = createPinDurationFlowDefinition({ t: ctx.t, actorWid });
  registerPinDurationHandler(context, definition.flowType, ctx.t);
  const flowSessionId = await context.flowEngine.startFlow({
    definition,
    message: ctx.message,
    scopeId,
    initialData: { actorWid }
  });
  const draft: PinDraft = {
    flowSessionId,
    flowType: definition.flowType,
    scopeId,
    ...(ctx.groupId ? { groupId: ctx.groupId } : {}),
    groupWid: ctx.groupWid!,
    chatId: ctx.message.chatId,
    actorWid,
    messageId: ctx.message.quotedMsgId
  };
  await runtime.dataStore.set(pinDraftKey(scopeId, flowSessionId), draft);
  return { handled: true, text: ctx.t('official.community-subgroups.pin.started') };
}

function registerPinDurationHandler(
  context: PluginCommandContext,
  flowType: string,
  t: CommandContext['t']
): void {
  const runtime = requireOfficialCommandRuntime(context);
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
        reason: 'invalid duration'
      }));
      return true;
    }
    const capabilities = await context.botCapabilitiesFor?.(draft.groupWid);
    if (capabilities && (!capabilities.botIsAdmin || !capabilities.canDeleteMessages)) {
      await activeTransport.sendText(draft.chatId, t('official.community-subgroups.pin.failed', {
        reason: !capabilities.botIsAdmin ? 'bot is not a group admin' : 'bot cannot pin messages'
      }));
      return true;
    }
    try {
      await activeTransport.pinMessage(draft.messageId, durationSeconds);
      await activeTransport.sendText(draft.chatId, t('official.community-subgroups.pin.done', {
        durationLabel: pinDurationLabel(durationSeconds)
      }), { quotedMessageId: draft.messageId });
    } catch (error) {
      await activeTransport.sendText(draft.chatId, t('official.community-subgroups.pin.failed', {
        reason: errorMessage(error)
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
  if (!ctx.message.quotedMsgId) {
    return { handled: true, text: ctx.t('official.community-subgroups.unpinQuotedOnly') };
  }
  return {
    handled: true,
    text: ctx.t('official.community-subgroups.unpinQueued'),
    pluginActions: [{
      type: 'message.unpin' as const,
      messageId: ctx.message.quotedMsgId,
      reason: 'community subgroup member unpin request'
    }]
  };
}

async function scopedConfigEnabled(context: PluginCommandContext, ctx: CommandContext): Promise<boolean> {
  const runtime = requireOfficialCommandRuntime(context);
  const scopeId = requireScopeId(ctx);
  const config = parseCommunitySubgroupsConfig(await runtime.configFor(scopeId, ctx.message.senderWid));
  return config.enabled;
}

function commandMetadata(input: {
  auditAction: string;
  usage: string;
  descriptionKey: string;
}): CommandMetadata {
  return {
    ...GROUP_MEMBER_COMMAND,
    mutation: 'durable',
    dangerous: true,
    auditAction: input.auditAction,
    help: {
      familyKey: 'official.community-subgroups.help.family',
      descriptionKey: input.descriptionKey,
      usage: input.usage
    },
    assistant: {
      intentTags: input.usage.replace(/^\//, '').split(/\s+/).filter(Boolean),
      executable: true,
      requiresConfirmation: true
    }
  };
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
