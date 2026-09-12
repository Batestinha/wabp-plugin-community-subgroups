import type { CommandPlugin } from '../../../../packages/plugin-sdk/src/command-plugin';
import type { CommunityCommandPluginContext, CommunityServicePluginContext } from '../../../../packages/plugin-sdk/src/community-operations';
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
