import type { BotPlugin } from '../../../platform/pluginRuntime/types';
import { registerCommunitySubgroupCommands } from './commands';
import { communitySubgroupsManifest } from './manifest';
import { registerCommunitySubgroupServices } from './service';

export const communitySubgroupsPlugin: BotPlugin = {
  manifest: communitySubgroupsManifest,
  registerCommands(context) {
    registerCommunitySubgroupCommands(context);
  },
  registerServices(context) {
    return registerCommunitySubgroupServices(context);
  }
};

export default communitySubgroupsPlugin;
