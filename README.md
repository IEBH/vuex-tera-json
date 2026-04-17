# vuex-tera-json

A Vuex plugin for syncing state with Tera.

## Installation

```bash
npm install @iebh/vuex-tera-json
```

## Usage

Note: Make sure to remove any localforage/localstorage references in the store as this will create a bug where state gets carried over on new projects.

### Store Configuration (Vuex / Vue 2)

In your Vuex store configuration file (e.g. `store.js`), create your store and then create the sync plugin:

```javascript
import Vue from 'vue'
import Vuex from 'vuex'
import { createTeraSync } from '@iebh/vuex-tera-json';

Vue.use(Vuex)

const store = new Vuex.Store({
    modules: {
        // Your store modules
    }
})

// Create and export the TERA sync plugin
export const teraSyncPlugin = createTeraSync({
    keyPrefix: 'wordFreq', // unique identifier for the tool
}, store)

export default store
```

### Store Configuration (Pinia / Vue 3)

For Pinia, you need to ensure a `saveStatus` property exists in your store state.

```javascript
import { createPinia, defineStore } from 'pinia'
import { createTeraSync, SaveStatus } from '@iebh/vuex-tera-json';

const pinia = createPinia()

export const useMyStore = defineStore('main', {
  state: () => ({
    // REQUIRED: Pinia stores must have a saveStatus property for the plugin
    saveStatus: SaveStatus.SAVED,
    // Your state properties
  })
})

// Instantiate the store instance passing the pinia instance
const store = useMyStore(pinia)

export const teraSyncPlugin = createTeraSync({
    keyPrefix: 'wordFreq',
    // Define a reset state function for Pinia
    resetState: () => store.$reset() 
}, store)

export default pinia
```

### Application Initialization (Vue 2)

In your main application file (e.g. `main.js`), import the store and plugin, then initialize them with your Vue instance:

```javascript
import Vue from 'vue'
import App from './App.vue'
import store, { teraSyncPlugin } from './store'
import TeraFy from "@iebh/tera-fy/dist/terafy.es2019.js"
import TerafyVue from "@iebh/tera-fy/dist/plugin.vue2.es2019.js"

// Initialize TeraFy
const terafy = new TeraFy()
    .set("devMode", process.env.VUE_APP_TERAFY_DEV)
    .use(TerafyVue);

(async ()=> {
    const app = new Vue({
        render: h => h(App),
        store,
        created() {
            // Set up the sync plugin
            teraSyncPlugin.setVueInstance(this)
        },
        beforeDestroy() {
            // Cleanup
            teraSyncPlugin.destroy()
        }
    });

    // Initialize Tera
    await terafy.init({ app, Vue });

    // Signal that Tera is ready (returns a promise)
    await teraSyncPlugin.setTeraReady();

    app.$mount("#app");
})()
```

### Application Initialization (Vue 3)

For Vue 3, ensure you reference the correct Terfy Vue 3 plugin and configure passing a Vue component proxy.

```javascript
import { createApp } from 'vue'
import App from './App.vue'
import pinia, { teraSyncPlugin } from './store'
import TeraFy from "@iebh/tera-fy/dist/terafy.es2019.js"
import TerafyVue from "@iebh/tera-fy/dist/plugin.vue3.es2019.js"

const terafy = new TeraFy()
    .set("devMode", process.env.VUE_APP_TERAFY_DEV)
    .use(TerafyVue);

(async () => {
    const app = createApp(App)
    app.use(pinia)

    // Using a main app component to set the Vue Instance mapping
    const rootComponent = app.mount('#app')

    await terafy.init({ app })

    // Provide the component proxy (which has $tera attached)
    teraSyncPlugin.setVueInstance(rootComponent)
    await teraSyncPlugin.setTeraReady()
})()
```

## API

### Plugin Creation

- `createTeraSync(config, store)`: Creates the plugin for syncing with Tera
  - `config`: Object - Configuration tracking file paths, logic, and state.
    - `keyPrefix`: String - Unique prefix to avoid storage conflicts (default: `''`).
    - `isSeparateStateForEachUser`: Boolean - If true, state is separated per user (default: `false`).
    - `autoSaveIntervalMinutes`: Number - Auto save interval (default: `15`).
    - `showInitialAlert`: Boolean - Shows an alert on initialization (default: `false`).
    - `enableSaveHotkey`: Boolean - Enable Ctrl+S / Cmd+S save hotkey (default: `true`).
    - `loadImmediately`: Boolean - Loads state seamlessly on plugin ready (default: `true`).
    - `onBeforeSave`: Function - Optional hook for custom logic before saving.
    - `resetState`: Function - Optional function to reset store state before loading data.
  - `store`: `VuexStore | PiniaStore | PlainObjectStore` - The compatible store to sync state from.

### Plugin Methods

- `setVueInstance(instance)`: Sets the Vue instance for the sync plugin
- `setTeraReady()`: Signals that Tera is ready and initiates the first sync based on `loadImmediately`. Returns a promise.
- `saveState()`: Manually trigger state save to TERA file. Returns a boolean promise on success.
- `promptForNewJsonFile()`: Wait for the user to select another standard `.json` file for loading or creating. Returns a promise.
- `loadAndApplyStateFromFile()`: Replace store state manually. Returns a promise.
- `createDataFileBackup()`: Save a data backup as a trailing-time JSON file into TERA. Returns a promise.
- `getFileMetadata()`: Provide basic file metadata, resolving to `{ modified: Date } | null`. Returns a promise.
- `destroy()`: Cleans up resources inside the plugin when the instance is completely destroyed.

## Best Practices

1. Always export the plugin instance if you need to access its methods outside the store
2. Call `setVueInstance()` in your Vue app's `created` hook
3. Call `destroy()` in your Vue app's `beforeDestroy` hook to prevent memory leaks
4. Initialize Tera before calling `setTeraReady()`

## License

MIT
