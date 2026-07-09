import { z } from 'zod';
import { communitySubgroupCreationPolicySchema } from './creationPolicy';

export const communitySubgroupsConfigSchema = z.object({
  enabled: z.boolean().default(true),
  maxParticipants: z.number().int().positive().max(256).default(128),
  creationPolicy: communitySubgroupCreationPolicySchema
}).default({});

export type CommunitySubgroupsConfig = z.infer<typeof communitySubgroupsConfigSchema>;

export function parseCommunitySubgroupsConfig(input: unknown): CommunitySubgroupsConfig {
  return communitySubgroupsConfigSchema.parse(input);
}
