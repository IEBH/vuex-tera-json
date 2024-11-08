let vueInstance = null
let syncPluginInstance = null
let userId = null

const DEBUG = false  // Set to false to disable debug logs

function debugLog(...args) {
  if (DEBUG) {
    console.log(...args)
  }
}

// Helper function to convert Maps and Sets to plain objects recursively, preserving regular objects
const mapSetToObject = (item) => {
  if (item instanceof Map) {
    debugLog('Converting Map to object:', item)
    const obj = {}
    obj.__isMap = true  // Set the __isMap property for Map objects
    item.forEach((value, key) => {
      obj[key] = mapSetToObject(value)
    })
    debugLog('Converted Map:', obj)
    return obj
  } else if (item instanceof Set) {
    debugLog('Converting Set to array:', item)
    const arr = Array.from(item).map(mapSetToObject)
    return { __isSet: true, values: arr }  // Mark as Set and store values
  } else if (Array.isArray(item)) {
    return item.map(mapSetToObject)
  } else if (item && typeof item === 'object' && !(item instanceof Date)) {
    const obj = {}
    Object.entries(item).forEach(([key, value]) => {
      obj[key] = mapSetToObject(value)
    })
    return obj
  }
  return item
}

// Helper function to convert plain objects back to Maps and Sets recursively, only where necessary
const objectToMapSet = (obj) => {
  if (obj && typeof obj === 'object' && !(obj instanceof Map) && !(obj instanceof Set) && !(obj instanceof Date)) {
    if ('__isMap' in obj) {
      debugLog('Converting object back to Map:', obj)
      const map = new Map()
      Object.entries(obj).forEach(([key, value]) => {
        if (key !== '__isMap') {
          map.set(key, objectToMapSet(value))
        }
      })
      debugLog('Converted back to Map:', map)
      return map
    } else if ('__isSet' in obj) {
      debugLog('Converting array back to Set:', obj.values)
      return new Set(obj.values.map(objectToMapSet))
    } else if (Array.isArray(obj)) {
      return obj.map(objectToMapSet)
    } else {
      const newObj = {}
      Object.entries(obj).forEach(([key, value]) => {
        newObj[key] = objectToMapSet(value)
      })
      return newObj
    }
  }
  return obj
}

const createSyncPlugin = (keyPrefix, isSeperateStateForEachUser=false) => {
  return (store) => {
    let initialized = false
    let teraReady = false

    const getStorageKey = () => {
      // If isSeperateStateForEachUser is false, just use keyPrefix
      return isSeperateStateForEachUser ? `${keyPrefix}-${userId}` : keyPrefix
    }

    // Function to handle checking and migrating legacy data
    const checkAndMigrateLegacyData = async () => {
      if (!vueInstance || !vueInstance.$tera || !vueInstance.$tera.state || !vueInstance.$tera.state.temp) return null

      const userKey = getStorageKey()
      const legacyKey = keyPrefix

      // Check if user-specific data exists
      const hasUserData = vueInstance.$tera.state.temp[userKey]
      if (hasUserData) {
        debugLog('User-specific data found, no migration needed')
        return vueInstance.$tera.state.temp[userKey]
      }

      // Check for legacy data
      const legacyData = vueInstance.$tera.state.temp[legacyKey]
      if (legacyData) {
        debugLog('Found legacy data, migrating to user-specific key')
        // Migrate legacy data to user-specific key
        await vueInstance.$tera.setProjectState(`temp.${userKey}`, legacyData)
        // Optionally, clear legacy data
        // await vueInstance.$tera.setProjectState(`temp.${legacyKey}`, null)
        debugLog('Legacy data migration complete')
        return legacyData
      }

      debugLog('No existing data found')
      return null
    }

    const getExistingState = async () => {
      if (!vueInstance?.$tera?.state?.temp) return null
      const key = getStorageKey()
      return vueInstance.$tera.state.temp[key] || null
    }

    const syncState = async () => {
      // For non-separate state, we don't need userId to proceed
      if (!teraReady || !vueInstance || (isSeperateStateForEachUser && !userId)) return

      if (vueInstance && vueInstance.$tera && vueInstance.$tera.state) {
        if (!vueInstance.$tera.state.temp) {
          debugLog('Creating temp variable to store data')
          vueInstance.$tera.state.temp = {}
        }

        if (!initialized) {
          // Only check for legacy data if isSeperateStateForEachUser is true
          const existingData = isSeperateStateForEachUser
            ? await checkAndMigrateLegacyData()
            : await getExistingState()

          if (existingData) {
            // Initialize store from existing data
            debugLog('Initializing store from existing data')
            const parsedState = objectToMapSet(existingData)
            store.replaceState({
              ...store.state,
              ...parsedState
            })
            debugLog('Vuex store initialized from existing data')
          } else {
            // No existing data found, save current state
            debugLog('No existing data found, saving current state')
            const stateToSave = mapSetToObject(store.state)
            await vueInstance.$tera.setProjectState(`temp.${getStorageKey()}`, stateToSave)
            debugLog('Initial state saved to TERA')
          }
        } else {
          // Regular sync from Vuex to Tera
          debugLog('Syncing Vuex store to Tera:', store.state)
          const stateToSave = mapSetToObject(store.state)
          await vueInstance.$tera.setProjectState(`temp.${getStorageKey()}`, stateToSave)
          debugLog('Vuex store synced to TERA state')
        }

        if (!initialized) {
          initialized = true
          debugLog('Sync plugin initialized')
        }
      } else {
        console.error('Unable to sync with TERA state')
      }
    }

    store.subscribe(() => {
      if (teraReady && (!isSeperateStateForEachUser || userId)) {
        syncState()
      }
    })

    syncPluginInstance = {
      setTeraReady: async () => {
        if (isSeperateStateForEachUser && !userId && vueInstance && vueInstance.$tera) {
          try {
            const user = await vueInstance.$tera.getUser()
            userId = user.id
            debugLog('User ID initialized:', userId)
          } catch (error) {
            console.error('Failed to get user ID:', error)
            return
          }
        }
        teraReady = true
        syncState() // Attempt initial sync when Tera becomes ready
      }
    }

    return syncPluginInstance
  }
}

const setVueInstance = (instance) => {
  vueInstance = instance
}

const setTeraReady = () => {
  if (syncPluginInstance) {
    syncPluginInstance.setTeraReady()
  }
}

module.exports = {
  createSyncPlugin,
  setVueInstance,
  setTeraReady
}