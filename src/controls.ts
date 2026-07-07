import { defineControl } from '../../../platform/operatorConsole/controlCatalog/define';
import type { ControlDescriptor, ControlSchemaMetadata, ControlUiHint } from '../../../platform/operatorConsole/controlCatalog/types';
import { COMMUNITY_SUBGROUPS_PLUGIN_ID } from './manifest';

function control(
  path: string,
  label: string,
  description: string,
  order: number,
  schema: ControlSchemaMetadata,
  ui: ControlUiHint
): ControlDescriptor {
  return defineControl({
    id: `plugin.official.community-subgroups.${path}`,
    label,
    description,
    plane: 'plugin-scope-config',
    domain: 'official-plugin-settings',
    section: 'Community subgroups',
    order,
    visibility: 'bot_admin',
    configurable: true,
    storage: { kind: 'plugin-scope-config', pluginId: COMMUNITY_SUBGROUPS_PLUGIN_ID, path },
    schema,
    ui,
    restartRequirement: 'NO_RESTART',
    dangerous: false,
    sensitivity: { sensitive: false, redact: 'none' },
    auditAction: 'operator_console.plugin_config.update',
    relatedCommandIds: ['/subgroup create', '/pin', '/unpin', '/title', '/description'],
    relatedActionIds: []
  });
}

export const communitySubgroupsControls: ControlDescriptor[] = [
  control('enabled', 'Enabled', 'Allow members to create and manage community subgroups through the bot.', 10, { type: 'boolean' }, { widget: 'toggle' }),
  control('autoSendInviteV4', 'Send invite fallback', 'Send WhatsApp invite requests when members cannot be added directly.', 20, { type: 'boolean' }, { widget: 'toggle' }),
  control('maxParticipants', 'Maximum members', 'Maximum number of requested members in one subgroup creation flow.', 30, {
    type: 'number',
    unit: 'items',
    min: 1,
    max: 256
  }, { widget: 'number' })
];
