import { Store, Plugin } from 'vuex';

declare function createSyncPlugin(key: string): Plugin<any>;

declare function setVueInstance(instance: any): void;

declare function setTeraReady(): void;

export {
  createSyncPlugin,
  setVueInstance,
  setTeraReady
};