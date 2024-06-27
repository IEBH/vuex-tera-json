# vuex-tera-sync

A Vuex plugin for syncing state with Tera.

## Installation

```bash
npm install vuex-tera-sync
```

## Usage

In your Vuex store configuration, initialize the plugin with `createSyncPlugin(KEY)` where key is a unique identifier for the tool (e.g. `wordFreq` or `polyglot`, etc.):

```javascript
import Vuex from 'vuex';
import { createSyncPlugin } from '@iebh/vuex-tera-sync';

const store = new Vuex.Store({
  // ... your store configuration
  // replace `wordFreq` with the unique identifying key
  plugins: [createSyncPlugin('wordFreq')]
});

export default store;
```

In your main.js or app initialization:

```javascript
import { setVueInstance, setTeraReady } from '@iebh/vuex-tera-sync';
import store from './store';

// ... your Vue app initialization

const app = new Vue({
  store,
  // ... your Vue app configuration
});

setVueInstance(app);

// After Tera is initialized
await terafy.init({
  app,
  Vue
});

setTeraReady();

app.$mount("#app");
```

## API

- `createSyncPlugin(key)`: Creates the Vuex plugin for syncing with Tera. The key parameter specifies the `key` in the Tera state to be used for syncing.
- `setVueInstance(instance)`: Sets the Vue instance for the sync plugin.
- `setTeraReady()`: Signals that Tera is ready and initiates the first sync.

## License

MIT
