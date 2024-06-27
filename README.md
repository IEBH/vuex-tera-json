# vuex-tera-sync

A Vuex plugin for syncing state with Tera.

## Installation

```bash
npm install vuex-tera-sync
```

## Usage

In your Vuex store configuration:

```javascript
import Vuex from 'vuex';
import { createSyncPlugin } from 'vuex-tera-sync';

const store = new Vuex.Store({
  // ... your store configuration
  plugins: [createSyncPlugin()]
});

export default store;
```

In your main.js or app initialization:

```javascript
import { setVueInstance, setTeraReady } from 'vuex-tera-sync';
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

- `createSyncPlugin()`: Creates the Vuex plugin for syncing with Tera.
- `setVueInstance(instance)`: Sets the Vue instance for the sync plugin.
- `setTeraReady()`: Signals that Tera is ready and initiates the first sync.

## License

MIT
