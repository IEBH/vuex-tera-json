import type { Plugin } from 'vuex';  // Import from vuex, even if we support Pinia too.  This keeps the core type simple.
import type { Store } from 'pinia';

/**
 * Configuration options for the TERA sync plugin.
 */
export interface TeraPluginConfig {
  /** Whether to maintain separate state for each user. */
  isSeparateStateForEachUser?: boolean;
  /** Auto-save interval in minutes (0 to disable). */
  autoSaveIntervalMinutes?: number;
  /** Whether to show an initial alert about manual saving. */
  showInitialAlert?: boolean;
  /** Whether to enable Ctrl+S (or Cmd+S) hotkey for saving. */
  enableSaveHotkey?: boolean;
  /** The type of store being used ('vuex' or 'pinia'). */
  storeType?: 'vuex' | 'pinia';
}

/**
 * Represents the save status.
 */
export type SaveStatus = 'Saved' | 'Unsaved changes' | 'Saving...';


/**
 * Internal interface representing the exposed plugin API.  This is what
 * users get *after* installing the plugin (e.g., via `this.$store.myPlugin`).
 */
export interface TeraSyncPluginInstance {
  /** Sets the TERA ready state, triggering initialization. */
  setTeraReady(): Promise<void>;
  /** Sets the Vue instance. */
  setVueInstance(instance: any): void; // Keep this as 'any' for maximum compatibility.
  /** Manually saves the current state to a file. */
  saveState(): Promise<boolean>;
  /** Gets the current save status. */
  getSaveStatus(): SaveStatus;
  /** Cleans up the plugin (removes listeners, intervals, etc.). */
  destroy(): void;
}



/**
 * Options passed when using the plugin with Pinia.
 */
export interface PiniaPluginOptions {
    /** Pinia's defineStore function.  Required for Pinia. */
    defineStore: typeof Store.$defineStore;  // More precise type.
}

/**
 * The Vuex plugin type.  This is what you get when you *use* the plugin, i.e.
 * `store.use(createSyncPlugin(...))`.  We define it as a function that
 * returns the instance.
 */
export type VuexTeraSyncPlugin = Plugin<any> & { // Use 'any' for the Vuex state, since it's user-defined.
  /** Returns the plugin instance with its methods. */
  (): TeraSyncPluginInstance;
};

/**
 * Creates a TERA file sync plugin instance.
 *
 * @param keyPrefix - Prefix for storage keys and filenames.
 * @param isSeparateStateForEachUser - Whether to maintain separate state for each user.
 * @param options - Additional plugin options.
 * @returns The plugin installation function.
 * @throws {Error} If parameters are invalid.
 */
declare function createSyncPlugin(
  keyPrefix: string,
  isSeparateStateForEachUser?: boolean,
  options?: TeraPluginConfig & (TeraPluginConfig['storeType'] extends 'pinia' ? PiniaPluginOptions : {}) // Conditional Options
): VuexTeraSyncPlugin; // Return the Vuex plugin *type*.


export { createSyncPlugin };