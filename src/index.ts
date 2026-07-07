import type { BotPlugin } from '../../../platform/pluginRuntime/types';
import { registerCommunitySubgroupCommands } from './commands';
import { communitySubgroupsManifest } from './manifest';

export const communitySubgroupsPlugin: BotPlugin = {
  manifest: communitySubgroupsManifest,
  registerCommands(context) {
    registerCommunitySubgroupCommands(context);
  }
};

export default communitySubgroupsPlugin;
