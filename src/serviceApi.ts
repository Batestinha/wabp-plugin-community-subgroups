import { z } from 'zod';
import { communitySubgroupCreationPolicySchema } from './creationPolicy';

export const COMMUNITY_SUBGROUPS_SERVICE_ID = 'official.community-subgroups.v1';
export const COMMUNITY_SUBGROUPS_CREATE_METHOD = 'createManagedSubgroup';
export const COMMUNITY_SUBGROUPS_CREATE_TIMEOUT_MS = 120_000;
export const COMMUNITY_SUBGROUPS_RESUME_METHOD = 'resumeManagedSubgroup';
export const COMMUNITY_SUBGROUPS_RESUME_TIMEOUT_MS = 120_000;

const createdGroupParticipantResultSchema = z.object({
  statusCode: z.number().int().optional(),
  message: z.string().optional(),
  isGroupCreator: z.boolean(),
  isInviteV4Sent: z.boolean()
}).strict();

const createdGroupSchema = z.object({
  chatId: z.string().min(1),
  title: z.string(),
  participants: z.record(createdGroupParticipantResultSchema)
}).strict();

export const communitySubgroupCreateInputSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  participantWids: z.array(z.string().min(1)).min(1),
  parentCommunityWid: z.string().min(1),
  creationPolicy: communitySubgroupCreationPolicySchema.optional()
}).strict();

export const communitySubgroupCreateOutputSchema = z.object({
  created: createdGroupSchema,
  participantCount: z.number().int().nonnegative().optional()
}).strict();

export const communitySubgroupResumeInputSchema = z.object({
  chatId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  participantWids: z.array(z.string().min(1)).min(1),
  participants: z.record(createdGroupParticipantResultSchema).optional(),
  parentCommunityWid: z.string().min(1)
}).strict();

export const communitySubgroupResumeOutputSchema = communitySubgroupCreateOutputSchema;

export type CommunitySubgroupCreateInput = z.infer<typeof communitySubgroupCreateInputSchema>;
export type CommunitySubgroupCreateOutput = z.infer<typeof communitySubgroupCreateOutputSchema>;
export type CommunitySubgroupResumeInput = z.infer<typeof communitySubgroupResumeInputSchema>;
export type CommunitySubgroupResumeOutput = z.infer<typeof communitySubgroupResumeOutputSchema>;
