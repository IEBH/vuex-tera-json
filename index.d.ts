// --- Configuration and State Types ---

/**
 * Configuration options for the TERA sync plugin.
 */
export interface TeraPluginConfig {
  /**
   * A unique prefix for storage keys and filenames to avoid conflicts.
   * Often the name of the tool, e.g., 'my-awesome-tool'.
   * @default ''
   */
  keyPrefix?: string;

  /**
   * If true, a separate state file is maintained for each user.
   * If false, the state is shared for the entire project.
   * @default false
   */
  isSeparateStateForEachUser?: boolean;

  /**
   * The interval in minutes for automatically saving the state.
   * Set to 0 to disable auto-saving.
   * @default 15
   */
  autoSaveIntervalMinutes?: number;

  /**
   * If true, shows an initial alert to the user about manual saving (e.g., with Ctrl+S).
   * @default false
   */
  showInitialAlert?: boolean;

  /**
   * If true, enables the Ctrl+S (or Cmd+S) hotkey to trigger a manual save.
   * @default true
   */
  enableSaveHotkey?: boolean;

  /**
   * If true, the state will be loaded from the TERA file as soon as the plugin is ready.
   * If false, the state will not be loaded automatically, and you must call `loadAndApplyStateFromFile()` manually.
   * @default true
   */
  loadImmediately?: boolean;

  /**
   * A function that is called before a save is attempted.
   * If the function returns `true`, the save proceeds.
   * If it returns a string, the save is aborted and the string is shown as a notification to the user.
   * If it returns any other value (e.g., `false`), the save is aborted silently.
   * @default () => true
   */
    onBeforeSave?: () => boolean | string;
}

/**
 * Represents the possible save statuses of the state.
 */
export enum SaveStatus {
  SAVED = 'Saved',
  UNSAVED = 'Unsaved changes',
  SAVING = 'Saving...',
}

// --- TERA and Vue Environment Types ---

/**
* A simplified representation of the TERA user object.
*/
export interface TeraUser {
  id: string | number;
  [key: string]: any;
}

/**
 * Options for TERA's UI progress indicator.
 */
export interface TeraUiProgressOptions {
  title: string;
  backdrop: 'static' | boolean;
}

/**
 * Options for TERA's project file selection dialog.
 */
export interface TeraSelectProjectFileOptions {
  title: string;
  showHiddenFiles: boolean;
}

/**
* A simplified representation of a TERA project file object.
*/
export interface TeraProjectFile {
  path: string;
  modified: string | number | Date;
  getContents(options?: { format: 'json' | 'text' }): Promise<any>;
  setContents(data: any): Promise<void>;
}

/**
* The `$tera` API object expected to be available on the Vue instance.
*/
export interface TeraApi {
  project: {
    id: string | number;
    temp: Record<string, any>;
  };
  getUser(): Promise<TeraUser>;
  getProjectFile(fileName: string, options?: { cache: boolean }): Promise<TeraProjectFile | null>;
  getProjectFileContents(encodedFileName: string, options?: { format: 'json' | 'text' }): Promise<any>;
  setProjectFileContents(encodedFileName: string, data: any, options?: { format: 'json' }): Promise<void>;
  createProjectFile(fileName: string): Promise<TeraProjectFile>;
  setProjectState(key: string, value: any): Promise<void>;
  selectProjectFile(options: TeraSelectProjectFileOptions): Promise<TeraProjectFile | null>;
  uiProgress(options: TeraUiProgressOptions | false): Promise<void>;
}

/**
* A representation of the Vue instance required by the plugin.
*/
export interface VueInstance {
  $tera: TeraApi;
  /** Optional notification function, e.g., from Element UI. */
  $notify?(options: any): void;
}

// --- Store Adapter Types ---

/**
 * A generic interface for a Vuex-like store.
 */
export interface VuexStore {
  state: any;
  commit(mutationType: string, payload?: any): void;
  subscribe(handler: (mutation: any, state: any) => any): () => void;
  hasModule(path: string | string[]): boolean;
  registerModule(path: string | string[], module: any, options?: any): void;
  unregisterModule(path: string | string[]): void;
  replaceState(state: any): void;
}

/**
 * A generic interface for a Pinia-like store.
 */
export interface PiniaStore {
  $id: string;
  $patch(state: Partial<any>): void;
  $subscribe(callback: (mutation: any, state: any) => void, options?: any): () => void;
  $state: any;
  saveStatus?: SaveStatus;
}

/**
 * Interface for a custom store aggregator object.
 * This allows managing state from multiple stores or sources.
 */
export interface PlainObjectStore {
  /** Returns the complete state object to be serialized. */
  getState(): any;
  /** Replaces the state with the new state object from a file. */
  replaceState(newState: any): void;
  /** Updates the save status indicator. */
  updateSaveStatus(status: SaveStatus): void;
  /** Subscribes to state changes and returns an unsubscribe function. */
  subscribe(callback: (mutation?: any) => void): () => void;
}

/**
 * A union type representing any compatible store that can be passed to `createTeraSync`.
 */
export type SyncableStore = VuexStore | PiniaStore | PlainObjectStore;

// --- Plugin Public API ---

/**
 * Metadata for the storage file.
 */
export interface FileMetadata {
  modified: Date;
}

/**
 * The public API of the TERA File Sync plugin instance.
 */
export interface TeraFileSync {
  /**
   * The final, merged configuration object being used by the plugin.
   */
  readonly config: TeraPluginConfig;

  /**
   * A flag indicating if the plugin has completed its initial setup.
   */
  readonly initialized: boolean;

  /**
   * The current save status of the state.
   */
  readonly saveStatus: SaveStatus;

  /**
   * Informs the plugin that the TERA environment is ready. This must be called
   * after the Vue instance is mounted and `$tera` is available.
   * It triggers the initial state load based on the `loadImmediately` config.
   * @returns A promise that resolves when initialization is complete.
   */
  setTeraReady(): Promise<void>;

  /**
   * Provides the Vue instance to the plugin. This is required for the plugin
   * to interact with the TERA API.
   * @param instance The Vue component instance.
   */
  setVueInstance(instance: VueInstance): void;

  /**
   * Manually saves the current state to the configured TERA file.
   * @returns A promise that resolves to `true` if the save was successful, `false` otherwise.
   */
  saveState(): Promise<boolean>;

  /**
   * Prompts the user to select a JSON file via the TERA file picker,
   * loads its content into the store, and sets it as the new target file for future saves.
   * @returns A promise that resolves when the operation is complete.
   */
  promptForNewJsonFile(): Promise<void>;

  /**
   * Manually triggers a load from the configured TERA file and replaces the store's state.
   * Useful for re-syncing with the file system if `loadImmediately` was false.
   * @returns A promise that resolves to `true` if the load was successful, `false` otherwise.
   */
  loadAndApplyStateFromFile(): Promise<boolean>;

  /**
   * Retrieves metadata for the storage file.
   * @returns A promise that resolves to an object with file metadata (e.g., last modified date) or null if the file doesn't exist.
   */
  getFileMetadata(): Promise<FileMetadata | null>;

  /**
   * Cleans up all resources used by the plugin, including timers and event listeners.
   * Should be called when the component using the plugin is destroyed.
   */
  destroy(): void;
}


// --- Main Export ---

/**
 * Creates and initializes a new TERA file sync manager.
 * This is the main entry point for using the plugin.
 *
 * @param config - Plugin configuration options.
 * @param store - The Vuex store, Pinia store, or a custom aggregator object that conforms to the `PlainObjectStore` interface.
 * @returns The plugin instance, providing a public API to manage state synchronization.
 */
export function createTeraSync(
  config: TeraPluginConfig,
  store: SyncableStore
): TeraFileSync;