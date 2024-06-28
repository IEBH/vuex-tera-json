let vueInstance = null
let syncPluginInstance = null

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

const createSyncPlugin = (key) => (store) => {
  let initialized = false
  let teraReady = false

  const syncState = () => {
    if (!teraReady || !vueInstance) return

    if (vueInstance && vueInstance.$tera && vueInstance.$tera.state) {
      if (!vueInstance.$tera.state.temp) {
        debugLog('Creating temp variable to store data')
        vueInstance.$tera.state.temp = {}
      }

      if (!initialized && vueInstance.$tera.state.temp[key]) {
        // Initialize store from Tera state
        debugLog('Initializing store from Tera state:', vueInstance.$tera.state.temp[key])
        const parsedState = objectToMapSet(vueInstance.$tera.state.temp[key])
        debugLog('Parsed state:', parsedState)
        store.replaceState({
          ...store.state,
          ...parsedState
        })
        debugLog('Vuex store initialized from Tera state')
      } else {
        // Sync from Vuex to Tera
        debugLog('Syncing Vuex store to Tera:', store.state)
        const stateToSave = mapSetToObject(store.state)
        debugLog('State to save:', stateToSave)
        vueInstance.$tera.setProjectState(`temp.${key}`, stateToSave)
        debugLog('Vuex store synced to TERA state using setProjectState')
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
    if (teraReady) {
      syncState()
    }
  })

  syncPluginInstance = {
    setTeraReady: () => {
      teraReady = true
      syncState() // Attempt initial sync when Tera becomes ready
    }
  }

  return syncPluginInstance
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