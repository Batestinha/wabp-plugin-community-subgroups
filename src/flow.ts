import { randomUUID } from 'node:crypto';
import type { FlowDefinition } from '@wabs/plugin-sdk/flow-types';
import type { FlowSessionSnapshot } from '@wabs/plugin-sdk/flow-engine';
import type { TranslateFn } from '@wabs/plugin-sdk/i18n';

export const SUBGROUP_CONFIRM_STEP_ID = 'confirm';
export const PIN_DURATION_STEP_ID = 'duration';

export const PIN_DURATION_OPTIONS = [
  { id: '24h', labelKey: 'official.community-subgroups.pin.duration.24h', seconds: 86_400 },
  { id: '7d', labelKey: 'official.community-subgroups.pin.duration.7d', seconds: 604_800 },
  { id: '30d', labelKey: 'official.community-subgroups.pin.duration.30d', seconds: 2_592_000 }
] as const;

export interface SubgroupFlowAnswers {
  title: string;
  description?: string | undefined;
  participantReferences: string[];
}

export function createSubgroupFlowDefinition(input: {
  t: TranslateFn;
  flowType?: string | undefined;
}): FlowDefinition {
  const flowType = input.flowType ?? `official.community-subgroups.create.${randomUUID()}`;
  return {
    flowType,
    t: input.t,
    initialStepId: 'title',
    context: 'group',
    timeoutMinutes: 30,
    completionReply: input.t('official.community-subgroups.flow.complete'),
    steps: {
      title: {
        id: 'title',
        kind: 'text',
        prompt: input.t('official.community-subgroups.flow.title'),
        nextStepId: 'description',
        resolveInput: ({ input: value }) => {
          const title = value.trim();
          return title
            ? { status: 'use-value', value: title }
            : { status: 'error', reply: input.t('official.community-subgroups.flow.titleInvalid') };
        }
      },
      description: {
        id: 'description',
        kind: 'text',
        prompt: input.t('official.community-subgroups.flow.description'),
        nextStepId: 'members',
        resolveInput: ({ input: value }) => ({
          status: 'use-value',
          value: ['-', 'skip', 'none'].includes(value.trim().toLowerCase()) ? '' : value.trim()
        })
      },
      members: {
        id: 'members',
        kind: 'text',
        prompt: input.t('official.community-subgroups.flow.members'),
        nextStepId: SUBGROUP_CONFIRM_STEP_ID,
        resolveInput: ({ input: value, message }) => {
          const participantReferences = parseParticipantReferences(
            value,
            [...new Set((message?.mentions ?? []).map((mention) => mention.wid))]
          );
          return participantReferences.length > 0
            ? { status: 'use-value', value: participantReferences }
            : { status: 'error', reply: input.t('official.community-subgroups.flow.membersInvalid') };
        }
      },
      [SUBGROUP_CONFIRM_STEP_ID]: {
        id: SUBGROUP_CONFIRM_STEP_ID,
        kind: 'choice',
        prompt: input.t('official.community-subgroups.flow.confirm', {
          title: '',
          description: '',
          memberCount: '0'
        }),
        promptForState: (state) => {
          const answers = subgroupFlowAnswersFromData(state.data);
          return input.t('official.community-subgroups.flow.confirm', {
            title: answers?.title ?? '',
            description: answers?.description || 'none',
            memberCount: String(answers?.participantReferences.length ?? 0)
          });
        },
        options: [
          { label: input.t('official.community-subgroups.flow.yes'), value: 'yes' },
          { label: input.t('official.community-subgroups.flow.no'), value: 'no' }
        ],
        minSelections: 1,
        maxSelections: 1
      }
    }
  };
}

export function createPinDurationFlowDefinition(input: {
  t: TranslateFn;
  flowType?: string | undefined;
  promptQuotedMessageId?: string | undefined;
}): FlowDefinition {
  const flowType = input.flowType ?? `official.community-subgroups.pin.${randomUUID()}`;
  return {
    flowType,
    t: input.t,
    initialStepId: PIN_DURATION_STEP_ID,
    context: 'group',
    timeoutMinutes: 10,
    completionReply: false,
    steps: {
      [PIN_DURATION_STEP_ID]: {
        id: PIN_DURATION_STEP_ID,
        kind: 'choice',
        prompt: input.t('official.community-subgroups.pin.prompt'),
        ...(input.promptQuotedMessageId ? {
          promptSendOptionsForState: () => ({
            quotedMessageId: input.promptQuotedMessageId
          })
        } : {}),
        options: PIN_DURATION_OPTIONS.map((option) => ({
          label: input.t(option.labelKey),
          value: option.seconds
        })),
        minSelections: 1,
        maxSelections: 1
      }
    }
  };
}

export function subgroupConfirmPurpose(flowType: string): string {
  return `flow.${flowType}.${SUBGROUP_CONFIRM_STEP_ID}`;
}

export function pinDurationPurpose(flowType: string): string {
  return `flow.${flowType}.${PIN_DURATION_STEP_ID}`;
}

export function subgroupFlowConfirmed(snapshot: FlowSessionSnapshot): boolean {
  const value = snapshot.state.data[SUBGROUP_CONFIRM_STEP_ID];
  return Array.isArray(value) ? value.includes('yes') : value === 'yes';
}

export function subgroupFlowAnswers(snapshot: FlowSessionSnapshot): SubgroupFlowAnswers | undefined {
  return subgroupFlowAnswersFromData(snapshot.state.data);
}

export function pinDurationSeconds(snapshot: FlowSessionSnapshot): number | undefined {
  const raw = snapshot.state.data[PIN_DURATION_STEP_ID];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === 'number' && PIN_DURATION_OPTIONS.some((option) => option.seconds === value)
    ? value
    : undefined;
}

export function pinDurationLabel(seconds: number, t: TranslateFn): string {
  const option = PIN_DURATION_OPTIONS.find((candidate) => candidate.seconds === seconds);
  return option ? t(option.labelKey) : `${seconds} seconds`;
}

export function parseParticipantReferences(input: string, mentionedWids: string[] = []): string[] {
  const spacedPhoneReferences = phoneReferencesFromSpacedInternationalNumbers(input);
  const tokenReferences = input
    .split(/[\s,;]+/)
    .flatMap((token) => normalizeParticipantToken(token));
  return unique([...mentionedWids, ...tokenReferences, ...spacedPhoneReferences]);
}

function subgroupFlowAnswersFromData(data: Record<string, unknown>): SubgroupFlowAnswers | undefined {
  const title = typeof data.title === 'string' ? data.title.trim() : '';
  const description = typeof data.description === 'string' ? data.description.trim() : '';
  const participantReferences = Array.isArray(data.members)
    ? data.members.flatMap((value) => (typeof value === 'string' ? [value] : []))
    : [];
  if (!title || participantReferences.length === 0) {
    return undefined;
  }
  return {
    title,
    ...(description ? { description } : {}),
    participantReferences: unique(participantReferences)
  };
}

function normalizeParticipantToken(raw: string): string[] {
  const token = raw.trim().replace(/^@+/, '').replace(/[.,;:]+$/g, '');
  if (!token) {
    return [];
  }
  if (/^[A-Za-z0-9._-]+@(c\.us|s\.whatsapp\.net|lid)$/.test(token)) {
    return [token];
  }
  const digits = token.replace(/[^\d]/g, '');
  if (digits.length >= 7 && digits.length <= 15) {
    return [`+${digits}`];
  }
  return [];
}

function phoneReferencesFromSpacedInternationalNumbers(input: string): string[] {
  const matches = input.match(/\+\s*\d(?:[\d\s().-]{5,}\d)/g) ?? [];
  return matches.flatMap((match) => {
    const digits = match.replace(/[^\d]/g, '');
    return digits.length >= 7 && digits.length <= 15 ? [`+${digits}`] : [];
  });
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
