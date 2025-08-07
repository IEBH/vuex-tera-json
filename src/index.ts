// index.ts
import { nanoid } from 'nanoid';
import pRetry from 'p-retry';
import * as api from './helpers/api';

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
  getCredentials(): object;
  getKindeToken(): string;
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


// --- Implementation ---

const DEBUG = true;

const DEFAULT_CONFIG: Required<TeraPluginConfig> = {
  keyPrefix: '',
  isSeparateStateForEachUser: false,
  autoSaveIntervalMinutes: 15,
  showInitialAlert: false,
  enableSaveHotkey: true,
  loadImmediately: true,
  onBeforeSave: () => true,
};

const debugLog = (...args: any[]): void => {
  if (DEBUG) console.log('[TERA File Sync]:', ...args);
};

const logError = (error: unknown, context: string): void => {
  console.error(`[TERA File Sync] ${context}:`, error);
};

const validateConfig = (config: TeraPluginConfig): void => {
  if (typeof config.keyPrefix !== 'string') {
    throw new Error('keyPrefix must be a string');
  }
  if (typeof config.isSeparateStateForEachUser !== 'boolean') {
    throw new Error('isSeparateStateForEachUser must be a boolean');
  }
  if (typeof config.autoSaveIntervalMinutes !== 'number' || config.autoSaveIntervalMinutes < 0) {
    throw new Error('autoSaveIntervalMinutes must be a non-negative number');
  }
  if (typeof config.showInitialAlert !== 'boolean') {
    throw new Error('showInitialAlert must be a boolean');
  }
  if (typeof config.enableSaveHotkey !== 'boolean') {
    throw new Error('enableSaveHotkey must be a boolean');
  }
  if (typeof config.loadImmediately !== 'boolean') {
    throw new Error('loadImmediately must be a boolean');
  }
  if (typeof config.onBeforeSave !== 'function') {
    throw new Error('onBeforeSave must be a function');
  }
};

const validateVueInstance = (instance: VueInstance): void => {
  if (!instance) {
    throw new Error('Vue instance is required');
  }
  if (!instance.$tera) {
    throw new Error('Vue instance must have $tera property');
  }
  if (typeof instance.$tera.getUser !== 'function') {
    throw new Error('$tera.getUser must be a function');
  }
  if (typeof instance.$tera.getProjectFile !== 'function') {
    throw new Error('$tera.getProjectFile must be a function');
  }
  if (typeof instance.$tera.getProjectFileContents !== 'function') {
    throw new Error('$tera.getProjectFileContents must be a function');
  }
  if (typeof instance.$tera.setProjectFileContents !== 'function') {
    throw new Error('$tera.setProjectFileContents must be a function');
  }
  if (typeof instance.$tera.uiProgress !== 'function') {
    throw new Error('$tera.uiProgress must be a function');
  }
};

const mapSetToObject = (item: any): any => {
  try {
    if (item instanceof Map) {
      debugLog('Converting Map to object');
      const obj: any = { __isMap: true };
      item.forEach((value, key) => {
        obj[key] = mapSetToObject(value);
      });
      return obj;
    }
    if (item instanceof Set) {
      debugLog('Converting Set to array');
      return {
        __isSet: true,
        values: Array.from(item).map(mapSetToObject),
      };
    }
    if (Array.isArray(item)) {
      return item.map(mapSetToObject);
    }
    if (item && typeof item === 'object' && !(item instanceof Date)) {
      const obj: any = {};
      Object.entries(item).forEach(([key, value]) => {
        obj[key] = mapSetToObject(value);
      });
      return obj;
    }
    return item;
  } catch (error) {
    logError(error, 'mapSetToObject conversion failed');
    throw error;
  }
};

const objectToMapSet = (obj: any): any => {
  try {
    if (!obj || typeof obj !== 'object' || obj instanceof Date) {
      return obj;
    }
    if ('__isMap' in obj) {
      debugLog('Converting object back to Map');
      const map = new Map();
      Object.entries(obj).forEach(([key, value]) => {
        if (key !== '__isMap') {
          map.set(key, objectToMapSet(value));
        }
      });
      return map;
    }
    if ('__isSet' in obj) {
      debugLog('Converting array back to Set');
      return new Set(obj.values.map(objectToMapSet));
    }
    if (Array.isArray(obj)) {
      return obj.map(objectToMapSet);
    }
    const newObj: any = {};
    Object.entries(obj).forEach(([key, value]) => {
      newObj[key] = objectToMapSet(value);
    });
    return newObj;
  } catch (error) {
    logError(error, 'objectToMapSet conversion failed');
    throw error;
  }
};

const showNotification = (message: string): void => {
  if (typeof window !== 'undefined' && window.alert) {
    window.alert(message);
  } else {
    debugLog('Alert would be shown:', message);
  }
};

abstract class StoreAdapter {
  protected unsubscribe: () => void = () => {};

  constructor(protected store: SyncableStore) {
    if (this.constructor === StoreAdapter) {
      throw new Error("Abstract classes can't be instantiated.");
    }
  }

  abstract getState(): any;
  abstract replaceState(newState: any): void;
  abstract updateSaveStatus(status: SaveStatus): void;
  abstract subscribe(callback: (mutation?: any) => void): void;
  abstract setup(): void;

  public destroy(): void {
    this.unsubscribe();
  }
}

class VuexAdapter extends StoreAdapter {
  protected store: VuexStore;

  constructor(store: VuexStore) {
    super(store);
    this.store = store;
  }

  setup(): void {
    debugLog('Setting up Vuex adapter.');
    if (this.store.hasModule('__tera_file_sync')) {
      debugLog('Vuex module __tera_file_sync already registered.');
      return;
    }
    this.store.registerModule('__tera_file_sync', {
      namespaced: true,
      state: { saveStatus: SaveStatus.SAVED },
      mutations: {
        updateSaveStatus(state: { saveStatus: SaveStatus }, status: SaveStatus) {
          state.saveStatus = status;
        },
      },
      getters: {
        getSaveStatus: (state: { saveStatus: SaveStatus }) => state.saveStatus
      }
    });
  }

  getState(): any {
    const { __tera_file_sync, ...stateToSave } = this.store.state;
    return stateToSave;
  }

  replaceState(newState: any): void {
    this.store.replaceState({
      ...this.store.state,
      ...newState,
    });
  }

  updateSaveStatus(status: SaveStatus): void {
    this.store.commit('__tera_file_sync/updateSaveStatus', status);
  }

  subscribe(callback: (mutation: any) => void): void {
    this.unsubscribe = this.store.subscribe((mutation) => {
      if (mutation.type.startsWith('__tera_file_sync/')) return;
      callback(mutation);
    });
  }

  destroy(): void {
    super.destroy();
    if (this.store.hasModule('__tera_file_sync')) {
      this.store.unregisterModule('__tera_file_sync');
      debugLog('Unregistered Vuex module.');
    }
  }
}

class PiniaAdapter extends StoreAdapter {
  protected store: PiniaStore;

  constructor(store: PiniaStore) {
    super(store);
    this.store = store;
  }

  setup(): void {
    debugLog('Setting up Pinia adapter.');
    if (this.store.saveStatus === undefined) {
      throw new Error("Pinia store must have a 'saveStatus' property in its state for TERA File Sync to work.");
    }
  }

  getState(): any {
    const { saveStatus: _saveStatus, ...stateToSave } = this.store.$state;
    return stateToSave;
  }

  replaceState(newState: any): void {
    this.store.$patch(newState);
  }

  updateSaveStatus(status: SaveStatus): void {
    this.store.saveStatus = status;
  }

  subscribe(callback: (mutation: any) => void): void {
    this.unsubscribe = this.store.$subscribe((mutation) => {
      if (mutation.events && (mutation.events as any).key === 'saveStatus') return;
      callback(mutation);
    });
  }
}

class PlainObjectAdapter extends StoreAdapter {
    protected store: PlainObjectStore;

    constructor(store: PlainObjectStore) {
        super(store);
        this.store = store;
    }

    setup(): void {
        debugLog('Setting up PlainObjectAdapter.');
    }

    getState(): any {
        if (typeof this.store.getState !== 'function') {
            throw new Error("The provided object for PlainObjectAdapter must have a 'getState' method.");
        }
        return this.store.getState();
    }

    replaceState(newState: any): void {
        if (typeof this.store.replaceState !== 'function') {
            throw new Error("The provided object for PlainObjectAdapter must have a 'replaceState' method.");
        }
        this.store.replaceState(newState);
    }

    updateSaveStatus(status: SaveStatus): void {
        if (typeof this.store.updateSaveStatus !== 'function') {
            throw new Error("The provided object for PlainObjectAdapter must have an 'updateSaveStatus' method.");
        }
        this.store.updateSaveStatus(status);
    }

    subscribe(callback: (mutation?: any) => void): void {
        if (typeof this.store.subscribe !== 'function') {
            throw new Error("The provided object for PlainObjectAdapter must have a 'subscribe' method.");
        }
        this.unsubscribe = this.store.subscribe(callback);
    }
}


class TeraFileSyncPlugin implements TeraFileSync {
  public readonly config: Required<TeraPluginConfig>;
  public initialized: boolean = false;

  private adapter: StoreAdapter;
  private teraReady: boolean = false;
  private vueInstance: VueInstance | null = null;
  private userId: string | number | null = null;
  private saveInProgress: boolean = false;
  private autoSaveInterval: ReturnType<typeof setInterval> | null = null;
  private keydownHandler: (event: KeyboardEvent) => void;
  private hasShownInitialAlert: boolean = false;
  private _saveStatus: SaveStatus = SaveStatus.SAVED;
  private beforeUnloadHandler: (event: BeforeUnloadEvent) => string | undefined;
  private get projectId(): string {
    if (!this.vueInstance?.$tera?.project?.id) {
      throw new Error("TERA project context is missing.");
    }
    return String(this.vueInstance.$tera.project.id);
  }


  public get saveStatus(): SaveStatus {
    return this._saveStatus;
  }

  constructor(config: TeraPluginConfig, adapter: StoreAdapter) {
    const mergedConfig = { ...DEFAULT_CONFIG, ...config };
    validateConfig(mergedConfig);
    this.config = mergedConfig;

    if (!(adapter instanceof StoreAdapter)) {
      throw new Error("A valid store adapter must be provided.");
    }
    this.adapter = adapter;
    this.adapter.setup();

    this.keydownHandler = this.handleKeyDown.bind(this);
    this.beforeUnloadHandler = this.handleBeforeUnload.bind(this);
  }

  // --- Public API Methods ---

  public setVueInstance(instance: VueInstance): void {
    this.vueInstance = instance;
  }

  public async setTeraReady(): Promise<void> {
    if (!this.vueInstance) throw new Error("Vue instance must be set before calling setTeraReady.");
    validateVueInstance(this.vueInstance);
    this.teraReady = true;
    await this.initializeState({ loadImmediately: this.config.loadImmediately });
    this.setupAutoSave();
    this.setupStateChangeTracking();
  }

  public async saveState(): Promise<boolean> {
    return await this.saveStateToFile();
  }

  public async promptForNewJsonFile(): Promise<void> {
    return await this.setStateFromPromptedJsonFile();
  }

  public async loadAndApplyStateFromFile(): Promise<boolean> {
    if (!this.vueInstance?.$tera) {
        logError(new Error('TERA API not available'), 'State load failed.');
        return false;
    }
    try {
      await this.vueInstance.$tera.uiProgress({ title: 'Loading tool data', backdrop: 'static' });
      const fileData = await this.loadStateFromFile();

      if (fileData) {
        const parsedState = objectToMapSet(fileData);
        this.adapter.replaceState(parsedState);
        debugLog('Store state replaced from file data.');
        this.updateSaveStatus(SaveStatus.SAVED);
        return true;
      } else {
        debugLog('No file data found to load. Using default state.');
        this.updateSaveStatus(SaveStatus.UNSAVED);
        return true;
      }
    } catch (error) {
      logError(error, 'State load and apply failed.');
      showNotification('Error loading state from file.');
      return false;
    } finally {
        if (this.vueInstance?.$tera?.uiProgress) {
            await this.vueInstance.$tera.uiProgress(false);
        }
    }
  }

  public async getFileMetadata(): Promise<FileMetadata | null> {
    if (!this.vueInstance) return null;
    try {
      const fileName = await this.getStorageFileName();
      if (!fileName) {
        debugLog('Cannot get metadata, no storage file name available.');
        return null;
      }

      const fileObject = await this.vueInstance.$tera.getProjectFile(fileName, { cache: false });
      if (!fileObject) {
        debugLog(`Could not retrieve file metadata for ${fileName}.`);
        return null;
      }

      const metadata: FileMetadata = {
        modified: new Date(fileObject.modified),
      };
      debugLog(`Retrieved metadata for ${fileName}:`, metadata);
      return metadata;

    } catch (error: any) {
      if (error.message && error.message.includes('not found')) {
        debugLog('State file not found, no metadata available.');
        return null;
      }
      logError(error, 'Failed to get file metadata');
      return null;
    }
  }

  public destroy(): void {
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
    }
    this.unregisterHotkeys();
    this.unregisterBeforeUnload();
    this.adapter.destroy();
    this.initialized = false;
    this.teraReady = false;
  }

  // --- Internal Methods ---

  private handleKeyDown(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.key === 's') {
      event.preventDefault();
      debugLog('Ctrl+S hotkey detected, saving state');
      this.saveStateToFile().then(success => {
        if (success) {
          debugLog('Save completed via hotkey');
        }
      });
    }
  }

  private handleBeforeUnload(event: BeforeUnloadEvent): string | undefined {
    if (this._saveStatus === SaveStatus.UNSAVED) {
      const message = 'You have unsaved changes. Are you sure you want to leave?';
      event.returnValue = message;
      return message;
    }
    return undefined;
  }

  private registerHotkeys(): void {
    if (!this.config.enableSaveHotkey) {
      debugLog('Save hotkey disabled in configuration');
      return;
    }
    debugLog('Registering Ctrl+S hotkey');
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.keydownHandler);
      window.addEventListener('keydown', this.keydownHandler);
    }
  }

  private unregisterHotkeys(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.keydownHandler);
      debugLog('Unregistered hotkeys');
    }
  }

  private registerBeforeUnload(): void {
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', this.beforeUnloadHandler);
      debugLog('Registered beforeunload listener');
    }
  }

  private unregisterBeforeUnload(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('beforeunload', this.beforeUnloadHandler);
      debugLog('Unregistered beforeunload listener');
    }
  }

  private showInitialAlert(): void {
    if (this.config.showInitialAlert && !this.hasShownInitialAlert) {
      this.hasShownInitialAlert = true;
      const message = "This TERA tool no longer automatically saves progress, use Ctrl+S, or click save in the top right corner, to save progress. (This is a short-term temporary pop-up, it will be removed at the start of April)";

      if (this.vueInstance && this.vueInstance.$notify) {
        this.vueInstance.$notify({
          title: 'Important',
          message,
          type: 'warning',
          duration: 10000,
          showClose: true,
        });
      } else {
        setTimeout(() => showNotification(message), 1000);
      }
      debugLog('Showed initial manual save alert');
    }
  }

  private updateSaveStatus(status: SaveStatus): void {
    debugLog(`Updating save status: ${status}`);
    this._saveStatus = status;
    this.adapter.updateSaveStatus(status);
  }

  private async getStorageKey(): Promise<string> {
    if (this.config.isSeparateStateForEachUser) {
      if (!this.userId) {
        if (!this.vueInstance) throw new Error("Vue instance not available to get user ID.");
        try {
          const user = await this.vueInstance.$tera.getUser();
          this.userId = user.id;
          debugLog('User ID initialized:', this.userId);
        } catch (error) {
          logError(error, 'Failed to get user ID');
          throw error;
        }
      }
      return `${this.config.keyPrefix}-${this.userId}`;
    }
    return `${this.config.keyPrefix}`;
  }

  private async getStorageFileName({ returnFullPath = false } = {}): Promise<string> {
    if (!this.vueInstance?.$tera?.project?.id) {
        throw new Error("Error getting fileStorageName: TERA project context is missing.");
    }
    if (!this.vueInstance.$tera.project.temp) {
        console.warn("Warning: $tera.project.temp is missing. Creating it.");
        this.vueInstance.$tera.project.temp = {};
    }

    const key = await this.getStorageKey();
    let fileStorageName = this.vueInstance.$tera.project.temp[key];

    if (!fileStorageName) {
      debugLog("No existing file for project/tool, creating one");
      fileStorageName = `data-${this.config.keyPrefix}-${nanoid()}.json`;

      const newFile = await pRetry(() => this.vueInstance!.$tera.createProjectFile(fileStorageName), {
          retries: 2,
          minTimeout: 200,
          onFailedAttempt: error => debugLog(`[Create file attempt ${error.attemptNumber}] Failed. Retries left: ${error.retriesLeft}.`),
      });

      await pRetry(() => newFile.setContents(this.adapter.getState()), {
          retries: 2,
          minTimeout: 200,
          onFailedAttempt: error => debugLog(`[Set contents attempt ${error.attemptNumber}] Failed. Retries left: ${error.retriesLeft}.`),
      });

      await pRetry(() => this.vueInstance!.$tera.setProjectState(`temp.${key}`, fileStorageName), {
          retries: 2,
          minTimeout: 200,
          onFailedAttempt: error => debugLog(`[Set storage key attempt ${error.attemptNumber}] Failed. Retries left: ${error.retriesLeft}.`),
      });
    }

    if (typeof fileStorageName !== 'string') {
      throw new Error(`fileStorageName is not a string: ${fileStorageName}`);
    }

    return returnFullPath ? `${this.vueInstance.$tera.project.id}/${fileStorageName}` : fileStorageName;
  }

  private async loadStateFromFile(): Promise<any | null> {
    if (!this.vueInstance) return null;
    let fileName = '';
    try {
      let fileContent: any;
      await pRetry(async () => {
        fileName = await this.getStorageFileName();
        debugLog(`Loading state from file: ${fileName}`);
        if (!fileName) throw new Error('No file name returned when expected!');
        if (!this.vueInstance) throw new Error('this.vueInstance expected!');
        fileContent = await api.getFileContent(this.projectId, fileName, this.vueInstance.$tera);
      }, {
        retries: 3,
        minTimeout: 1000,
        factor: 2,
        onFailedAttempt: error => debugLog(`[Load Attempt ${error.attemptNumber}] Failed for ${fileName}. Retries left: ${error.retriesLeft}.`),
      });

      if (!fileContent) {
        debugLog('File not found or empty');
        return null;
      }
      this.updateSaveStatus(SaveStatus.SAVED);
      debugLog('State loaded from file successfully:', fileContent);
      return fileContent;
    } catch (error: any) {
      if (error.message?.includes('not found') || error.message?.includes("Unexpected end of JSON input")) {
        debugLog('State file not found or corrupt, will be created on first save');
        return null;
      }
      logError(error, 'Failed to load state from file');
      showNotification('Failed to load state from file, using default state');
      return null;
    }
  }

  private async saveStateToFile(): Promise<boolean> {
    if (!this.vueInstance) return false;
    if (this.config.onBeforeSave) {
      const validationResult = this.config.onBeforeSave();
      if (validationResult !== true) {
        debugLog('Save prevented by onBeforeSave hook. Reason:', validationResult);
        if (typeof validationResult === 'string' && validationResult.length > 0) {
          showNotification(validationResult);
        }
        return false;
      }
    }

    if (this.saveInProgress) {
      debugLog('Save already in progress, skipping');
      return false;
    }

    const state = this.adapter.getState();
    let fileName = '';

    try {
      this.saveInProgress = true;
      this.updateSaveStatus(SaveStatus.SAVING);
      await this.vueInstance.$tera.uiProgress({ title: 'Saving tool data', backdrop: 'static' });

      await pRetry(async () => {
        fileName = await this.getStorageFileName();
        if (!fileName) throw new Error('No fileName returned');
        const stateToSave = mapSetToObject(state);
        if (!this.vueInstance) throw new Error('this.vueInstance expected!');
        await api.saveFileContent(this.projectId, fileName, stateToSave, this.vueInstance?.$tera);
      }, {
        retries: 3,
        minTimeout: 1000,
        factor: 2,
        onFailedAttempt: error => debugLog(`[Save Attempt ${error.attemptNumber}] Failed for ${fileName}. Retries left: ${error.retriesLeft}.`),
      });

      this.updateSaveStatus(SaveStatus.SAVED);
      debugLog(`State saved to file: ${fileName}`);
      return true;
    } catch (error) {
      logError(error, 'Failed to save state to file');
      showNotification('Failed to save state to file, hit F12 for debug information.');
      this.updateSaveStatus(SaveStatus.UNSAVED);
      return false;
    } finally {
      this.saveInProgress = false;
      if (this.vueInstance?.$tera?.uiProgress) {
        await this.vueInstance.$tera.uiProgress(false);
      }
    }
  }

  private async initializeState({ loadImmediately = true } = {}): Promise<void> {
    if (!this.teraReady || !this.vueInstance?.$tera) {
      debugLog('TERA not ready, skipping initialization');
      return;
    }

    if (this.vueInstance.$tera.uiProgress) {
        await this.vueInstance.$tera.uiProgress({ title: 'Loading tool data', backdrop: 'static' });
    }

    try {
      if (loadImmediately) {
        debugLog('Initializing with immediate load from file.');
        await this.loadAndApplyStateFromFile();
      } else {
        debugLog('Skipping immediate load. State will be considered unsaved until loaded.');
        this.updateSaveStatus(SaveStatus.UNSAVED);
      }
      this.showInitialAlert();
      this.registerHotkeys();
      this.registerBeforeUnload();
    } catch (error) {
      logError(error, 'State initialization failed');
      showNotification('Error initializing state from file');
    } finally {
      this.initialized = true;
      if (this.vueInstance.$tera.uiProgress) {
        await this.vueInstance.$tera.uiProgress(false);
      }
    }
  }

  private setupAutoSave(): void {
    if (this.config.autoSaveIntervalMinutes <= 0) {
      debugLog('Auto-save disabled');
      return;
    }
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
    }
    const intervalMs = this.config.autoSaveIntervalMinutes * 60 * 1000;
    debugLog(`Setting up auto-save every ${this.config.autoSaveIntervalMinutes} minutes`);
    this.autoSaveInterval = setInterval(() => {
      if (this._saveStatus !== SaveStatus.SAVED) {
        debugLog('Auto-save triggered');
        this.saveStateToFile();
      } else {
        debugLog('Auto-save skipped - no changes detected');
      }
    }, intervalMs);
  }

  private setupStateChangeTracking(): void {
    this.adapter.subscribe(() => {
      if (!this.saveInProgress) {
        this.updateSaveStatus(SaveStatus.UNSAVED);
      }
    });
  }

  private async setStateFromPromptedJsonFile(): Promise<void> {
    if (!this.vueInstance) return;
    try {
      const projectFile = await this.vueInstance.$tera.selectProjectFile({
        title: 'Load JSON file',
        showHiddenFiles: true,
      });
      if (!projectFile) {
        debugLog('User cancelled file selection.');
        return;
      }

      const fileData = await pRetry(() => projectFile.getContents({ format: 'json' }), {
          retries: 3,
          minTimeout: 1000,
          onFailedAttempt: error => debugLog(`[Load Prompted File Attempt ${error.attemptNumber}] Failed. Retries left: ${error.retriesLeft}.`),
      });

      if (!fileData) {
        debugLog('Selected file is empty.');
        showNotification('The selected file is empty.');
        return;
      }

      const parsedState = objectToMapSet(fileData);
      this.adapter.replaceState(parsedState);

      const key = await this.getStorageKey();
      await this.vueInstance.$tera.setProjectState(`temp.${key}`, projectFile.path);

      debugLog('Store initialized from prompted file data');
      this.updateSaveStatus(SaveStatus.SAVED);
    } catch (error) {
      logError(error, 'Failed to set state from prompted JSON file');
      showNotification('Failed to load data from the selected file.');
      this.updateSaveStatus(SaveStatus.UNSAVED);
    }
  }
}

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
): TeraFileSync {
  let adapter: StoreAdapter;

  // Type-safe "sniffing" to determine the store type.
  if (
    store &&
    typeof (store as PlainObjectStore).getState === 'function' &&
    typeof (store as PlainObjectStore).replaceState === 'function' &&
    typeof (store as PlainObjectStore).updateSaveStatus === 'function' &&
    typeof (store as PlainObjectStore).subscribe === 'function'
  ) {
    debugLog('Detected custom aggregator object. Using PlainObjectAdapter.');
    adapter = new PlainObjectAdapter(store as PlainObjectStore);
  } else if (store && typeof (store as PiniaStore).$id === 'string' && typeof (store as PiniaStore).$patch === 'function') {
    debugLog('Detected Pinia store. Using PiniaAdapter.');
    adapter = new PiniaAdapter(store as PiniaStore);
  } else if (store && typeof (store as VuexStore).commit === 'function' && typeof (store as VuexStore).subscribe === 'function') {
    debugLog('Detected Vuex store. Using VuexAdapter.');
    adapter = new VuexAdapter(store as VuexStore);
  } else {
    throw new Error('Could not determine store type. Please provide a valid Vuex store, Pinia store, or a custom aggregator object.');
  }

  const plugin = new TeraFileSyncPlugin(config, adapter);
  return plugin;
}