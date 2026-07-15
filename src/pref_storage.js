/**
 * A local key/value store for JSON-encodable values. Supports Electron file, localStorage, chrome.storage.local, and in-memory backends.
 *
 * Supply keyPrefix if you want it automatically prepended to key names.
 */
export function PrefStorage(keyPrefix) {
  let LOCALSTORAGE = 0,
    CHROME_STORAGE_LOCAL = 1,
    MEMORY = 2,
    ELECTRON_FILE = 3,
    mode,
    memoryStorage = {};

  this.get = function (name, onGet) {
    name = keyPrefix + name;

    switch (mode) {
      case ELECTRON_FILE:
        window.electronAPI.storeGet(name).then(onGet);
        break;
      case LOCALSTORAGE:
        var parsed = null;

        if (globalThis.localStorage) {
          try {
            parsed = JSON.parse(globalThis.localStorage[name]);
          } catch (e) {}
        }

        onGet(parsed);
        break;
      case CHROME_STORAGE_LOCAL:
        chrome.storage.local.get(name, function (data) {
          onGet(data[name]);
        });
        break;
      case MEMORY:
        onGet(memoryStorage[name] ?? null);
        break;
    }
  };

  this.set = function (name, value) {
    name = keyPrefix + name;

    switch (mode) {
      case ELECTRON_FILE:
        window.electronAPI.storeSet(name, value);
        break;
      case LOCALSTORAGE:
        if (globalThis.localStorage) {
          try {
            globalThis.localStorage[name] = JSON.stringify(value);
          } catch (e) {
            console.warn('Failed to save to localStorage:', e.message);
          }
        }
        break;
      case CHROME_STORAGE_LOCAL:
        var data = {};

        data[name] = value;

        chrome.storage.local.set(data);
        break;
      case MEMORY:
        memoryStorage[name] = value;
        break;
    }
  };

  if (globalThis.electronAPI) {
    mode = ELECTRON_FILE;
  } else if (globalThis.chrome?.storage?.local) {
    mode = CHROME_STORAGE_LOCAL;
  } else if (globalThis.localStorage) {
    try {
      const testKey = '__pref_storage_test__';
      globalThis.localStorage.setItem(testKey, 'test');
      globalThis.localStorage.removeItem(testKey);
      mode = LOCALSTORAGE;
    } catch (e) {
      console.warn('localStorage is not available, falling back to in-memory storage:', e.message);
      mode = MEMORY;
    }
  } else {
    mode = MEMORY;
  }

  keyPrefix = keyPrefix || "";
}
