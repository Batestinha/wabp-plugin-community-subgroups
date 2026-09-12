import type { CommandPlugin } from '@wabs/plugin-sdk/command-plugin';
import type { CommunityCommandPluginContext, CommunityServicePluginContext } from '@wabs/plugin-sdk/community-operations';
import { registerCommunitySubgroupCommands } from './commands';
import { communitySubgroupsManifest } from './manifest';
import { registerCommunitySubgroupServices } from './service';

export const communitySubgroupsPlugin: CommandPlugin<CommunityCommandPluginContext, CommunityServicePluginContext> = {
  manifest: communitySubgroupsManifest,
  registerCommands(context) {
    registerCommunitySubgroupCommands(context);
  },
  registerServices(context) {
    return registerCommunitySubgroupServices(context);
  }
};

export default communitySubgroupsPlugin;
