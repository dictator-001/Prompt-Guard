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
    
    item.innerHTML = [
      "<div class=\"alert-card-header\">",
      `  <span class="alert-badge" data-severity="${record.highestSeverity || "LOW"}">${record.highestSeverity || "LOW"}</span>`,
      `  <span class="alert-count">${record.matchCount} match${record.matchCount === 1 ? "" : "es"}</span>`,
      "</div>",
      `<h3 class="alert-domain">${record.domain}</h3>`,
      `<div class="alert-meta-time">${formatTime(record.timestamp)}</div>`,
      `<div class="alert-details-row">`,
      `  <span class="details-label">Fields:</span>`,
      `  <span class="details-value">${record.fields.join(", ")}</span>`,
      `</div>`,
      `<div class="alert-details-row">`,
      `  <span class="details-label">Detected:</span>`,
      `  <span class="details-value snippet-value">${record.maskedSnippets.length ? record.maskedSnippets.join(", ") : "Snippet masking is disabled for the matched field."}</span>`,
      `</div>`
    ].join("");
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

      item.innerHTML = [
        `<span class="mask-field-name">${rule.fieldName}</span>`,
        `<span class="mask-field-severity" style="background:${severityBg[rule.severity] || severityBg.LOW};color:${severityColor[rule.severity] || severityColor.LOW}">${rule.severity}</span>`,
        `<label class="toggle-switch">`,
        `  <input type="checkbox" ${masking.enabled === true ? "checked" : ""} data-rule-id="${rule.id}">`,
        `  <span class="toggle-slider"></span>`,
        `</label>`
      ].join("");

      const checkbox = item.querySelector("input");
      checkbox.addEventListener("change", async (event) => {
        await toggleRuleMask(rule.id, event.target.checked);
      });

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
