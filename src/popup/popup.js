(function initPopup(root) {
  const api = root.PromptGuardBrowser;
  const settingsHelper = root.PromptGuardSettings;

  const statusText = document.getElementById("statusText");
  const statusBadge = document.getElementById("statusBadge");
  const currentTab = document.getElementById("currentTab");
  const openOptions = document.getElementById("openOptions");
  const themeToggle = document.getElementById("themeToggle");
  const maskToggle = document.getElementById("maskToggle");
  const maskFieldsList = document.getElementById("maskFieldsList");

  let settings = null;

  // Load and apply theme
  async function initTheme() {
    const data = await api.storage.get("theme").catch(() => ({}));
    const theme = data.theme || "dark"; // Default to dark
    document.documentElement.setAttribute("data-theme", theme);
  }

  themeToggle.addEventListener("click", async () => {
    const currentTheme = document.documentElement.getAttribute("data-theme") || "dark";
    const newTheme = currentTheme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", newTheme);
    await api.storage.set({ theme: newTheme }).catch(() => {});
  });

  function formatTime(timestamp) {
    return new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      month: "short",
      day: "numeric"
    }).format(new Date(timestamp));
  }

  function renderRecord(record) {
    const item = document.createElement("article");
    item.className = "alert-card";
    item.dataset.severity = record.highestSeverity || "LOW";
    
    const header = document.createElement("div");
    header.className = "alert-card-header";
    const badge = document.createElement("span");
    badge.className = "alert-badge";
    badge.dataset.severity = record.highestSeverity || "LOW";
    badge.textContent = record.highestSeverity || "LOW";
    const count = document.createElement("span");
    count.className = "alert-count";
    count.textContent = `${record.matchCount} match${record.matchCount === 1 ? "" : "es"}`;
    header.appendChild(badge);
    header.appendChild(count);
    
    const domain = document.createElement("h3");
    domain.className = "alert-domain";
    domain.textContent = record.domain;
    
    const time = document.createElement("div");
    time.className = "alert-meta-time";
    time.textContent = formatTime(record.timestamp);
    
    const row1 = document.createElement("div");
    row1.className = "alert-details-row";
    const label1 = document.createElement("span");
    label1.className = "details-label";
    label1.textContent = "Fields:";
    const val1 = document.createElement("span");
    val1.className = "details-value";
    val1.textContent = record.fields.join(", ");
    row1.appendChild(label1);
    row1.appendChild(val1);
    
    const row2 = document.createElement("div");
    row2.className = "alert-details-row";
    const label2 = document.createElement("span");
    label2.className = "details-label";
    label2.textContent = "Detected:";
    const val2 = document.createElement("span");
    val2.className = "details-value snippet-value";
    val2.textContent = record.maskedSnippets.length ? record.maskedSnippets.join(", ") : "Snippet masking is disabled for the matched field.";
    row2.appendChild(label2);
    row2.appendChild(val2);
    
    item.appendChild(header);
    item.appendChild(domain);
    item.appendChild(time);
    item.appendChild(row1);
    item.appendChild(row2);
    return item;
  }

  function renderCurrent(record) {
    currentTab.innerHTML = "";
    if (!record) {
      currentTab.className = "empty";
      currentTab.textContent = "No alert detected on this tab.";
      return;
    }

    currentTab.className = "alerts-list";
    currentTab.appendChild(renderRecord(record));
  }

  function setStatus(record) {
    if (!record) {
      statusText.textContent = "Active monitoring enabled. No threats detected.";
      statusBadge.textContent = "Protected";
      statusBadge.dataset.severity = "PROTECTED";
      return;
    }

    statusText.textContent = "Sensitive credentials detected on this tab.";
    statusBadge.textContent = record.highestSeverity || "LOW";
    statusBadge.dataset.severity = record.highestSeverity || "LOW";
  }

  // ── Mask Toggle Logic ──

  function isAnyMaskEnabled(rules) {
    if (!rules || !rules.length) return false;
    return rules.some((rule) => rule.masking && rule.masking.enabled === true);
  }

  function renderMaskToggle() {
    if (!settings || !settings.rules) return;

    const anyEnabled = isAnyMaskEnabled(settings.rules);
    maskToggle.checked = anyEnabled;

    // Render per-field toggles for enabled (detection-active) rules
    maskFieldsList.innerHTML = "";
    const activeRules = settings.rules.filter((rule) => rule.enabled !== false);
    
    activeRules.forEach((rule) => {
      const masking = rule.masking || {};
      const item = document.createElement("div");
      item.className = "mask-field-item";
      
      const severityBg = {
        CRITICAL: "var(--bg-badge-critical)",
        HIGH: "var(--bg-badge-high)",
        MEDIUM: "var(--bg-badge-medium)",
        LOW: "var(--bg-badge-low)"
      };
      const severityColor = {
        CRITICAL: "var(--text-badge-critical)",
        HIGH: "var(--text-badge-high)",
        MEDIUM: "var(--text-badge-medium)",
        LOW: "var(--text-badge-low)"
      };

      const nameSpan = document.createElement("span");
      nameSpan.className = "mask-field-name";
      nameSpan.textContent = rule.fieldName;
      
      const severitySpan = document.createElement("span");
      severitySpan.className = "mask-field-severity";
      severitySpan.style.background = severityBg[rule.severity] || severityBg.LOW;
      severitySpan.style.color = severityColor[rule.severity] || severityColor.LOW;
      severitySpan.textContent = rule.severity;
      
      const label = document.createElement("label");
      label.className = "toggle-switch";
      
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = masking.enabled === true;
      checkbox.dataset.ruleId = rule.id;
      checkbox.addEventListener("change", async (event) => {
        await toggleRuleMask(rule.id, event.target.checked);
      });
      
      const slider = document.createElement("span");
      slider.className = "toggle-slider";
      
      label.appendChild(checkbox);
      label.appendChild(slider);
      
      item.appendChild(nameSpan);
      item.appendChild(severitySpan);
      item.appendChild(label);

      maskFieldsList.appendChild(item);
    });
  }

  async function toggleAllMasks(enabled) {
    if (!settings || !settings.rules) return;

    const updatedRules = settings.rules.map((rule) => ({
      ...rule,
      masking: {
        ...(rule.masking || { character: "*", preserveStart: 0, preserveEnd: 0 }),
        enabled: enabled
      }
    }));

    try {
      const response = await api.runtime.sendMessage({
        type: "SAVE_RULES",
        rules: updatedRules,
        deletedRuleIds: settings.deletedRuleIds || []
      });

      if (response && response.ok && response.settings) {
        settings = settingsHelper.mergeSettings(response.settings);
        renderMaskToggle();
      }
    } catch (error) {
      // Silently fail in popup
    }
  }

  async function toggleRuleMask(ruleId, enabled) {
    if (!settings || !settings.rules) return;

    const updatedRules = settings.rules.map((rule) => {
      if (rule.id !== ruleId) return rule;
      return {
        ...rule,
        masking: {
          ...(rule.masking || { character: "*", preserveStart: 0, preserveEnd: 0 }),
          enabled: enabled
        }
      };
    });

    try {
      const response = await api.runtime.sendMessage({
        type: "SAVE_RULES",
        rules: updatedRules,
        deletedRuleIds: settings.deletedRuleIds || []
      });

      if (response && response.ok && response.settings) {
        settings = settingsHelper.mergeSettings(response.settings);
        // Update the global toggle state
        maskToggle.checked = isAnyMaskEnabled(settings.rules);
      }
    } catch (error) {
      // Silently fail in popup
    }
  }

  maskToggle.addEventListener("change", async (event) => {
    await toggleAllMasks(event.target.checked);
  });

  async function load() {
    await initTheme().catch(() => {});
    const tabs = await api.tabs.query({ active: true, currentWindow: true }).catch(() => []);
    const activeTabId = tabs[0] && tabs[0].id;
    const state = await api.runtime.sendMessage({ type: "REQUEST_ACTIVE_SCAN", tabId: activeTabId });

    if (!state || !state.ok) {
      throw new Error(state && state.error ? state.error : "Unable to load popup state.");
    }

    settings = state.settings ? settingsHelper.mergeSettings(state.settings) : null;

    setStatus(state.activeTabAlert);
    renderCurrent(state.activeTabAlert);
    renderMaskToggle();
  }

  openOptions.addEventListener("click", () => {
    if (api.raw.runtime.openOptionsPage) {
      api.raw.runtime.openOptionsPage();
    }
  });

  load().catch((error) => {
    statusText.textContent = error.message;
    statusBadge.textContent = "Error";
  });
})(globalThis);
