// index.js

let vueInstance = null;
let syncPluginInstance = null;

const createSyncPlugin = () => (store) => {
  let initialized = false;
  let teraReady = false;

  const syncState = () => {
    if (!teraReady || !vueInstance) return;

    if (vueInstance && vueInstance.$tera && vueInstance.$tera.state) {
      if (!vueInstance.$tera.state.temp) {
        vueInstance.$tera.state.temp = {};
      }

      if (!initialized && vueInstance.$tera.state.temp.wordFreq) {
        // Initialize store from Tera state
        store.replaceState({
          ...store.state,
          ...vueInstance.$tera.state.temp.wordFreq
        });
        console.log("Vuex store initialized from Tera state");
      } else {
        // Sync from Vuex to Tera
        vueInstance.$tera.state.temp.wordFreq = store.state;
      }

      if (!initialized) {
        initialized = true;
        console.log("Sync plugin initialized");
      }
    } else {
      console.error("Unable to sync with TERA state");
    }
  };

  store.subscribe((mutation, state) => {
    if (teraReady) {
      syncState();
    }
  });

  syncPluginInstance = {
    setTeraReady: () => {
      teraReady = true;
      syncState(); // Attempt initial sync when Tera becomes ready
    }
  };

  return syncPluginInstance;
};

const setVueInstance = (instance) => {
  vueInstance = instance;
};

const setTeraReady = () => {
  if (syncPluginInstance) {
    syncPluginInstance.setTeraReady();
  }
};

module.exports = {
  createSyncPlugin,
  setVueInstance,
  setTeraReady
};