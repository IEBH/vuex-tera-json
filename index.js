import {nanoid} from 'nanoid';

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
  autoSaveIntervalMinutes: 10,
  showInitialAlert: true,
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

  if (typeof instance.$tera.getProjectFileContents !== 'function') {
    throw new Error('$tera.getProjectFileContents must be a function')
  }

  if (typeof instance.$tera.setProjectFileContents !== 'function') {
    throw new Error('$tera.setProjectFileContents must be a function')
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
    return item
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
    return obj
  }
}

/**
 * Shows an alert notification to the user
 * @param {string} message - The message to display
 */
const showNotification = (message) => {
  if (typeof window !== 'undefined' && window.alert) {
    window.alert(message);
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
   * Show initial alert about manual saving
   */
  showInitialAlert() {
    if (this.config.showInitialAlert && !this.hasShownInitialAlert) {
      this.hasShownInitialAlert = true;
      const message = "This tool no longer automatically saves progress, please use Ctrl+S to save progress";

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
   * @returns {Promise<string>} The storage file name
   * @throws {Error} If unable to get user ID when separate state is enabled
   */
  async getStorageFileName() {
    if (!this.vueInstance || !this.vueInstance.$tera || !this.vueInstance.$tera.project) {
      console.warn("Error getting fileStorageName: vueInstance, $tera or $tera.project missing:", this.vueInstance.$tera);
      return;
    }
    if (!this.vueInstance.$tera.project.temp) {
      console.warn("Error getting fileStorageName: $tera.project.temp missing:", this.vueInstance.$tera.project);
      console.warn("Creating $tera.project.temp...");
      // TODO: Work out if setProjectState is better
      this.vueInstance.$tera.project.temp = {}
      return;
    }
    if (!this.vueInstance.$tera.project.id) {
      console.warn("Error getting fileStorageName: $tera.project.id missing:", this.vueInstance.$tera.project);
      return;
    }
    const key = await this.getStorageKey();
    let fileStorageName = this.vueInstance.$tera.project.temp[key];
    if (!fileStorageName) {
      debugLog("No existing file for project/tool, creating one");
      fileStorageName = `data-${this.config.keyPrefix}-${nanoid()}.json`
      await this.vueInstance.$tera.createProjectFile(fileStorageName);
      this.vueInstance.$tera.setProjectState(`temp.${await this.getStorageKey()}`, fileStorageName);
      return;
    }
    if (typeof fileStorageName !== 'string') {
      throw new Error(`fileStorageName is not a string: ${fileStorageName}`);
    }
    const fullFileStoragePath = `${this.vueInstance.$tera.project.id}/${fileStorageName}`
    return fullFileStoragePath;
  }

  /**
   * Loads state from JSON file
   * @async
   * @returns {Promise<Object|null>} The loaded state or null if file not found
   */
  async loadStateFromFile() {
    try {
      const fileName = await this.getStorageFileName()
      debugLog(`Loading state from file: ${fileName}`)

      if (!fileName) {
        debugLog('No file name returned!');
        return null;
      }

      const encodedFileName = btoa(fileName);

      const fileContent = await this.vueInstance.$tera.getProjectFileContents(encodedFileName, { format: 'json' })
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
      return null
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
      this.saveInProgress = true
      this.updateSaveStatus(SAVE_STATUS.SAVING);

      const fileName = await this.getStorageFileName()

      if (!fileName) {
        throw new Error('No fileName returned')
      }

      const encodedFileName = btoa(fileName);

      const stateToSave = mapSetToObject(state)

      await this.vueInstance.$tera.setProjectFileContents(encodedFileName, stateToSave, {format: 'json'})

      // Update last saved state reference after successful save
      this.updateSaveStatus(SAVE_STATUS.SAVED);

      debugLog(`State saved to file: ${fileName}`)
      return true
    } catch (error) {
      logError(error, 'Failed to save state to file')
      this.updateSaveStatus(SAVE_STATUS.UNSAVED);
      return false
    } finally {
      this.saveInProgress = false
    }
  }

  /**
   * Initializes the store state from file or legacy data
   * @async
   * @param {Object} store - Vuex store instance
   */
  async initializeState(store) {
    if (!this.teraReady || !this.vueInstance) {
      debugLog('TERA not ready, skipping initialization')
      return
    }

    try {
      // Try to load from file
      const fileData = await this.loadStateFromFile()
      if (fileData) {
        const parsedState = objectToMapSet(fileData)
        store.replaceState({
          ...store.state,
          ...parsedState
        })
        debugLog('Store initialized from file data')
        this.updateSaveStatus(SAVE_STATUS.SAVED);
      } else {
        debugLog('No existing data found, using default store state')
        this.updateSaveStatus(SAVE_STATUS.UNSAVED);
      }

      this.initialized = true

      // Show initial alert about manual saving
      this.showInitialAlert();

      // Register hotkeys
      this.registerHotkeys();

    } catch (error) {
      logError(error, 'State initialization failed')
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
         * Cleans up the plugin
         */
        destroy: () => {
          if (this.autoSaveInterval) {
            clearInterval(this.autoSaveInterval)
          }
          // Unregister hotkey listener
          this.unregisterHotkeys();
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
 * @param {boolean} [options.showInitialAlert=true] - Whether to show initial alert about manual saving
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