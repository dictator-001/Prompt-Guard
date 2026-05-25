(function initBrowserApi(root) {
  const api = root.browser || root.chrome;

  function isPromiseApi() {
    return Boolean(root.browser && api === root.browser);
  }

  function callWithCallback(target, method, args) {
    return new Promise((resolve, reject) => {
      target[method](...args, (...results) => {
        const lastError = api.runtime && api.runtime.lastError;
        if (lastError) {
          reject(new Error(lastError.message));
          return;
        }

        resolve(results.length > 1 ? results : results[0]);
      });
    });
  }

  async function call(target, method, ...args) {
    if (!api || !target || typeof target[method] !== "function") {
      throw new Error(`Extension API unavailable: ${method}`);
    }

    if (isPromiseApi()) {
      return target[method](...args);
    }

    return callWithCallback(target, method, args);
  }

  root.PromptGuardBrowser = {
    raw: api,
    storage: {
      get: (keys) => call(api.storage.local, "get", keys),
      set: (items) => call(api.storage.local, "set", items),
      remove: (keys) => call(api.storage.local, "remove", keys)
    },
    runtime: {
      sendMessage: (message) => call(api.runtime, "sendMessage", message)
    },
    tabs: {
      query: (queryInfo) => call(api.tabs, "query", queryInfo),
      sendMessage: (tabId, message) => call(api.tabs, "sendMessage", tabId, message).catch(() => undefined)
    },
    permissions: {
      request: (permissions) => call(api.permissions, "request", permissions),
      contains: (permissions) => call(api.permissions, "contains", permissions)
    },
    scripting: {
      executeScript: (details) => call(api.scripting, "executeScript", details),
      insertCSS: (details) => call(api.scripting, "insertCSS", details),
      registerContentScripts: (scripts) => call(api.scripting, "registerContentScripts", scripts),
      unregisterContentScripts: (filter) => call(api.scripting, "unregisterContentScripts", filter),
      getRegisteredContentScripts: (filter) => call(api.scripting, "getRegisteredContentScripts", filter)
    },
    action: {
      setBadgeText: (details) => call(api.action, "setBadgeText", details).catch(() => undefined),
      setBadgeBackgroundColor: (details) => call(api.action, "setBadgeBackgroundColor", details).catch(() => undefined)
    }
  };
})(globalThis);
