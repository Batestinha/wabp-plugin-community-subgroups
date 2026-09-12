import { defineControl } from '../../../../packages/plugin-sdk/src/controls';
import type { ControlDescriptor, ControlSchemaMetadata, ControlUiHint } from '../../../../packages/plugin-sdk/src/controls-types';
import { COMMUNITY_SUBGROUPS_PLUGIN_ID } from './manifest';

function control(
  path: string,
  label: string,
  description: string,
  order: number,
  schema: ControlSchemaMetadata,
  ui: ControlUiHint,
  section = 'Community subgroups'
): ControlDescriptor {
  return defineControl({
    id: `plugin.official.community-subgroups.${path}`,
    label,
    description,
    plane: 'plugin-scope-config',
    domain: 'official-plugin-settings',
    section,
    order,
    visibility: 'bot_admin',
    configurable: true,
    storage: { kind: 'plugin-scope-config', pluginId: COMMUNITY_SUBGROUPS_PLUGIN_ID, path },
    schema,
    ui: { helpText: description, ...ui },
    restartRequirement: 'NO_RESTART',
    dangerous: false,
    sensitivity: { sensitive: false, redact: 'none' },
    auditAction: 'operator_console.plugin_config.update',
    relatedCommandIds: ['/subgroup create', '/pin', '/unpin', '/title', '/description'],
    relatedActionIds: []
  });
}

const MEMBER_PERMISSION_OPTIONS = [
  { value: 'all_members', label: 'All members' },
  { value: 'admins_only', label: 'Only admins' }
];

const COMMUNITY_PERMISSION_OPTIONS = [
  { value: 'everyone', label: 'Everyone' },
  { value: 'community_admins', label: 'Only community admins' }
];

const DISAPPEARING_MESSAGES_OPTIONS = [
  { value: 'off', label: 'Off' },
  { value: '24h', label: '24 hours' },
  { value: '7d', label: '7 days' },
  { value: '90d', label: '90 days' }
];

export const communitySubgroupsControls: ControlDescriptor[] = [
  control('enabled', 'Enabled', 'Allow members to create and manage community subgroups through the bot.', 10, { type: 'boolean' }, { widget: 'toggle' }),
  control('maxParticipants', 'Maximum members', 'Maximum number of requested members in one subgroup creation flow.', 30, {
    type: 'number',
    unit: 'items',
    min: 1,
    max: 256
  }, { widget: 'number' }),
  control('creationPolicy.infoEditPermission', 'Edit group info', 'Choose who can edit the new subgroup name, icon, description, and settings.', 110, {
    type: 'enum',
    enum: MEMBER_PERMISSION_OPTIONS
  }, { widget: 'select', options: MEMBER_PERMISSION_OPTIONS }, 'New subgroup defaults'),
  control('creationPolicy.sendMessagesPermission', 'Send messages', 'Choose whether all members or only admins can send messages in new subgroups.', 120, {
    type: 'enum',
    enum: MEMBER_PERMISSION_OPTIONS
  }, { widget: 'select', options: MEMBER_PERMISSION_OPTIONS }, 'New subgroup defaults'),
  control('creationPolicy.memberAddPermission', 'Add members / invite links', 'Choose who can add members and create or share invite links in new subgroups.', 130, {
    type: 'enum',
    enum: MEMBER_PERMISSION_OPTIONS
  }, { widget: 'select', options: MEMBER_PERMISSION_OPTIONS }, 'New subgroup defaults'),
  control('creationPolicy.joinApproval', 'Approve new members', 'Require admins to approve new subgroup join requests.', 140, { type: 'boolean' }, { widget: 'toggle' }, 'New subgroup defaults'),
  control('creationPolicy.disappearingMessages', 'Disappearing messages', 'Set the disappearing-message timer for new subgroups.', 150, {
    type: 'enum',
    enum: DISAPPEARING_MESSAGES_OPTIONS
  }, { widget: 'select', options: DISAPPEARING_MESSAGES_OPTIONS }, 'New subgroup defaults'),
  control('creationPolicy.parentGroupCreatePermission', 'Who can create groups', 'Choose who can create groups in the parent community.', 200, {
    type: 'enum',
    enum: COMMUNITY_PERMISSION_OPTIONS
  }, { widget: 'select', options: COMMUNITY_PERMISSION_OPTIONS }, 'Parent community defaults'),
  control('creationPolicy.parentMemberAddPermission', 'Who can add members', 'Choose who can add new members to the parent community.', 210, {
    type: 'enum',
    enum: COMMUNITY_PERMISSION_OPTIONS
  }, { widget: 'select', options: COMMUNITY_PERMISSION_OPTIONS }, 'Parent community defaults')
];
