/*
  idb-keyval
  Version: 6.2.0
  https://github.com/jakearchibald/idb-keyval/blob/main/dist/idb-keyval-iife.js
*/
var idbKeyval = (function (exports) {
  'use strict';

  // This is a simplified version of the library's IIFE distribution.
  // It provides the 'get', 'set', 'del', 'keys' functions globally.

  const STORE_NAME = 'keyval';
  const DB_NAME = 'keyval-store';

  function promisifyRequest(request) {
    return new Promise((resolve, reject) => {
      request.oncomplete = request.onsuccess = () => resolve(request.result);
      request.onabort = request.onerror = () => reject(request.error);
    });
  }

  function createStore(dbName, storeName) {
    const request = indexedDB.open(dbName);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName);
    const dbp = promisifyRequest(request);
    return (txMode, callback) =>
      dbp.then(db => callback(db.transaction(storeName, txMode).objectStore(storeName)));
  }

  let defaultStore = createStore(DB_NAME, STORE_NAME);

  function get(key, store = defaultStore) {
    return store('readonly', store => promisifyRequest(store.get(key)));
  }

  function set(key, value, store = defaultStore) {
    return store('readwrite', store => {
      store.put(value, key);
      return promisifyRequest(store.transaction);
    });
  }

  function del(key, store = defaultStore) {
    return store('readwrite', store => {
      store.delete(key);
      return promisifyRequest(store.transaction);
    });
  }

  function clear(store = defaultStore) {
    return store('readwrite', store => {
      store.clear();
      return promisifyRequest(store.transaction);
    });
  }

  function keys(store = defaultStore) {
    return store('readonly', store => promisifyRequest(store.getAllKeys()));
  }

  function values(store = defaultStore) {
    return store('readonly', store => promisifyRequest(store.getAll()));
  }

  function entries(store = defaultStore) {
    return store('readonly', store => promisifyRequest(store.getAll()));
  }

  exports.clear = clear;
  exports.del = del;
  exports.get = get;
  exports.entries = entries;
  exports.keys = keys;
  exports.set = set;
  exports.values = values;

  Object.defineProperty(exports, '__esModule', { value: true });

  return exports;

})({});

// ADD THIS LINE AT THE VERY END OF THE FILE
export const { get, set, del, clear, keys, values, entries } = idbKeyval;
