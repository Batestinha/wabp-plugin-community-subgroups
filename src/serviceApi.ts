import { z } from 'zod';

export const COMMUNITY_SUBGROUPS_SERVICE_ID = 'official.community-subgroups.v1';
export const COMMUNITY_SUBGROUPS_CANDIDATE_METHOD = 'createManagedSubgroupCandidate';
export const COMMUNITY_SUBGROUPS_CANDIDATE_TIMEOUT_MS = 120_000;
export const COMMUNITY_SUBGROUPS_CONFIGURE_METHOD = 'configureManagedSubgroup';
export const COMMUNITY_SUBGROUPS_CONFIGURE_TIMEOUT_MS = 120_000;
export const COMMUNITY_SUBGROUPS_COMPLETE_METHOD = 'completeManagedSubgroup';
export const COMMUNITY_SUBGROUPS_COMPLETE_TIMEOUT_MS = 120_000;

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

const createdGroupCandidateSchema = createdGroupSchema.extend({
  intendedParentCommunityJid: z.string().min(1)
}).strict();

export const communitySubgroupCandidateInputSchema = z.object({
  title: z.string().min(1),
  parentCommunityWid: z.string().min(1)
}).strict();

export const communitySubgroupCandidateOutputSchema = z.object({
  created: createdGroupCandidateSchema
}).strict();

export const communitySubgroupConfigureInputSchema = z.object({
  chatId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  participants: z.record(createdGroupParticipantResultSchema).optional(),
  parentCommunityWid: z.string().min(1)
}).strict();

export const communitySubgroupConfigureOutputSchema = z.object({
  created: createdGroupSchema
}).strict();

export const communitySubgroupCompleteOutputSchema = z.object({
  created: createdGroupSchema,
  participantCount: z.number().int().nonnegative().optional()
}).strict();

export const communitySubgroupCompleteInputSchema = z.object({
  chatId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  participantWids: z.array(z.string().min(1)),
  participants: z.record(createdGroupParticipantResultSchema).optional(),
  parentCommunityWid: z.string().min(1)
}).strict();

export type CommunitySubgroupCandidateInput = z.infer<typeof communitySubgroupCandidateInputSchema>;
export type CommunitySubgroupCandidateOutput = z.infer<typeof communitySubgroupCandidateOutputSchema>;
export type CommunitySubgroupConfigureInput = z.infer<typeof communitySubgroupConfigureInputSchema>;
export type CommunitySubgroupConfigureOutput = z.infer<typeof communitySubgroupConfigureOutputSchema>;
export type CommunitySubgroupCompleteInput = z.infer<typeof communitySubgroupCompleteInputSchema>;
export type CommunitySubgroupCompleteOutput = z.infer<typeof communitySubgroupCompleteOutputSchema>;
