/**
 * @constant {boolean}
 * @description Debug mode flag for logging
 */
const DEBUG = false

/**
 * @typedef {Object} TeraPluginConfig
 * @property {string} keyPrefix - Prefix for storage keys
 * @property {boolean} isSeparateStateForEachUser - Whether to maintain separate state for each user
 * @property {number} debounceMs - Debounce timeout in milliseconds for state sync
 */

/**
 * @constant {TeraPluginConfig}
 * @description Default configuration for the TERA sync plugin
 */
const DEFAULT_CONFIG = {
  keyPrefix: '',
  isSeparateStateForEachUser: false,
  debounceMs: 100
}

/**
 * Debug logging utility function
 * @param {...*} args - Arguments to log
 */
const debugLog = (...args) => {
  if (DEBUG) console.log('[TERA Sync]:', ...args)
}

/**
 * Error logging utility function
 * @param {Error} error - The error object
 * @param {string} context - Context description for the error
 */
const logError = (error, context) => {
  console.error(`[TERA Sync] ${context}:`, error)
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

  if (typeof config.debounceMs !== 'number' || config.debounceMs < 0) {
    throw new Error('debounceMs must be a non-negative number')
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

  if (typeof instance.$tera.setProjectState !== 'function') {
    throw new Error('$tera.setProjectState must be a function')
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
 * @class TeraSyncPlugin
 * @description Plugin class for syncing Vuex store state with TERA
 */
class TeraSyncPlugin {
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
    this.syncInProgress = false
    this.pendingSync = false
  }

  /**
   * Gets the storage key for the current user
   * @async
   * @returns {Promise<string>} The storage key
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
    return this.config.keyPrefix
  }

  /**
   * Checks for and migrates legacy data
   * @async
   * @returns {Promise<Object|null>} Legacy data if found, null otherwise
   */
  async checkAndMigrateLegacyData() {
    try {
      if (
        !this.vueInstance ||
        !this.vueInstance.$tera ||
        !this.vueInstance.$tera.state ||
        !this.vueInstance.$tera.state.temp
      ) {
        return null;
      }

      const userKey = await this.getStorageKey()
      const legacyKey = this.config.keyPrefix

      const hasUserData = this.vueInstance.$tera.state.temp[userKey]
      if (hasUserData) {
        debugLog('User-specific data found')
        return hasUserData
      }

      const legacyData = this.vueInstance.$tera.state.temp[legacyKey]
      if (legacyData) {
        debugLog('Migrating legacy data')
        await this.vueInstance.$tera.setProjectState(`temp.${userKey}`, legacyData)
        return legacyData
      }

      return null
    } catch (error) {
      logError(error, 'Legacy data migration failed')
      return null
    }
  }

  /**
   * Syncs the Vuex store state with TERA
   * @async
   * @param {Object} store - Vuex store instance
   */
  async syncState(store) {
    if (this.syncInProgress) {
      this.pendingSync = true
      return
    }

    try {
      this.syncInProgress = true

      if (!this.teraReady || !this.vueInstance) {
        return
      }

      if (!this.vueInstance.$tera.state.temp) {
        this.vueInstance.$tera.state.temp = {}
      }

      if (!this.initialized) {
        const existingData = this.config.isSeparateStateForEachUser
          ? await this.checkAndMigrateLegacyData()
          : await this.vueInstance.$tera.state.temp[await this.getStorageKey()]

        if (existingData) {
          const parsedState = objectToMapSet(existingData)
          store.replaceState({
            ...store.state,
            ...parsedState
          })
          debugLog('Store initialized from existing data')
        }
        this.initialized = true
      }

      const stateToSave = mapSetToObject(store.state)
      await this.vueInstance.$tera.setProjectState(`temp.${await this.getStorageKey()}`, stateToSave)
      debugLog('State synced to TERA')

    } catch (error) {
      logError(error, 'State sync failed')
    } finally {
      this.syncInProgress = false
      if (this.pendingSync) {
        this.pendingSync = false
        this.syncState(store)
      }
    }
  }

  /**
   * Creates the Vuex plugin
   * @returns {Function} Plugin installation function
   */
  createPlugin() {
    return (store) => {
      // Debounced store subscription
      let syncTimeout = null
      store.subscribe(() => {
        if (this.teraReady) {
          clearTimeout(syncTimeout)
          syncTimeout = setTimeout(
            () => this.syncState(store),
            this.config.debounceMs
          )
        }
      })

      return {
        /**
         * Sets the TERA ready state and triggers initial sync
         * @async
         */
        setTeraReady: async () => {
          this.teraReady = true
          await this.syncState(store)
        },

        /**
         * Sets the Vue instance
         * @param {Object} instance - Vue instance
         * @throws {Error} If Vue instance is invalid
         */
        setVueInstance: (instance) => {
          validateVueInstance(instance)
          this.vueInstance = instance
        },

        /**
         * Cleans up the plugin
         */
        destroy: () => {
          clearTimeout(syncTimeout)
          this.initialized = false
          this.teraReady = false
        }
      }
    }
  }
}

/**
 * Creates a new TERA sync plugin instance
 * @param {string} keyPrefix - Prefix for storage keys
 * @param {boolean} [isSeparateStateForEachUser=false] - Whether to maintain separate state for each user
 * @param {Object} [options={}] - Additional plugin options
 * @param {number} [options.debounceMs=100] - Debounce timeout in milliseconds
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

  const plugin = new TeraSyncPlugin(config)
  return plugin.createPlugin()
}

module.exports = { createSyncPlugin }