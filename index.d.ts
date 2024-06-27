import { Store, Plugin } from 'vuex';

declare function createSyncPlugin(): Plugin<any>;

declare function setVueInstance(instance: any): void;

declare function setTeraReady(): void;

export {
  createSyncPlugin,
  setVueInstance,
  setTeraReady
};