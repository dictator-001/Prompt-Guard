(function initBackground(root) {
  if (typeof importScripts === "function" && !root.PromptGuardBrowser) {
    importScripts(
      "../shared/browser-api.js",
      "../shared/default-rules.js",
      "../shared/detector.js",
      "../shared/settings.js"
    );
  }

  const api = root.PromptGuardBrowser;
  const rawApi = api.raw;
  const settingsHelper = root.PromptGuardSettings;
  const detector = root.PromptGuardDetector;
  const contentScriptId = "prompt-guard-monitor";

  const severityColors = {
    CRITICAL: "#b91c1c",
    HIGH: "#c2410c",
    MEDIUM: "#b45309",
    LOW: "#2563eb"
  };

  const lastSignatureByTab = new Map();
  const latestAlertByTab = new Map();

  async function loadSettings() {
    const data = await api.storage.get(settingsHelper.storageKeys.settings);
    return settingsHelper.mergeSettings(data[settingsHelper.storageKeys.settings]);
  }

  async function saveSettings(settings) {
    const merged = settingsHelper.mergeSettings(settings);
    await api.storage.set({ [settingsHelper.storageKeys.settings]: merged });
    await registerContentScripts(merged);
    await broadcastSettings(merged);
    return merged;
  }

  function domainFromUrl(url) {
    try {
      return new URL(url).hostname;
    } catch (error) {
      return "unknown";
    }
  }

  function sanitizeMatches(matches) {
    if (!Array.isArray(matches)) {
      return [];
    }

    return matches
      .filter((match) => match && match.ruleId && match.fieldName && match.severity)
      .map((match) => ({
        ruleId: String(match.ruleId),
        severity: String(match.severity),
        fieldName: String(match.fieldName),
        risk: String(match.risk || ""),
        start: Number.isInteger(match.start) ? match.start : 0,
        end: Number.isInteger(match.end) ? match.end : 0,
        maskedValue: String(match.maskedValue || "")
      }));
  }

  function signatureFor(matches) {
    return matches
      .map((match) => `${match.ruleId}:${match.start}:${match.end}:${match.maskedValue}`)
      .sort()
      .join("|");
  }

  async function setBadge(tabId, matches) {
    if (typeof tabId !== "number") {
      return;
    }

    if (!matches.length) {
      await api.action.setBadgeText({ tabId, text: "" });
      return;
    }

    const highestSeverity = detector.highestSeverity(matches);
    await api.action.setBadgeText({ tabId, text: String(Math.min(matches.length, 99)) });
    await api.action.setBadgeBackgroundColor({
      tabId,
      color: severityColors[highestSeverity] || severityColors.LOW
    });
  }

  function canAccessTab(tab) {
    return Boolean(tab && typeof tab.id === "number" && /^https?:\/\//i.test(tab.url || ""));
  }

  async function injectContentScript(tabId) {
    const target = { tabId, allFrames: false };
    await api.scripting.insertCSS({
      target,
      files: ["content/content.css"]
    }).catch(() => undefined);

    await api.scripting.executeScript({
      target,
      files: [
        "shared/browser-api.js",
        "shared/default-rules.js",
        "shared/detector.js",
        "shared/settings.js",
        "content/content.js"
      ]
    });
  }

  async function requestTabScan(tab) {
    if (!canAccessTab(tab)) {
      return { ok: false, error: "This page cannot be scanned by a browser extension." };
    }

    let response = await api.tabs.sendMessage(tab.id, { type: "REQUEST_SCAN" });
    if (response && response.ok) {
      return response;
    }

    await injectContentScript(tab.id).catch(() => undefined);
    response = await api.tabs.sendMessage(tab.id, { type: "REQUEST_SCAN" });
    return response || { ok: false, error: "Scanner is not available on this tab yet. Refresh the tab and try again." };
  }

  async function unregisterContentScripts() {
    const registered = await api.scripting.getRegisteredContentScripts({ ids: [contentScriptId] }).catch(() => []);
    if (registered && registered.length) {
      await api.scripting.unregisterContentScripts({ ids: [contentScriptId] });
    }
  }

  async function registerContentScripts(settings) {
    const matches = settingsHelper.getEnabledCustomMatchPatterns(settings);
    await unregisterContentScripts();

    if (!matches.length) {
      return;
    }

    await api.scripting.registerContentScripts([
      {
        id: contentScriptId,
        matches,
        js: [
          "shared/browser-api.js",
          "shared/default-rules.js",
          "shared/detector.js",
          "shared/settings.js",
          "content/content.js"
        ],
        css: ["content/content.css"],
        runAt: "document_idle",
        allFrames: false,
        persistAcrossSessions: true
      }
    ]);
  }

  async function broadcastSettings(settings) {
    const tabs = await api.tabs.query({}).catch(() => []);
    await Promise.all(
      tabs
        .filter((tab) => typeof tab.id === "number")
        .map((tab) => api.tabs.sendMessage(tab.id, { type: "SETTINGS_UPDATED", settings }))
    );
  }

  async function clearAllBadges() {
    const tabs = await api.tabs.query({}).catch(() => []);
    await Promise.all(
      tabs
        .filter((tab) => typeof tab.id === "number")
        .map((tab) => api.action.setBadgeText({ tabId: tab.id, text: "" }))
    );
  }

  async function handleScanResult(message, sender) {
    const tabId = sender.tab && sender.tab.id;
    const matches = sanitizeMatches(message.matches);
    const signature = signatureFor(matches);

    await setBadge(tabId, matches);

    if (!matches.length) {
      if (typeof tabId === "number") {
        lastSignatureByTab.delete(tabId);
        latestAlertByTab.delete(tabId);
      }
      return { ok: true };
    }

    if (typeof tabId === "number" && lastSignatureByTab.get(tabId) === signature) {
      return { ok: true, duplicate: true };
    }

    if (typeof tabId === "number") {
      lastSignatureByTab.set(tabId, signature);
    }

    const summary = detector.summarizeMatches(matches);
    const record = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      timestamp: Date.now(),
      tabId: typeof tabId === "number" ? tabId : null,
      domain: domainFromUrl(sender.url || ""),
      highestSeverity: summary.highestSeverity,
      matchCount: summary.count,
      fields: summary.fields,
      maskedSnippets: summary.maskedSnippets
    };

    if (typeof tabId === "number") {
      latestAlertByTab.set(tabId, record);
    }

    return { ok: true, record };
  }

  async function popupState(message) {
    const settings = await loadSettings();
    const tabId = Number.isInteger(message.tabId) ? message.tabId : null;
    const activeTabAlert = tabId === null ? null : latestAlertByTab.get(tabId) || null;
    return {
      ok: true,
      settings,
      activeTabAlert,
      defaults: {
        domains: settingsHelper.defaultDomains,
        rules: root.PromptGuardDefaultRules
      }
    };
  }

  async function activeScanState(message) {
    const tabs = await api.tabs.query({ active: true, currentWindow: true }).catch(() => []);
    const activeTab = tabs[0];
    await requestTabScan(activeTab).catch(() => undefined);
    return popupState({ tabId: activeTab && activeTab.id ? activeTab.id : message.tabId });
  }

  async function handleMessage(message, sender) {
    if (!message || typeof message.type !== "string") {
      return { ok: false, error: "Invalid message." };
    }

    switch (message.type) {
      case "GET_SETTINGS": {
        const settings = await loadSettings();
        return { ok: true, settings, defaultDomains: settingsHelper.defaultDomains };
      }
      case "SCAN_RESULT":
        return handleScanResult(message, sender || {});
      case "GET_POPUP_STATE":
        return popupState(message);
      case "REQUEST_ACTIVE_SCAN":
        return activeScanState(message);
      case "SAVE_RULES": {
        const current = await loadSettings();
        const next = await saveSettings({ ...current, rules: message.rules, deletedRuleIds: message.deletedRuleIds });
        return { ok: true, settings: next };
      }
      case "RESTORE_DEFAULT_RULES": {
        const current = await loadSettings();
        const next = await saveSettings({ ...current, rules: root.PromptGuardDefaultRules, deletedRuleIds: [] });
        return { ok: true, settings: next };
      }
      case "SAVE_DOMAINS": {
        const current = await loadSettings();
        const next = await saveSettings({
          ...current,
          enabledDomains: message.enabledDomains,
          customDomains: message.customDomains
        });
        return { ok: true, settings: next };
      }
      default:
        return { ok: false, error: `Unknown message type: ${message.type}` };
    }
  }

  rawApi.runtime.onMessage.addListener((message, sender, sendResponse) => {
    handleMessage(message, sender)
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  });

  async function injectScriptsIntoExistingTabs() {
    const settings = await loadSettings();
    const tabs = await api.tabs.query({}).catch(() => []);
    for (const tab of tabs) {
      if (tab.id && tab.url && settingsHelper.isUrlEnabled(settings, tab.url)) {
        const response = await api.tabs.sendMessage(tab.id, { type: "REQUEST_SCAN" }).catch(() => null);
        if (!response) {
          await injectContentScript(tab.id).catch(() => undefined);
        }
      }
    }
  }

  async function initialize() {
    const settings = await loadSettings();
    await api.storage.set({ [settingsHelper.storageKeys.settings]: settings });
    await api.storage.remove("promptGuardAlertHistory").catch(() => undefined);
    await clearAllBadges();
    await registerContentScripts(settings);
    await injectScriptsIntoExistingTabs().catch(console.error);
  }

  rawApi.runtime.onInstalled.addListener(() => {
    initialize().catch(console.error);
  });

  if (rawApi.runtime.onStartup) {
    rawApi.runtime.onStartup.addListener(() => {
      initialize().catch(console.error);
    });
  }

  initialize().catch(console.error);
})(globalThis);
