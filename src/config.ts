import { z } from 'zod';

export const communitySubgroupsConfigSchema = z.object({
  enabled: z.boolean().default(true),
  autoSendInviteV4: z.boolean().default(true),
  maxParticipants: z.number().int().positive().max(256).default(128)
}).default({});

export type CommunitySubgroupsConfig = z.infer<typeof communitySubgroupsConfigSchema>;

export function parseCommunitySubgroupsConfig(input: unknown): CommunitySubgroupsConfig {
  return communitySubgroupsConfigSchema.parse(input);
}
