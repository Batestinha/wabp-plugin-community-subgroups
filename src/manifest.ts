import type { PluginManifest } from '../../../platform/pluginRuntime/manifest';
import { communitySubgroupsConfigSchema } from './config';
import { communitySubgroupsMessages } from './messages';
import {
  COMMUNITY_SUBGROUPS_CREATE_METHOD,
  COMMUNITY_SUBGROUPS_SERVICE_ID
} from './serviceApi';

export const COMMUNITY_SUBGROUPS_PLUGIN_ID = 'official.community-subgroups';

export const communitySubgroupsManifest: PluginManifest = {
  pluginId: COMMUNITY_SUBGROUPS_PLUGIN_ID,
  kind: 'managed_group',
  version: '0.1.0',
  coreApiRange: '>=0.2.0',
  messageNamespace: 'official.community-subgroups',
  descriptionKey: 'official.community-subgroups.description',
  defaultMessages: communitySubgroupsMessages,
  commands: [
    '/subgroup create',
    '/title',
    '/description',
    '/pin',
    '/unpin'
  ],
  services: [{
    serviceId: COMMUNITY_SUBGROUPS_SERVICE_ID,
    methods: [{
      name: COMMUNITY_SUBGROUPS_CREATE_METHOD,
      access: 'mutation'
    }]
  }],
  eventSubscriptions: [],
  requiredPermissions: [],
  requiredBotCapabilities: [],
  configSchema: communitySubgroupsConfigSchema,
  dangerousActions: [
    'group.setSubject',
    'group.setDescription',
    'message.pin',
    'message.unpin'
  ],
  backgroundJobs: [],
  cancellation: {
    workflows: [
      {
        id: 'subgroup-create',
        description: 'Guided subgroup creation before the managed group is created.',
        mode: 'core-flow',
        scope: 'actor-chat',
        commands: ['/subgroup create'],
        cancellableStates: ['active'],
        terminalStates: ['completed', 'cancelled', 'expired'],
        effects: ['discard-subgroup-draft']
      },
      {
        id: 'pin-duration',
        description: 'Guided pin-duration choice before a quoted message is pinned.',
        mode: 'core-flow',
        scope: 'actor-chat',
        commands: ['/pin'],
        cancellableStates: ['active'],
        terminalStates: ['completed', 'cancelled', 'expired'],
        effects: ['discard-pin-draft']
      }
    ]
  },
  assistant: {
    summary: 'Member-facing creation and management of community child groups.',
    useCases: [
      'Let community members create a subgroup through a guided title, description, and member setup flow.',
      'Let subgroup members request title and description changes through the bot.',
      'Let subgroup members pin or unpin quoted messages through the bot.'
    ],
    prerequisites: [
      'The plugin must be enabled for the target scope.',
      'The bot must be a community admin for subgroup creation.',
      'The bot must be a group admin in child groups for title, description, pin, and unpin actions.'
    ],
    workflows: [
      {
        intent: 'community_subgroup_create',
        description: 'Start a guided subgroup creation flow.',
        commands: ['/subgroup create']
      },
      {
        intent: 'community_subgroup_profile',
        description: 'Change the title or description of the current subgroup.',
        commands: ['/title', '/description']
      },
      {
        intent: 'community_subgroup_pin',
        description: 'Pin or unpin a quoted subgroup message.',
        commands: ['/pin', '/unpin']
      }
    ]
  }
};
