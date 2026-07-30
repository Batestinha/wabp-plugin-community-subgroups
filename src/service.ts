import type { PluginServiceRegistrationContext } from '../../../platform/pluginRuntime/types';
import type { PluginServiceRegistration } from '../../../platform/pluginRuntime/pluginServices';
import { parseCommunitySubgroupsConfig } from './config';
import {
  COMMUNITY_SUBGROUPS_CREATE_METHOD,
  COMMUNITY_SUBGROUPS_CREATE_TIMEOUT_MS,
  COMMUNITY_SUBGROUPS_RESUME_METHOD,
  COMMUNITY_SUBGROUPS_RESUME_TIMEOUT_MS,
  COMMUNITY_SUBGROUPS_SERVICE_ID,
  type CommunitySubgroupCreateInput,
  type CommunitySubgroupResumeInput,
  communitySubgroupCreateInputSchema,
  communitySubgroupCreateOutputSchema,
  communitySubgroupResumeInputSchema,
  communitySubgroupResumeOutputSchema
} from './serviceApi';

export function registerCommunitySubgroupServices(
  context: PluginServiceRegistrationContext
): PluginServiceRegistration[] {
  return [{
    serviceId: COMMUNITY_SUBGROUPS_SERVICE_ID,
    methods: [
      {
        name: COMMUNITY_SUBGROUPS_CREATE_METHOD,
        access: 'mutation',
        timeoutMs: COMMUNITY_SUBGROUPS_CREATE_TIMEOUT_MS,
        inputSchema: communitySubgroupCreateInputSchema,
        outputSchema: communitySubgroupCreateOutputSchema,
        async handler(rawInput, call) {
          const input = rawInput as CommunitySubgroupCreateInput;
          const createManagedCommunitySubgroup = context.platform.communityOperations?.createManagedCommunitySubgroup;
          if (!createManagedCommunitySubgroup) {
            throw new Error('Managed community subgroup creation is unavailable in this runtime.');
          }
          if (!call.actorWid) {
            throw new Error('Managed community subgroup creation requires an actor.');
          }

          const config = parseCommunitySubgroupsConfig(await context.configFor(call.scopeId, call.actorWid));
          if (!config.enabled) {
            throw new Error('official.community-subgroups is disabled for this scope.');
          }
          const participantWids = unique(input.participantWids);
          if (participantWids.length > config.maxParticipants) {
            throw new Error(`member count exceeds configured maximum ${config.maxParticipants}`);
          }

          return createManagedCommunitySubgroup({
            scopeId: call.scopeId,
            actorWid: call.actorWid,
            title: input.title,
            ...(input.description ? { description: input.description } : {}),
            participantWids,
            parentCommunityWid: input.parentCommunityWid,
            creationPolicy: input.creationPolicy ?? config.creationPolicy
          });
        }
      },
      {
        name: COMMUNITY_SUBGROUPS_RESUME_METHOD,
        access: 'mutation',
        timeoutMs: COMMUNITY_SUBGROUPS_RESUME_TIMEOUT_MS,
        inputSchema: communitySubgroupResumeInputSchema,
        outputSchema: communitySubgroupResumeOutputSchema,
        async handler(rawInput, call) {
          const input = rawInput as CommunitySubgroupResumeInput;
          const resumeManagedSubgroup = context.platform.communityOperations?.resumeManagedSubgroup;
          if (!resumeManagedSubgroup) {
            throw new Error('Managed community subgroup resumption is unavailable in this runtime.');
          }
          if (!call.actorWid) {
            throw new Error('Managed community subgroup resumption requires an actor.');
          }

          const config = parseCommunitySubgroupsConfig(await context.configFor(call.scopeId, call.actorWid));
          if (!config.enabled) {
            throw new Error('official.community-subgroups is disabled for this scope.');
          }
          const participantWids = unique(input.participantWids);
          if (participantWids.length > config.maxParticipants) {
            throw new Error(`member count exceeds configured maximum ${config.maxParticipants}`);
          }

          return resumeManagedSubgroup({
            scopeId: call.scopeId,
            actorWid: call.actorWid,
            chatId: input.chatId,
            title: input.title,
            ...(input.description ? { description: input.description } : {}),
            participantWids,
            ...(input.participants ? { participants: input.participants } : {}),
            parentCommunityWid: input.parentCommunityWid,
            creationPolicy: config.creationPolicy
          });
        }
      }
    ]
  }];
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
