(function initSettings(root) {
  const storageKeys = Object.freeze({
    settings: "promptGuardSettings"
  });

  const defaultDomains = Object.freeze([
    {
      id: "chatgpt",
      label: "ChatGPT",
      matches: ["https://chatgpt.com/*", "https://*.chatgpt.com/*", "https://chat.openai.com/*"]
    },
    {
      id: "claude",
      label: "Claude",
      matches: ["https://claude.ai/*", "https://*.claude.ai/*"]
    },
    {
      id: "gemini",
      label: "Gemini",
      matches: ["https://gemini.google.com/*"]
    },
    {
      id: "copilot",
      label: "Microsoft Copilot",
      matches: ["https://copilot.microsoft.com/*"]
    },
    {
      id: "perplexity",
      label: "Perplexity",
      matches: ["https://perplexity.ai/*", "https://www.perplexity.ai/*"]
    },
    {
      id: "poe",
      label: "Poe",
      matches: ["https://poe.com/*", "https://*.poe.com/*"]
    }
  ]);

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function defaultEnabledDomains() {
    return Object.fromEntries(defaultDomains.map((domain) => [domain.id, true]));
  }

  function defaultSettings() {
    return {
      enabledDomains: defaultEnabledDomains(),
      customDomains: [],
      rules: mergeRules([], []),
      deletedRuleIds: []
    };
  }

  function defaultMaskingForRule(rule) {
    const field = String(rule.fieldName || "").toLowerCase();

    if (field.includes("email")) {
      return { enabled: false, character: "*", preserveStart: 1, preserveEnd: 0 };
    }

    if (field.includes("url")) {
      return { enabled: false, character: "*", preserveStart: 0, preserveEnd: 0 };
    }

    if (field.includes("date") || field.includes("dob")) {
      return { enabled: false, character: "*", preserveStart: 0, preserveEnd: 0 };
    }

    if (
      field.includes("number") ||
      field.includes("card") ||
      field.includes("cvv") ||
      field.includes("imei") ||
      field.includes("identifier") ||
      field.includes("phone") ||
      field.includes("account") ||
      field.includes("aadhaar")
    ) {
      return { enabled: false, character: "*", preserveStart: 0, preserveEnd: 4 };
    }

    return { enabled: false, character: "*", preserveStart: 4, preserveEnd: 0 };
  }

  function normalizeMaskCharacter(value, fallback) {
    const text = String(value || fallback || "*").trim();
    return Array.from(text)[0] || "*";
  }

  function normalizeMaskCount(value, fallback) {
    const number = Number.parseInt(value, 10);
    if (!Number.isFinite(number)) {
      return fallback;
    }

    return Math.min(Math.max(number, 0), 24);
  }

  function normalizeMasking(masking, fallbackRule) {
    const defaults = defaultMaskingForRule(fallbackRule);
    const source = masking && typeof masking === "object" ? masking : {};

    return {
      enabled: source.enabled === true,
      character: normalizeMaskCharacter(source.character, defaults.character),
      preserveStart: normalizeMaskCount(source.preserveStart, defaults.preserveStart),
      preserveEnd: normalizeMaskCount(source.preserveEnd, defaults.preserveEnd)
    };
  }

  function normalizeRule(rule, fallback) {
    return {
      id: String(rule.id || fallback.id),
      severity: ["CRITICAL", "HIGH", "MEDIUM", "LOW"].includes(rule.severity) ? rule.severity : fallback.severity,
      fieldName: String(rule.fieldName || fallback.fieldName),
      pattern: String(rule.pattern || fallback.pattern),
      risk: String(rule.risk || fallback.risk),
      enabled: rule.enabled !== false,
      masking: normalizeMasking(rule.masking, fallback),
      contextKeywords: Array.isArray(rule.contextKeywords)
        ? rule.contextKeywords.map(String).filter(Boolean)
        : fallback.contextKeywords
          ? [...fallback.contextKeywords]
          : undefined
    };
  }

  function mergeRules(savedRules, deletedRuleIds) {
    const defaults = root.PromptGuardDefaultRules || [];
    const deletedIds = new Set(Array.isArray(deletedRuleIds) ? deletedRuleIds.map(String) : []);
    const savedById = new Map((Array.isArray(savedRules) ? savedRules : []).map((rule) => [rule.id, rule]));
    const merged = defaults
      .filter((fallback) => !deletedIds.has(fallback.id))
      .map((fallback) => normalizeRule(savedById.get(fallback.id) || fallback, fallback));

    for (const savedRule of savedById.values()) {
      if (!defaults.some((fallback) => fallback.id === savedRule.id) && !deletedIds.has(savedRule.id)) {
        merged.push(normalizeRule(savedRule, savedRule));
      }
    }

    return merged;
  }

  function mergeSettings(savedSettings) {
    const defaults = defaultSettings();
    if (!savedSettings || typeof savedSettings !== "object") {
      return defaults;
    }

    const enabledDomains = {
      ...defaults.enabledDomains,
      ...(savedSettings.enabledDomains || {})
    };

    return {
      enabledDomains,
      customDomains: Array.isArray(savedSettings.customDomains) ? savedSettings.customDomains : [],
      rules: mergeRules(savedSettings.rules, savedSettings.deletedRuleIds),
      deletedRuleIds: Array.isArray(savedSettings.deletedRuleIds) ? savedSettings.deletedRuleIds.map(String) : []
    };
  }

  function getEnabledMatchPatterns(settings) {
    const patterns = [];

    for (const domain of defaultDomains) {
      if (settings.enabledDomains[domain.id] !== false) {
        patterns.push(...domain.matches);
      }
    }

    for (const domain of settings.customDomains || []) {
      if (domain.enabled !== false && Array.isArray(domain.matches)) {
        patterns.push(...domain.matches);
      }
    }

    return Array.from(new Set(patterns));
  }

  function getEnabledCustomMatchPatterns(settings) {
    const patterns = [];

    for (const domain of settings.customDomains || []) {
      if (domain.enabled !== false && Array.isArray(domain.matches)) {
        patterns.push(...domain.matches);
      }
    }

    return Array.from(new Set(patterns));
  }

  function matchPatternToRegex(pattern) {
    const escaped = String(pattern)
      .replace(/[|\\{}()[\]^$+?.]/g, "\\$&")
      .replace(/\*/g, ".*");
    return new RegExp(`^${escaped}$`, "i");
  }

  function isUrlEnabled(settings, url) {
    try {
      const targetUrl = new URL(url);
      return getEnabledMatchPatterns(settings).some((pattern) => matchPatternToRegex(pattern).test(targetUrl.href));
    } catch (error) {
      return true;
    }
  }

  function sanitizeHostname(value) {
    return String(value || "")
      .trim()
      .replace(/^https?:\/\//i, "")
      .replace(/\/.*$/, "")
      .replace(/^\*\./, "")
      .toLowerCase();
  }

  function customDomainFromInput(value) {
    const input = String(value || "").trim();
    if (!input) {
      throw new Error("Enter a domain or URL.");
    }

    if (/^\*:\/\/[^/]+\/\*$/.test(input) || /^https?:\/\/[^/]+\/\*$/.test(input)) {
      const host = sanitizeHostname(input);
      return {
        id: `custom-${host.replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`,
        label: host,
        matches: [input],
        enabled: true
      };
    }

    const hostname = sanitizeHostname(input);
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(hostname)) {
      throw new Error("Enter a valid hostname such as example.com.");
    }

    return {
      id: `custom-${hostname.replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`,
      label: hostname,
      matches: [`https://${hostname}/*`, `https://*.${hostname}/*`],
      enabled: true
    };
  }

  root.PromptGuardSettings = {
    storageKeys,
    defaultDomains,
    defaultSettings,
    mergeSettings,
    mergeRules,
    defaultMaskingForRule,
    getEnabledMatchPatterns,
    getEnabledCustomMatchPatterns,
    isUrlEnabled,
    customDomainFromInput
  };
})(globalThis);
