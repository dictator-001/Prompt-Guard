(function initOptions(root) {
  const api = root.PromptGuardBrowser;
  const settingsHelper = root.PromptGuardSettings;

  const saveStatus = document.getElementById("saveStatus");
  const defaultDomainsNode = document.getElementById("defaultDomains");
  const customDomainsNode = document.getElementById("customDomains");
  const customDomainForm = document.getElementById("customDomainForm");
  const customDomainInput = document.getElementById("customDomainInput");
  const rulesTable = document.getElementById("rulesTable");
  const addRule = document.getElementById("addRule");
  const saveRules = document.getElementById("saveRules");
  const restoreRules = document.getElementById("restoreRules");
  const themeToggle = document.getElementById("themeToggle");

  let settings = settingsHelper.defaultSettings();
  let activeTab = "all";

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

  // Tab navigation
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      // Save current input values to memory so they are not lost!
      settings.rules = collectRules();
      
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      e.target.classList.add("active");
      activeTab = e.target.dataset.tab;
      
      renderRules();
    });
  });

  function setStatus(message, kind) {
    saveStatus.textContent = message;
    if (kind) {
      saveStatus.dataset.kind = kind;
    } else {
      saveStatus.removeAttribute("data-kind");
    }
  }

  async function saveDomains() {
    const response = await api.runtime.sendMessage({
      type: "SAVE_DOMAINS",
      enabledDomains: settings.enabledDomains,
      customDomains: settings.customDomains
    });

    if (!response || !response.ok) {
      throw new Error(response && response.error ? response.error : "Unable to save domains.");
    }

    settings = settingsHelper.mergeSettings(response.settings);
    setStatus("Saved", "success");
    renderDomains();
  }

  function renderDefaultDomains() {
    defaultDomainsNode.innerHTML = "";
    settingsHelper.defaultDomains.forEach((domain) => {
      const item = document.createElement("div");
      item.className = "domain-item";
      const div = document.createElement("div");
      
      const label = document.createElement("label");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = settings.enabledDomains[domain.id] !== false;
      const labelText = document.createTextNode(` ${domain.label}`);
      label.appendChild(checkbox);
      label.appendChild(labelText);
      
      const small = document.createElement("small");
      small.textContent = domain.matches.join(", ");
      
      div.appendChild(label);
      div.appendChild(small);
      
      item.appendChild(div);

      item.querySelector("input").addEventListener("change", async (event) => {
        settings.enabledDomains[domain.id] = event.target.checked;
        try {
          await saveDomains();
        } catch (error) {
          setStatus(error.message, "error");
        }
      });

      defaultDomainsNode.appendChild(item);
    });
  }

  function renderCustomDomains() {
    customDomainsNode.innerHTML = "";
    if (!settings.customDomains.length) {
      const empty = document.createElement("p");
      empty.className = "empty-domains";
      empty.textContent = "No custom domains added.";
      customDomainsNode.appendChild(empty);
      return;
    }

    settings.customDomains.forEach((domain) => {
      const item = document.createElement("div");
      item.className = "domain-item";
      const div = document.createElement("div");
      
      const label = document.createElement("label");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = domain.enabled !== false;
      const labelText = document.createTextNode(` ${domain.label}`);
      label.appendChild(checkbox);
      label.appendChild(labelText);
      
      const small = document.createElement("small");
      small.textContent = domain.matches.join(", ");
      
      div.appendChild(label);
      div.appendChild(small);
      
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn-remove";
      btn.textContent = "Remove";
      
      item.appendChild(div);
      item.appendChild(btn);

      item.querySelector("input").addEventListener("change", async (event) => {
        domain.enabled = event.target.checked;
        try {
          await saveDomains();
        } catch (error) {
          setStatus(error.message, "error");
        }
      });

      item.querySelector("button").addEventListener("click", async () => {
        settings.customDomains = settings.customDomains.filter((candidate) => candidate.id !== domain.id);
        try {
          await saveDomains();
        } catch (error) {
          setStatus(error.message, "error");
        }
      });

      customDomainsNode.appendChild(item);
    });
  }

  function renderDomains() {
    renderDefaultDomains();
    renderCustomDomains();
  }

  function renderRules() {
    rulesTable.innerHTML = "";
    
    const filteredRules = settings.rules.filter((rule) => {
      if (activeTab === "all") return true;
      return String(rule.severity).toLowerCase() === activeTab;
    });

    if (filteredRules.length === 0) {
      const emptyRow = document.createElement("div");
      emptyRow.className = "empty-rules-message";
      emptyRow.textContent = `No rules configured with ${activeTab.toUpperCase()} severity.`;
      rulesTable.appendChild(emptyRow);
      return;
    }

    filteredRules.forEach((rule) => {
      const row = document.createElement("div");
      row.className = "rule-row";
      row.dataset.ruleId = rule.id;
      row.dataset.severity = rule.severity;
      const masking = rule.masking || settingsHelper.defaultMaskingForRule(rule);
      const header = document.createElement("div");
      header.className = "rule-header";
      
      const toggleLabel = document.createElement("label");
      toggleLabel.className = "rule-toggle";
      const toggleInput = document.createElement("input");
      toggleInput.className = "rule-enabled";
      toggleInput.type = "checkbox";
      toggleInput.checked = rule.enabled !== false;
      toggleLabel.appendChild(toggleInput);
      toggleLabel.appendChild(document.createTextNode(" Detect this field"));
      
      const sevWrap = document.createElement("div");
      sevWrap.className = "rule-severity-wrap";
      const sevLabel = document.createElement("label");
      sevLabel.textContent = "Severity";
      const sevSelect = document.createElement("select");
      sevSelect.className = "rule-severity";
      sevSelect.setAttribute("aria-label", "Severity");
      ["CRITICAL", "HIGH", "MEDIUM", "LOW"].forEach(sev => {
        const opt = document.createElement("option");
        opt.value = sev;
        opt.textContent = sev;
        if (rule.severity === sev) opt.selected = true;
        sevSelect.appendChild(opt);
      });
      sevWrap.appendChild(sevLabel);
      sevWrap.appendChild(sevSelect);
      
      const removeBtn = document.createElement("button");
      removeBtn.className = "remove-rule";
      removeBtn.type = "button";
      removeBtn.textContent = "Remove";
      
      header.appendChild(toggleLabel);
      header.appendChild(sevWrap);
      header.appendChild(removeBtn);
      
      const body = document.createElement("div");
      body.className = "rule-body";
      
      const nameLabel = document.createElement("label");
      nameLabel.className = "field-label";
      nameLabel.textContent = "Field name ";
      const nameInput = document.createElement("input");
      nameInput.className = "rule-name";
      nameInput.type = "text";
      nameInput.value = rule.fieldName || "";
      nameLabel.appendChild(nameInput);
      
      const patternLabel = document.createElement("label");
      patternLabel.className = "field-label field-pattern";
      patternLabel.textContent = "Regex pattern ";
      const patternText = document.createElement("textarea");
      patternText.className = "rule-pattern";
      patternText.spellcheck = false;
      patternText.value = rule.pattern || "";
      patternLabel.appendChild(patternText);
      
      const riskLabel = document.createElement("label");
      riskLabel.className = "field-label field-risk";
      riskLabel.textContent = "Risk description ";
      const riskText = document.createElement("textarea");
      riskText.className = "rule-risk";
      riskText.value = rule.risk || "";
      riskLabel.appendChild(riskText);
      
      const maskSection = document.createElement("section");
      maskSection.className = "mask-controls";
      maskSection.setAttribute("aria-label", "Masking options");
      
      const maskToggleLabel = document.createElement("label");
      maskToggleLabel.className = "mask-toggle";
      const maskToggleInput = document.createElement("input");
      maskToggleInput.className = "mask-enabled";
      maskToggleInput.type = "checkbox";
      maskToggleInput.checked = masking.enabled === true;
      maskToggleLabel.appendChild(maskToggleInput);
      maskToggleLabel.appendChild(document.createTextNode(" Mask matched text in prompt"));
      
      const maskGrid = document.createElement("div");
      maskGrid.className = "mask-grid";
      
      const charLabel = document.createElement("label");
      charLabel.textContent = "Mask character ";
      const charInput = document.createElement("input");
      charInput.className = "mask-character";
      charInput.type = "text";
      charInput.maxLength = 4;
      charInput.value = masking.character || "*";
      charLabel.appendChild(charInput);
      
      const startLabel = document.createElement("label");
      startLabel.textContent = "Keep start ";
      const startInput = document.createElement("input");
      startInput.className = "mask-start";
      startInput.type = "number";
      startInput.min = 0;
      startInput.max = 24;
      startInput.value = Number.isInteger(masking.preserveStart) ? masking.preserveStart : 0;
      startLabel.appendChild(startInput);
      
      const endLabel = document.createElement("label");
      endLabel.textContent = "Keep end ";
      const endInput = document.createElement("input");
      endInput.className = "mask-end";
      endInput.type = "number";
      endInput.min = 0;
      endInput.max = 24;
      endInput.value = Number.isInteger(masking.preserveEnd) ? masking.preserveEnd : 0;
      endLabel.appendChild(endInput);
      
      maskGrid.appendChild(charLabel);
      maskGrid.appendChild(startLabel);
      maskGrid.appendChild(endLabel);
      
      maskSection.appendChild(maskToggleLabel);
      maskSection.appendChild(maskGrid);
      
      body.appendChild(nameLabel);
      body.appendChild(patternLabel);
      body.appendChild(riskLabel);
      body.appendChild(maskSection);
      
      row.appendChild(header);
      row.appendChild(body);

      row.querySelector(".remove-rule").addEventListener("click", () => {
        // Collect current edits from all rows before removing this one so we don't lose changes!
        settings.rules = collectRules();
        settings.rules = settings.rules.filter((candidate) => candidate.id !== rule.id);
        settings.deletedRuleIds = Array.from(new Set([...(settings.deletedRuleIds || []), rule.id]));
        renderRules();
        setStatus("Field removed. Save rules to apply.", "success");
      });

      rulesTable.appendChild(row);
    });
  }

  function collectRules() {
    // Note: Since we are rendering a subset, we need to merge the currently visible rows back into the complete list.
    const completeRules = [...settings.rules];
    
    Array.from(rulesTable.querySelectorAll(".rule-row")).forEach((row) => {
      const ruleId = row.dataset.ruleId;
      const index = completeRules.findIndex((rule) => rule.id === ruleId);
      if (index !== -1) {
        completeRules[index] = {
          ...completeRules[index],
          enabled: row.querySelector(".rule-enabled").checked,
          fieldName: row.querySelector(".rule-name").value.trim() || completeRules[index].fieldName,
          severity: row.querySelector(".rule-severity").value,
          pattern: row.querySelector(".rule-pattern").value.trim() || completeRules[index].pattern,
          risk: row.querySelector(".rule-risk").value.trim() || completeRules[index].risk,
          masking: {
            enabled: row.querySelector(".mask-enabled").checked,
            character: Array.from(row.querySelector(".mask-character").value.trim() || "*")[0],
            preserveStart: Number.parseInt(row.querySelector(".mask-start").value, 10) || 0,
            preserveEnd: Number.parseInt(row.querySelector(".mask-end").value, 10) || 0
          }
        };
      }
    });

    return completeRules;
  }

  function validateRules(rules) {
    for (const rule of rules) {
      if (!rule.pattern) {
        throw new Error(`${rule.fieldName} needs a regex pattern.`);
      }

      try {
        new RegExp(rule.pattern, "g");
      } catch (error) {
        throw new Error(`${rule.fieldName} has an invalid regex pattern.`);
      }
    }
  }

  function createCustomRule() {
    const id = `custom-rule-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return {
      id,
      severity: "LOW",
      fieldName: "New Sensitive Field",
      pattern: "\\bchange-me\\b",
      risk: "Custom sensitive data",
      enabled: true,
      masking: {
        enabled: true,
        character: "x",
        preserveStart: 0,
        preserveEnd: 4
      },
      contextKeywords: []
    };
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replace(/"/g, "&quot;");
  }

  customDomainForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const domain = settingsHelper.customDomainFromInput(customDomainInput.value);
      const granted = await api.permissions.request({ origins: domain.matches });
      if (!granted) {
        setStatus("Host permission was not granted.", "error");
        return;
      }

      settings.customDomains = [...settings.customDomains, domain];
      customDomainInput.value = "";
      await saveDomains();
    } catch (error) {
      setStatus(error.message, "error");
    }
  });

  saveRules.addEventListener("click", async () => {
    try {
      const rules = collectRules();
      validateRules(rules);
      const response = await api.runtime.sendMessage({
        type: "SAVE_RULES",
        rules,
        deletedRuleIds: settings.deletedRuleIds || []
      });
      if (!response || !response.ok) {
        throw new Error(response && response.error ? response.error : "Unable to save rules.");
      }
      settings = settingsHelper.mergeSettings(response.settings);
      setStatus("Rules saved", "success");
      renderRules();
    } catch (error) {
      setStatus(error.message, "error");
    }
  });

  restoreRules.addEventListener("click", async () => {
    try {
      const response = await api.runtime.sendMessage({ type: "RESTORE_DEFAULT_RULES" });
      if (!response || !response.ok) {
        throw new Error(response && response.error ? response.error : "Unable to restore rules.");
      }
      settings = settingsHelper.mergeSettings(response.settings);
      
      // Reset active tab to 'all'
      document.querySelectorAll(".tab-btn").forEach((b) => {
        if (b.dataset.tab === "all") b.classList.add("active");
        else b.classList.remove("active");
      });
      activeTab = "all";

      setStatus("Defaults restored", "success");
      renderRules();
    } catch (error) {
      setStatus(error.message, "error");
    }
  });

  addRule.addEventListener("click", () => {
    settings.rules = collectRules();
    const newRule = createCustomRule();
    settings.rules = [...settings.rules, newRule];
    
    // Switch to 'all' tab so user can see it
    document.querySelectorAll(".tab-btn").forEach((b) => {
      if (b.dataset.tab === "all") b.classList.add("active");
      else b.classList.remove("active");
    });
    activeTab = "all";

    renderRules();
    setStatus("Field added. Edit it and save rules.", "success");
  });

  async function load() {
    await initTheme().catch(() => {});
    const response = await api.runtime.sendMessage({ type: "GET_SETTINGS" });
    if (!response || !response.ok) {
      throw new Error(response && response.error ? response.error : "Unable to load settings.");
    }

    settings = settingsHelper.mergeSettings(response.settings);
    renderDomains();
    renderRules();
    setStatus("Ready");
  }

  load().catch((error) => setStatus(error.message, "error"));
})(globalThis);
