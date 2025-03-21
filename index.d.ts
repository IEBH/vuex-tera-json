import { Plugin } from 'vuex';

interface TeraSyncPluginInstance {
  setTeraReady(): void;
  setVueInstance(instance: any): void;
  saveState(): Promise<boolean>;
  promptForNewJsonFile(): Promise<void>;
  destroy(): void;
}

declare function createSyncPlugin(key: string): Plugin<TeraSyncPluginInstance>;

export {
  createSyncPlugin,
  TeraSyncPluginInstance
};