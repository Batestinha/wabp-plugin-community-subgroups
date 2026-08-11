import { z } from 'zod';

export const communitySubgroupPermissionSchema = z.enum(['all_members', 'admins_only']);
export const communitySubgroupCommunityPermissionSchema = z.enum(['everyone', 'community_admins']);
export const communitySubgroupDisappearingMessagesSchema = z.enum(['off', '24h', '7d', '90d']);

export const communitySubgroupCreationPolicySchema = z.object({
  infoEditPermission: communitySubgroupPermissionSchema.default('admins_only'),
  sendMessagesPermission: communitySubgroupPermissionSchema.default('all_members'),
  memberAddPermission: communitySubgroupPermissionSchema.default('all_members'),
  joinApproval: z.boolean().default(false),
  disappearingMessages: communitySubgroupDisappearingMessagesSchema.default('off'),
  parentGroupCreatePermission: communitySubgroupCommunityPermissionSchema.default('community_admins'),
  parentMemberAddPermission: communitySubgroupCommunityPermissionSchema.default('everyone')
}).default({});

export type CommunitySubgroupCreationPolicy = z.infer<typeof communitySubgroupCreationPolicySchema>;
export type CommunitySubgroupPermission = z.infer<typeof communitySubgroupPermissionSchema>;
export type CommunitySubgroupCommunityPermission = z.infer<typeof communitySubgroupCommunityPermissionSchema>;
export type CommunitySubgroupDisappearingMessages = z.infer<typeof communitySubgroupDisappearingMessagesSchema>;

export const defaultCommunitySubgroupCreationPolicy: CommunitySubgroupCreationPolicy =
  communitySubgroupCreationPolicySchema.parse({});

export function parseCommunitySubgroupCreationPolicy(input: unknown): CommunitySubgroupCreationPolicy {
  return communitySubgroupCreationPolicySchema.parse(input);
}

export function communitySubgroupDisappearingMessageSeconds(value: CommunitySubgroupDisappearingMessages): number {
  switch (value) {
    case '24h':
      return 86_400;
    case '7d':
      return 604_800;
    case '90d':
      return 7_776_000;
    case 'off':
      return 0;
  }
}
