import {nanoid} from 'nanoid';
import pRetry from 'p-retry';

/**
 * @constant {boolean}
 * @description Debug mode flag for logging
 */
const DEBUG = true

/**
 * @typedef {Object} TeraPluginConfig
 * @property {string} keyPrefix - Prefix for storage keys and filenames
 * @property {boolean} isSeparateStateForEachUser - Whether to maintain separate state for each user
 * @property {number} autoSaveIntervalMinutes - Auto-save interval in minutes (0 to disable)
 * @property {boolean} showInitialAlert - Whether to show initial alert about manual saving
 * @property {boolean} enableSaveHotkey - Whether to enable Ctrl+S hotkey for saving
 */

/**
 * @constant {TeraPluginConfig}
 * @description Default configuration for the TERA sync plugin
 */
const DEFAULT_CONFIG = {
  keyPrefix: '',
  isSeparateStateForEachUser: false,
  autoSaveIntervalMinutes: 15,
  showInitialAlert: false,
  enableSaveHotkey: true
}

/**
 * @enum {string}
 * @description Save status states
 */
const SAVE_STATUS = {
  SAVED: 'Saved',
  UNSAVED: 'Unsaved changes',
  SAVING: 'Saving...'
}

/**
 * Debug logging utility function
 * @param {...*} args - Arguments to log
 */
const debugLog = (...args) => {
  if (DEBUG) console.log('[TERA File Sync]:', ...args)
}

/**
 * Error logging utility function
 * @param {Error} error - The error object
 * @param {string} context - Context description for the error
 */
const logError = (error, context) => {
  console.error(`[TERA File Sync] ${context}:`, error)
}

/**
 * Validates the plugin configuration
 * @param {TeraPluginConfig} config - The configuration to validate
 * @throws {Error} If configuration is invalid
 */
const validateConfig = (config) => {
  if (typeof config.keyPrefix !== 'string') {
    throw new Error('keyPrefix must be a string')
  }

  if (typeof config.isSeparateStateForEachUser !== 'boolean') {
    throw new Error('isSeparateStateForEachUser must be a boolean')
  }

  if (typeof config.autoSaveIntervalMinutes !== 'number' || config.autoSaveIntervalMinutes < 0) {
    throw new Error('autoSaveIntervalMinutes must be a non-negative number')
  }

  if (typeof config.showInitialAlert !== 'boolean') {
    throw new Error('showInitialAlert must be a boolean')
  }

  if (typeof config.enableSaveHotkey !== 'boolean') {
    throw new Error('enableSaveHotkey must be a boolean')
  }
}

/**
 * Validates the Vue instance has required TERA properties
 * @param {Object} instance - The Vue instance to validate
 * @throws {Error} If Vue instance is invalid
 */
const validateVueInstance = (instance) => {
  if (!instance) {
    throw new Error('Vue instance is required')
  }

  if (!instance.$tera) {
    throw new Error('Vue instance must have $tera property')
  }

  if (typeof instance.$tera.getUser !== 'function') {
    throw new Error('$tera.getUser must be a function')
  }

  if (typeof instance.$tera.getProjectFile !== 'function') {
    throw new Error('$tera.getProjectFile must be a function')
  }

  if (typeof instance.$tera.getProjectFileContents !== 'function') {
    throw new Error('$tera.getProjectFileContents must be a function')
  }

  if (typeof instance.$tera.setProjectFileContents !== 'function') {
    throw new Error('$tera.setProjectFileContents must be a function')
  }

  if (typeof instance.$tera.uiProgress !== 'function') {
    throw new Error('$tera.uiProgress must be a function')
  }
}

/**
 * Converts Maps and Sets to plain objects and arrays for serialization
 * @param {*} item - The item to convert
 * @returns {*} The converted item
 */
const mapSetToObject = (item) => {
  try {
    if (item instanceof Map) {
      debugLog('Converting Map to object')
      const obj = { __isMap: true }
      item.forEach((value, key) => {
        obj[key] = mapSetToObject(value)
      })
      return obj
    }

    if (item instanceof Set) {
      debugLog('Converting Set to array')
      return {
        __isSet: true,
        values: Array.from(item).map(mapSetToObject)
      }
    }

    if (Array.isArray(item)) {
      return item.map(mapSetToObject)
    }

    if (item && typeof item === 'object' && !(item instanceof Date)) {
      const obj = {}
      Object.entries(item).forEach(([key, value]) => {
        obj[key] = mapSetToObject(value)
      })
      return obj
    }

    return item
  } catch (error) {
    logError(error, 'mapSetToObject conversion failed')
    throw error;
  }
}

/**
 * Converts serialized objects back to Maps and Sets
 * @param {*} obj - The object to convert
 * @returns {*} The converted object with Maps and Sets restored
 */
const objectToMapSet = (obj) => {
  try {
    if (!obj || typeof obj !== 'object' || obj instanceof Date) {
      return obj
    }

    if ('__isMap' in obj) {
      debugLog('Converting object back to Map')
      const map = new Map()
      Object.entries(obj).forEach(([key, value]) => {
        if (key !== '__isMap') {
          map.set(key, objectToMapSet(value))
        }
      })
      return map
    }

    if ('__isSet' in obj) {
      debugLog('Converting array back to Set')
      return new Set(obj.values.map(objectToMapSet))
    }

    if (Array.isArray(obj)) {
      return obj.map(objectToMapSet)
    }

    const newObj = {}
    Object.entries(obj).forEach(([key, value]) => {
      newObj[key] = objectToMapSet(value)
    })
    return newObj
  } catch (error) {
    logError(error, 'objectToMapSet conversion failed')
    throw error;
  }
}

/**
 * Shows an alert notification to the user
 * @param {string} message - The message to display
 */
const showNotification = (message) => {
  if (typeof window !== 'undefined' && window.alert) {
    window.alert(message);
  } else if (alert) {
    alert(message);
  } else {
    debugLog('Alert would be shown:', message);
  }
};

/**
 * @class TeraFileSyncPlugin
 * @description Plugin class for syncing Vuex store state with TERA JSON files
 */
class TeraFileSyncPlugin {
  /**
   * @constructor
   * @param {TeraPluginConfig} [config=DEFAULT_CONFIG] - Plugin configuration
   * @throws {Error} If configuration is invalid
   */
  constructor(config = DEFAULT_CONFIG) {
    const mergedConfig = { ...DEFAULT_CONFIG, ...config }
    validateConfig(mergedConfig)

    this.config = mergedConfig
    this.initialized = false
    this.teraReady = false
    this.vueInstance = null
    this.userId = null
    this.saveInProgress = false
    this.autoSaveInterval = null
    this.store = null
    this.keydownHandler = this.handleKeyDown.bind(this)
    this.hasShownInitialAlert = false
    this.saveStatus = SAVE_STATUS.SAVED
    this.beforeUnloadHandler = this.handleBeforeUnload.bind(this); // Bind the handler
  }

  /**
   * Handle keyboard events for the Ctrl+S hotkey
   * @param {KeyboardEvent} event - The keyboard event
   */
  handleKeyDown(event) {
    // Check for Ctrl+S (Windows/Linux) or Command+S (Mac)
    if ((event.ctrlKey || event.metaKey) && event.key === 's') {
      event.preventDefault(); // Prevent the browser's save dialog
      debugLog('Ctrl+S hotkey detected, saving state');
      this.saveStateToFile(this.store.state).then(success => {
        if (success) {
          debugLog('Save completed via hotkey');
        }
      })
    }
  }

      /**
     * Handles the beforeunload event to warn users about unsaved changes.
     * @param {BeforeUnloadEvent} event - The beforeunload event.
     */
    handleBeforeUnload(event) {
      if (this.saveStatus === SAVE_STATUS.UNSAVED) {
        const message = 'You have unsaved changes. Are you sure you want to leave?';
        event.returnValue = message; // Standard for most browsers
        return message; // For some older browsers
      }
    }

  /**
   * Register the keyboard event listener for hotkeys
   */
  registerHotkeys() {
    if (!this.config.enableSaveHotkey) {
      debugLog('Save hotkey disabled in configuration');
      return;
    }

    debugLog('Registering Ctrl+S hotkey');
    if (typeof window !== 'undefined') {
      // Remove any existing handler to prevent duplicates
      window.removeEventListener('keydown', this.keydownHandler);
      // Add the event listener
      window.addEventListener('keydown', this.keydownHandler);
    }
  }

  /**
   * Remove the keyboard event listener
   */
  unregisterHotkeys() {
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.keydownHandler);
      debugLog('Unregistered hotkeys');
    }
  }

    /**
   * Registers the beforeunload event listener.
   */
  registerBeforeUnload() {
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', this.beforeUnloadHandler);
      debugLog('Registered beforeunload listener');
    }
  }

  /**
   * Unregisters the beforeunload event listener.
   */
  unregisterBeforeUnload() {
    if (typeof window !== 'undefined') {
      window.removeEventListener('beforeunload', this.beforeUnloadHandler);
      debugLog('Unregistered beforeunload listener');
    }
  }

  /**
   * Show initial alert about manual saving
   */
  showInitialAlert() {
    if (this.config.showInitialAlert && !this.hasShownInitialAlert) {
      this.hasShownInitialAlert = true;
      const message = "This TERA tool no longer automatically saves progress, use Ctrl+S, or click save in the top right corner, to save progress. (This is a short-term temporary pop-up, it will be removed at the start of April)";

      // Use Vue notification system if available
      if (this.vueInstance && this.vueInstance.$notify) {
        this.vueInstance.$notify({
          title: 'Important',
          message,
          type: 'warning',
          duration: 10000,
          showClose: true
        });
      } else {
        // Fallback to regular alert with a short delay to ensure it shows after UI loads
        setTimeout(() => {
          showNotification(message);
        }, 1000);
      }

      debugLog('Showed initial manual save alert');
    }
  }

  /**
   * Updates the save status in the store
   * @param {string} status - The new save status
   */
  updateSaveStatus(status) {
    if (!this.store) return;

    debugLog(`Updating save status: ${status}`);
    this.saveStatus = status;

    // Commit the status to the store
    this.store.commit('__tera_file_sync/updateSaveStatus', status);
  }

  /**
   * Gets the storage file name for the current user
   * @async
   * @returns {Promise<string>} The storage file name
   * @throws {Error} If unable to get user ID when separate state is enabled
   */
  async getStorageKey() {
    if (this.config.isSeparateStateForEachUser) {
      if (!this.userId) {
        try {
          const user = await this.vueInstance.$tera.getUser()
          this.userId = user.id
          debugLog('User ID initialized:', this.userId)
        } catch (error) {
          logError(error, 'Failed to get user ID')
          throw error
        }
      }
      return `${this.config.keyPrefix}-${this.userId}`
    }
    return `${this.config.keyPrefix}`
  }

  /**
   * Gets the storage file name for the current user
   * @async
   * @param {Object} options - The options passed to the function
   * @param {boolean} options.returnFullPath - Whether the full path should be returned or just the file name
   * @returns {Promise<string>} The storage file name
   * @throws {Error} If unable to get user ID when separate state is enabled
   */
  async getStorageFileName({ returnFullPath = true } = {}) {
    if (!this.vueInstance) {
      throw new Error("Error getting fileStorageName: vueInstance missing");
    }
    if (!this.vueInstance.$tera ) {
      throw new Error("Error getting fileStorageName: $tera missing");
    }
    if (!this.vueInstance.$tera.project) {
      throw new Error("Error getting fileStorageName: $tera.project missing");
    }
    if (!this.vueInstance.$tera.project.id) {
      throw new Error("Error getting fileStorageName: $tera.project.id missing");
    }
    if (!this.vueInstance.$tera.project.temp) {
      console.warn("Error getting fileStorageName: $tera.project.temp missing");
      console.warn("Creating $tera.project.temp...");
      // TODO: Work out if setProjectState is better
      this.vueInstance.$tera.project.temp = {}
    }
    const key = await this.getStorageKey();
    let fileStorageName = this.vueInstance.$tera.project.temp[key];
    if (!fileStorageName) {
      debugLog("No existing file for project/tool, creating one");
      fileStorageName = `data-${this.config.keyPrefix}-${nanoid()}.json`
      // Create file
      let newFile;
      await pRetry(async () => {
        newFile = await this.vueInstance.$tera.createProjectFile(fileStorageName);
      }, {
        retries: 2,
        minTimeout: 200,
        onFailedAttempt: error => {
          debugLog(`[Create file attempt ${error.attemptNumber}] Failed for ${fileStorageName}. Error: ${error.message}. Retries left: ${error.retriesLeft}.`);
        }
      });
      // Save new file with default state
      await pRetry(async () => {
        debugLog("Saving default state to newly created file...")
        await newFile.setContents(this.store.state);
      }, {
        retries: 2,
        minTimeout: 200,
        onFailedAttempt: error => {
          debugLog(`[Set default contents attempt ${error.attemptNumber}] Failed for ${fileStorageName}. Error: ${error.message}. Retries left: ${error.retriesLeft}.`);
        }
      });
      // Set file name in project data
      await pRetry(async () => {
        debugLog("Saving file name to project data...")
        await this.vueInstance.$tera.setProjectState(`temp.${await this.getStorageKey()}`, fileStorageName);
      }, {
        retries: 2,
        minTimeout: 200,
        onFailedAttempt: error => {
          debugLog(`[Set storage key attempt ${error.attemptNumber}] Failed for ${fileStorageName}. Error: ${error.message}. Retries left: ${error.retriesLeft}.`);
        }
      });
    }
    if (typeof fileStorageName !== 'string') {
      throw new Error(`fileStorageName is not a string: ${fileStorageName}`);
    }
    let fileName;
    if (returnFullPath) {
      fileName = `${this.vueInstance.$tera.project.id}/${fileStorageName}`;
    } else {
      fileName = fileStorageName;
    }
    return fileName;
  }

  /**
   * Loads state from JSON file
   * @async
   * @returns {Promise<Object|null>} The loaded state or null if file not found
   */
  async loadStateFromFile() {
    try {
      let fileName;
      let fileContent;

      // Load file with retries
      await pRetry(async () => {
        fileName = await this.getStorageFileName()
        debugLog(`Loading state from file: ${fileName}`)

        if (!fileName) {
          throw new Error('No file name returned when expected!');
        }

        const encodedFileName = btoa(fileName);

        fileContent = await this.vueInstance.$tera.getProjectFileContents(encodedFileName, { format: 'json' })
      }, {
        retries: 3,
        minTimeout: 1000, // 1 second initial delay
        factor: 2, // Exponential backoff
        onFailedAttempt: error => {
          debugLog(`[Load Attempt ${error.attemptNumber}] Failed for ${fileName}. Error: ${error.message}. Retries left: ${error.retriesLeft}.`);
        }
      })

      if (!fileContent) {
        debugLog('File not found or empty')
        return null
      }

      // Update last saved state for change tracking
      this.updateSaveStatus(SAVE_STATUS.SAVED);

      debugLog('State loaded from file successfully:', fileContent)
      return fileContent
    } catch (error) {
      if (error.message && error.message.includes('not found')) {
        debugLog('State file not found, will be created on first save')
        return null
      }
      logError(error, 'Failed to load state from file')
      // TODO: This can eventually be removed
      if (error.message && error.message.includes("Unexpected end of JSON input")) {
        return null // don't show notification
      }
      showNotification('Failed to load state from file, using default state')
      return null
    }
  }

  /**
   * Loads state from the file, parses it, and replaces the current store state.
   * @async
   * @returns {Promise<boolean>} True if the load was successful, false otherwise.
   */
  async loadAndApplyStateFromFile() {
    try {
      await this.vueInstance.$tera.uiProgress({ title: 'Loading tool data', backdrop: 'static' });
      const fileData = await this.loadStateFromFile();

      if (fileData) {
        const parsedState = objectToMapSet(fileData);
        this.store.replaceState({
          ...this.store.state,
          ...parsedState
        });
        debugLog('Store state replaced from file data.');
        this.updateSaveStatus(SAVE_STATUS.SAVED);
        return true;
      } else {
        // This case means the file doesn't exist or is empty.
        // We consider this a "successful" load of nothing, and mark state as unsaved.
        debugLog('No file data found to load. Using default state.');
        this.updateSaveStatus(SAVE_STATUS.UNSAVED);
        return true;
      }
    } catch (error) {
      logError(error, 'State load and apply failed.');
      showNotification('Error loading state from file.');
      return false;
    } finally {
      if (typeof this.vueInstance.$tera.uiProgress === 'function') {
        await this.vueInstance.$tera.uiProgress(false);
      }
    }
  }

  /**
   * Saves state to JSON file
   * @async
   * @param {Object} state - The state to save
   * @returns {Promise<boolean>} Whether the save was successful
   */
  async saveStateToFile(state) {
    if (this.saveInProgress) {
      debugLog('Save already in progress, skipping')
      return false
    }

    try {
      let fileName;
      this.saveInProgress = true
      this.updateSaveStatus(SAVE_STATUS.SAVING);

      // Show loading progress
      await this.vueInstance.$tera.uiProgress({ title: 'Saving tool data', backdrop: 'static' });

      // Save file with retries
      await pRetry(async () => {
        fileName = await this.getStorageFileName()

        if (!fileName) {
          throw new Error('No fileName returned')
        }

        const encodedFileName = btoa(fileName);

        const stateToSave = mapSetToObject(state)

        await this.vueInstance.$tera.setProjectFileContents(encodedFileName, stateToSave, {format: 'json'})

        // Update last saved state reference after successful save
        this.updateSaveStatus(SAVE_STATUS.SAVED);
      }, {
        retries: 3,
        minTimeout: 1000, // 1 second initial delay
        factor: 2, // Exponential backoff
        onFailedAttempt: error => {
          debugLog(`[Save Attempt ${error.attemptNumber}] Failed for ${fileName}. Error: ${error.message}. Retries left: ${error.retriesLeft}.`);
        }
      })

      debugLog(`State saved to file: ${fileName}`)
      return true
    } catch (error) {
      logError(error, 'Failed to save state to file')
      showNotification('Failed to save state to file, hit F12 for debug information or manually save via File -> Save progress')
      this.updateSaveStatus(SAVE_STATUS.UNSAVED);
      return false
    } finally {
      this.saveInProgress = false
       // Hide loading progress
      await this.vueInstance.$tera.uiProgress(false);
    }
  }

  /**
   * Initializes the store state from file or legacy data
   * @async
   * @param {Object} store - Vuex store instance
   * @param {Object} [options={}] - Initialization options
   * @param {boolean} [options.loadImmediately=true] - Whether to load from file immediately
   */
  async initializeState(store, { loadImmediately = true } = {}) {
    if (!this.teraReady || !this.vueInstance || !this.vueInstance.$tera) {
      debugLog('TERA not ready, skipping initialization')
      return
    }

    // Show loading
    if (typeof this.vueInstance.$tera.uiProgress !== 'function') {
      console.warn('Not showing loading because uiProgress is not a function')
    } else {
      await this.vueInstance.$tera.uiProgress({ title: 'Loading tool data', backdrop: 'static' })
    }

    try {
      if (loadImmediately) {
        debugLog('Initializing with immediate load from file.');
        await this.loadAndApplyStateFromFile();
      } else {
        debugLog('Skipping immediate load. State will be considered unsaved until loaded.');
        this.updateSaveStatus(SAVE_STATUS.UNSAVED);
      }

      // Show initial alert about manual saving
      this.showInitialAlert();

      // Register hotkeys
      this.registerHotkeys();

      // Register the beforeunload listener
      this.registerBeforeUnload();

    } catch (error) {
      logError(error, 'State initialization failed')
      showNotification('Error initializing state from file')
    } finally {
      this.initialized = true
      // Hide loading
      if (typeof this.vueInstance.$tera.uiProgress === 'function') {
        await this.vueInstance.$tera.uiProgress(false)
      }
    }
  }

  /**
   * Sets up automatic saving on a timer
   */
  setupAutoSave() {
    if (this.config.autoSaveIntervalMinutes <= 0) {
      debugLog('Auto-save disabled')
      return
    }

    // Clear any existing interval
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval)
    }

    const intervalMs = this.config.autoSaveIntervalMinutes * 60 * 1000
    debugLog(`Setting up auto-save every ${this.config.autoSaveIntervalMinutes} minutes`)

    this.autoSaveInterval = setInterval(() => {
      if (this.saveStatus !== SAVE_STATUS.SAVED) {
        debugLog('Auto-save triggered')
        this.saveStateToFile(this.store.state)
      } else {
        debugLog('Auto-save skipped - no changes detected')
      }
    }, intervalMs)
  }

  /**
   * Sets up state change tracking
   * @param {Object} store - Vuex store instance
   */
  setupStateChangeTracking(store) {
    // Subscribe to store mutations to track changes
    store.subscribe((mutation) => {
      // Ignore our own save status mutations
      if (mutation.type === '__tera_file_sync/updateSaveStatus') return;

      if (this.saveStatus !== SAVE_STATUS.SAVING ) {
        this.updateSaveStatus(SAVE_STATUS.UNSAVED);
      }
    });
  }

  /**
   * Set the state by prompting the user for a JSON file using TERA
   * This json file will then also be set to be the pointed to file
   * in `temp`
   */
  async setStateFromPromptedJsonFile(store) {
    try {
      // Prompt user for file
      const projectFile = await this.vueInstance.$tera.selectProjectFile({
        title: 'Load JSON file',
        showHiddenFiles: true,
      });

      // Check if a file was actually selected
      if (!projectFile) {
        debugLog('User cancelled file selection.');
        return; // Exit gracefully if no file selected
      }

      // Get data from file with retries
      const fileData = await pRetry(async () => {
        return await projectFile.getContents({ format: 'json' });
      }, {
        retries: 3,
        minTimeout: 1000,
        onFailedAttempt: error => {
          debugLog(`[Load Prompted File Attempt ${error.attemptNumber}] Failed. Error: ${error.message}. Retries left: ${error.retriesLeft}.`);
        }
      });

      // Check for null or undefined fileData and handle appropriately
      if (!fileData) {
        debugLog('Selected file is empty.');
        showNotification('The selected file is empty.'); // Notify user
        return; // Prevent further processing
      }

      // Update state
      const parsedState = objectToMapSet(fileData);
      store.replaceState({
        ...store.state,
        ...parsedState
      });

      // Replace file path with new file path
      const filePath = projectFile.path;
      this.vueInstance.$tera.setProjectState(`temp.${await this.getStorageKey()}`, filePath);
      debugLog('Store initialized from file data');
      this.updateSaveStatus(SAVE_STATUS.SAVED);
    } catch (error) {
      logError(error, 'Failed to set state from prompted JSON file');
      showNotification('Failed to load data from the selected file.'); // User-friendly error
      // Consider resetting the save status or other recovery actions here
      this.updateSaveStatus(SAVE_STATUS.UNSAVED);
    }
  }

  /**
   * Gets metadata for the storage file.
   * @async
   * @returns {Promise<Object|null>} An object with metadata (e.g., { lastModified: Date }) or null.
   */
  async getFileMetadata() {
    try {
      const fileName = await this.getStorageFileName({ returnFullPath: false });
      if (!fileName) {
        debugLog('Cannot get metadata, no storage file name available.');
        return null;
      }

      // Use a TERA API method to get the file object/metadata.
      const fileObject = await this.vueInstance.$tera.getProjectFile(fileName, { cache: false });

      if (!fileObject) {
        debugLog(`Could not retrieve file metadata for ${fileName}.`);
        return null;
      }

      const metadata = {
        modified: new Date(fileObject.modified) // Ensure it's a Date object
      };

      debugLog(`Retrieved metadata for ${fileName}:`, metadata);
      return metadata;

    } catch (error) {
      if (error.message && error.message.includes('not found')) {
        debugLog('State file not found, no metadata available.');
        return null;
      }
      logError(error, 'Failed to get file metadata');
      return null;
    }
  }

  /**
   * Creates the Vuex plugin
   * @returns {Function} Plugin installation function
   */
  createPlugin() {
    return (store) => {
      this.store = store

      // Register the module for save status
      store.registerModule('__tera_file_sync', {
        namespaced: true,
        state: {
          saveStatus: SAVE_STATUS.SAVED
        },
        mutations: {
          updateSaveStatus(state, status) {
            state.saveStatus = status;
          }
        },
        getters: {
          getSaveStatus: state => state.saveStatus
        }
      });

      // Set up change tracking
      this.setupStateChangeTracking(store);

      return {
        /**
         * Sets the TERA ready state and triggers initial load
         * @async
         */
        setTeraReady: async () => {
          validateVueInstance(this.vueInstance)
          this.teraReady = true
          await this.initializeState(store)
          // Enable autosave
          this.setupAutoSave()
        },

        /**
         * Sets the Vue instance
         * @param {Object} instance - Vue instance
         * @throws {Error} If Vue instance is invalid
         */
        setVueInstance: (instance) => {
          this.vueInstance = instance
        },

        /**
         * Manually saves the current state to file
         * @async
         * @returns {Promise<boolean>} Whether the save was successful
         */
        saveState: async () => {
          return await this.saveStateToFile(store.state)
        },

        /**
         * Gets the current save status
         * @returns {string} The current save status
         */
        getSaveStatus: () => {
          return this.saveStatus;
        },

        /**
         * Prompt the user for a new data json file
         * @returns {Promise<void>}
         */
        promptForNewJsonFile: async () => {
          return await this.setStateFromPromptedJsonFile(this.store)
        },

        /**
         * Retrieves metadata for the storage file, such as last modified date.
         * @async
         * @returns {Promise<Object|null>} Metadata object (e.g., { lastModified: Date }) or null.
         */
        getFileMetadata: async () => {
          return await this.getFileMetadata();
        },

        /**
         * Manually triggers a load from the file and replaces the store's state.
         * Use this if you initialized the plugin with `loadImmediately: false`.
         * @async
         * @returns {Promise<boolean>} True if successful.
         */
        loadStateFromFile: async () => {
          // The public method name is still `loadStateFromFile` as you requested,
          // but it now calls our clean, internal, single-responsibility function.
          return await this.loadAndApplyStateFromFile();
        },

        /**
         * Cleans up the plugin
         */
        destroy: () => {
          if (this.autoSaveInterval) {
            clearInterval(this.autoSaveInterval)
          }
          // Unregister hotkey listener
          this.unregisterHotkeys();
          // Unregister the beforeunload listener
          this.unregisterBeforeUnload();
          // Unregister store module if possible
          if (store.hasModule('__tera_file_sync')) {
            store.unregisterModule('__tera_file_sync');
          }
          this.initialized = false
          this.teraReady = false
        }
      }
    }
  }
}

/**
 * Creates a new TERA file sync plugin instance
 * @param {string} keyPrefix - Prefix for storage keys and filenames
 * @param {boolean} [isSeparateStateForEachUser=false] - Whether to maintain separate state for each user
 * @param {Object} [options={}] - Additional plugin options
 * @param {number} [options.autoSaveIntervalMinutes=10] - Auto-save interval in minutes (0 to disable)
 * @param {boolean} [options.showInitialAlert=false] - Whether to show initial alert about manual saving
 * @param {boolean} [options.enableSaveHotkey=true] - Whether to enable Ctrl+S hotkey for saving
 * @returns {Function} Plugin installation function
 * @throws {Error} If parameters are invalid
 */
const createSyncPlugin = (keyPrefix, isSeparateStateForEachUser = false, options = {}) => {
  if (typeof keyPrefix !== 'string') {
    throw new Error('keyPrefix must be a string')
  }

  const config = {
    keyPrefix,
    isSeparateStateForEachUser,
    ...options
  }

  const plugin = new TeraFileSyncPlugin(config)
  return plugin.createPlugin()
};

export { createSyncPlugin };