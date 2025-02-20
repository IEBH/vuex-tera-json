# vuex-tera-json

A Vuex plugin for syncing state with Tera.

## Installation

```bash
npm install @iebh/vuex-tera-json
```

## Usage

Note: Make sure to remove any localforage/localstorage references in the store as this will create a bug where state gets carried over on new projects.

### Store Configuration

In your Vuex store configuration file (e.g. `store.js`), create and export the sync plugin, then add it to your store:

```javascript
import Vue from 'vue'
import Vuex from 'vuex'
import { createSyncPlugin } from '@iebh/vuex-tera-json';

Vue.use(Vuex)

// Create and export the TERA sync plugin
// Parameters:
// 1. key: unique identifier for the tool (e.g. 'wordFreq')
// 2. debug: boolean for debug mode
// 3. options: configuration object (optional)
export const teraSyncPlugin = createSyncPlugin('wordFreq', false, {
    debounceMs: 100 // Debounce time in milliseconds
})

export default new Vuex.Store({
    modules: {
        // Your store modules
    },
    plugins: [teraSyncPlugin]
})
```

### Application Initialization

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
    .setIfDev("verbosity", process.env.VUE_APP_TERAFY_VERBOSITY)
    .use(TerafyVue);

(async ()=> {
    const app = new Vue({
        render: h => h(App),
        store,
        created() {
            // Set up the sync plugin
            teraSyncPlugin(store).setVueInstance(this)
        },
        beforeDestroy() {
            // Cleanup
            teraSyncPlugin(store).destroy()
        }
    });

    // Initialize Tera
    await terafy.init({
        app,
        Vue
    });

    // Signal that Tera is ready
    teraSyncPlugin(store).setTeraReady();

    app.$mount("#app");
})()
```

## API

### Plugin Creation

- `createSyncPlugin(key, debug, options)`: Creates the Vuex plugin for syncing with Tera
  - `key`: String - Unique identifier for the tool (e.g. 'wordFreq')
  - `debug`: Boolean - Enable debug mode
  - `options`: Object - Configuration options
    - `debounceMs`: Number - Debounce time in milliseconds (default: 100)

### Plugin Methods

- `setVueInstance(instance)`: Sets the Vue instance for the sync plugin
- `setTeraReady()`: Signals that Tera is ready and initiates the first sync
- `destroy()`: Cleans up the plugin when the Vue instance is destroyed

## Best Practices

1. Always export the plugin instance if you need to access its methods outside the store
2. Call `setVueInstance()` in your Vue app's `created` hook
3. Call `destroy()` in your Vue app's `beforeDestroy` hook to prevent memory leaks
4. Initialize Tera before calling `setTeraReady()`

## License

MIT
