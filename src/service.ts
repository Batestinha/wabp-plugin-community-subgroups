import type { PluginServiceRegistrationContext } from '../../../platform/pluginRuntime/types';
import type { PluginServiceRegistration } from '../../../platform/pluginRuntime/pluginServices';
import { parseCommunitySubgroupsConfig } from './config';
import {
  COMMUNITY_SUBGROUPS_CANDIDATE_METHOD,
  COMMUNITY_SUBGROUPS_CANDIDATE_TIMEOUT_MS,
  COMMUNITY_SUBGROUPS_CONFIGURE_METHOD,
  COMMUNITY_SUBGROUPS_CONFIGURE_TIMEOUT_MS,
  COMMUNITY_SUBGROUPS_COMPLETE_METHOD,
  COMMUNITY_SUBGROUPS_COMPLETE_TIMEOUT_MS,
  COMMUNITY_SUBGROUPS_SERVICE_ID,
  type CommunitySubgroupCandidateInput,
  type CommunitySubgroupConfigureInput,
  type CommunitySubgroupCompleteInput,
  communitySubgroupCandidateInputSchema,
  communitySubgroupCandidateOutputSchema,
  communitySubgroupConfigureInputSchema,
  communitySubgroupConfigureOutputSchema,
  communitySubgroupCompleteInputSchema,
  communitySubgroupCompleteOutputSchema
} from './serviceApi';

export function registerCommunitySubgroupServices(
  context: PluginServiceRegistrationContext
): PluginServiceRegistration[] {
  return [{
    serviceId: COMMUNITY_SUBGROUPS_SERVICE_ID,
    methods: [
      {
        name: COMMUNITY_SUBGROUPS_CANDIDATE_METHOD,
        access: 'mutation',
        timeoutMs: COMMUNITY_SUBGROUPS_CANDIDATE_TIMEOUT_MS,
        inputSchema: communitySubgroupCandidateInputSchema,
        outputSchema: communitySubgroupCandidateOutputSchema,
        async handler(rawInput, call) {
          const input = rawInput as CommunitySubgroupCandidateInput;
          const createCandidate = context.platform.communityOperations
            ?.createManagedCommunitySubgroupCandidate;
          if (!createCandidate) {
            throw new Error('Managed community subgroup candidate creation is unavailable in this runtime.');
          }
          if (!call.actorIdentityId) {
            throw new Error('Managed community subgroup candidate creation requires an actor.');
          }
          const config = parseCommunitySubgroupsConfig(
            await context.configFor(call.scopeId, call.actorIdentityId)
          );
          if (!config.enabled) {
            throw new Error('official.community-subgroups is disabled for this scope.');
          }
          return createCandidate({
            scopeId: call.scopeId,
            title: input.title,
            parentCommunityWid: input.parentCommunityWid
          });
        }
      },
      {
        name: COMMUNITY_SUBGROUPS_CONFIGURE_METHOD,
        access: 'mutation',
        timeoutMs: COMMUNITY_SUBGROUPS_CONFIGURE_TIMEOUT_MS,
        inputSchema: communitySubgroupConfigureInputSchema,
        outputSchema: communitySubgroupConfigureOutputSchema,
        async handler(rawInput, call) {
          const input = rawInput as CommunitySubgroupConfigureInput;
          const configureCandidate = context.platform.communityOperations
            ?.configureManagedCommunitySubgroup;
          if (!configureCandidate) {
            throw new Error('Managed community subgroup configuration is unavailable in this runtime.');
          }
          if (!call.actorIdentityId) {
            throw new Error('Managed community subgroup configuration requires an actor.');
          }
          const config = parseCommunitySubgroupsConfig(
            await context.configFor(call.scopeId, call.actorIdentityId)
          );
          if (!config.enabled) {
            throw new Error('official.community-subgroups is disabled for this scope.');
          }
          return configureCandidate({
            scopeId: call.scopeId,
            chatId: input.chatId,
            title: input.title,
            ...(input.description ? { description: input.description } : {}),
            ...(input.participants ? { participants: input.participants } : {}),
            parentCommunityWid: input.parentCommunityWid,
            creationPolicy: config.creationPolicy
          });
        }
      },
      {
        name: COMMUNITY_SUBGROUPS_COMPLETE_METHOD,
        access: 'mutation',
        timeoutMs: COMMUNITY_SUBGROUPS_COMPLETE_TIMEOUT_MS,
        inputSchema: communitySubgroupCompleteInputSchema,
        outputSchema: communitySubgroupCompleteOutputSchema,
        async handler(rawInput, call) {
          const input = rawInput as CommunitySubgroupCompleteInput;
          const completeManagedCommunitySubgroup = context.platform.communityOperations
            ?.completeManagedCommunitySubgroup;
          if (!completeManagedCommunitySubgroup) {
            throw new Error('Managed community subgroup completion is unavailable in this runtime.');
          }
          if (!call.actorIdentityId) {
            throw new Error('Managed community subgroup completion requires an actor.');
          }

          const config = parseCommunitySubgroupsConfig(await context.configFor(call.scopeId, call.actorIdentityId));
          if (!config.enabled) {
            throw new Error('official.community-subgroups is disabled for this scope.');
          }
          const participantWids = uniqueParticipantReferences(input.participantWids);
          const attemptedParticipantWids = participantWids.slice(0, config.maxParticipants);
          const omittedParticipantOutcomes = Object.fromEntries(
            participantWids.slice(config.maxParticipants).map((participantWid) => {
              const persisted = input.participants?.[participantWid];
              return [
                participantWid,
                {
                  ...(persisted?.statusCode !== undefined ? { statusCode: persisted.statusCode } : {}),
                  message: `Participant reconciliation omitted by configured maximum ${config.maxParticipants}.`,
                  isGroupCreator: persisted?.isGroupCreator ?? false,
                  isInviteV4Sent: persisted?.isInviteV4Sent ?? false
                }
              ];
            })
          );

          return completeManagedCommunitySubgroup({
            scopeId: call.scopeId,
            chatId: input.chatId,
            title: input.title,
            ...(input.description ? { description: input.description } : {}),
            participantWids: attemptedParticipantWids,
            participants: {
              ...(input.participants ?? {}),
              ...omittedParticipantOutcomes
            },
            parentCommunityWid: input.parentCommunityWid,
            creationPolicy: config.creationPolicy
          });
        }
      }
    ]
  }];
}

function uniqueParticipantReferences(references: string[]): string[] {
  return [...new Set(references.map((reference) => reference.trim()).filter(Boolean))];
}
