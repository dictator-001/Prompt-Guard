(function initContent(root) {
  if (root.PromptGuardContentLoaded) {
    return;
  }
  root.PromptGuardContentLoaded = true;

  const api = root.PromptGuardBrowser;
  const detector = root.PromptGuardDetector;
  const settingsHelper = root.PromptGuardSettings;

  let settings = settingsHelper.defaultSettings();
  let scanTimer = null;
  let lastElement = null;
  let lastSignature = "";
  let suppressNextInput = false;
  const attachedElements = new WeakSet();

  const SCAN_DEBOUNCE_MS = 150;
  let notifyAutoHideTimer = null;

  const promptSelectors = [
    "textarea",
    "input[type='text']",
    "input[type='search']",
    "input[type='email']",
    "input[type='url']",
    "[contenteditable='true']",
    "[role='textbox']",
    "#prompt-textarea",
    ".ProseMirror",
    "[data-testid='composer-text-input']",
    "[data-testid*='composer' i] [contenteditable='true']",
    "[data-testid*='prompt' i]",
    "[placeholder*='message' i]",
    "[placeholder*='ask' i]",
    "[aria-label*='message' i]",
    "[aria-label*='prompt' i]",
    "[aria-label*='ask' i]"
  ].join(",");

  const submitWords = ["send", "submit", "ask", "prompt", "search"];

  function isVisible(element) {
    if (!element || typeof element.getBoundingClientRect !== "function") {
      return false;
    }

    const rect = element.getBoundingClientRect();
    const style = root.getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
  }

  function promptElementFromTarget(target) {
    if (!target || !(target instanceof Element)) {
      return null;
    }

    const element = target.closest(promptSelectors);
    if (!element || !isVisible(element)) {
      return null;
    }

    if (element.matches("input") && element.type === "password") {
      return null;
    }

    return element;
  }

  function valueFromPrompt(element) {
    if (!element) {
      return "";
    }

    if ("value" in element && typeof element.value === "string") {
      return element.value;
    }

    return element.innerText || element.textContent || "";
  }

  function maskTextNodes(node, rules) {
    if (node.nodeType === 3) { // Node.TEXT_NODE
      const text = node.nodeValue;
      if (text && text.trim()) {
        const matches = detector.scanText(text, rules);
        if (matches.length > 0) {
          node.nodeValue = detector.applyMasksToText(text, matches);
        }
      }
    } else if (node.nodeType === 1) { // Node.ELEMENT_NODE
      for (const child of node.childNodes) {
        maskTextNodes(child, rules);
      }
    }
  }

  function setPromptValue(element, value) {
    if (!element) {
      return;
    }

    suppressNextInput = true;

    if ("value" in element && typeof element.value === "string") {
      const prototype = Object.getPrototypeOf(element);
      const descriptor = prototype && Object.getOwnPropertyDescriptor(prototype, "value");
      if (descriptor && typeof descriptor.set === "function") {
        descriptor.set.call(element, value);
      } else {
        element.value = value;
      }
    } else {
      maskTextNodes(element, settings.rules);
    }

    const event = typeof InputEvent === "function"
      ? new InputEvent("input", { bubbles: true, inputType: "insertReplacementText", data: value })
      : new Event("input", { bubbles: true });
    element.dispatchEvent(event);

    root.setTimeout(() => {
      suppressNextInput = false;
    }, 0);
  }

  function fieldList(matches) {
    const fields = Array.from(new Set(matches.map((match) => match.fieldName)));
    if (fields.length <= 3) {
      return fields.join(", ");
    }

    return `${fields.slice(0, 3).join(", ")} and ${fields.length - 3} more`;
  }

  function signatureFor(matches) {
    return matches
      .map((match) => `${match.ruleId}:${match.start}:${match.end}:${match.maskedValue}`)
      .sort()
      .join("|");
  }

  // ── Single top-right notification ──

  function dismissNotify() {
    const existing = document.getElementById("prompt-guard-notify");
    if (existing) {
      existing.classList.add("fade-out");
      root.setTimeout(() => {
        if (existing.classList.contains("fade-out")) {
          existing.remove();
        }
      }, 300);
    }
    if (notifyAutoHideTimer) {
      root.clearTimeout(notifyAutoHideTimer);
      notifyAutoHideTimer = null;
    }
  }

  function renderNotification(matches) {
    // If no matches, dismiss any existing notification after a delay
    if (!matches.length) {
      if (notifyAutoHideTimer) {
        return;
      }
      const existing = document.getElementById("prompt-guard-notify");
      if (existing && !existing.classList.contains("fade-out")) {
        notifyAutoHideTimer = root.setTimeout(() => {
          dismissNotify();
          notifyAutoHideTimer = null;
        }, 5000);
      }
      return;
    }

    // Clear any pending auto-hide since we have new matches
    if (notifyAutoHideTimer) {
      root.clearTimeout(notifyAutoHideTimer);
      notifyAutoHideTimer = null;
    }

    const severity = detector.highestSeverity(matches);
    let notify = document.getElementById("prompt-guard-notify");

    if (!notify) {
      notify = document.createElement("div");
      notify.id = "prompt-guard-notify";
      notify.className = "prompt-guard-notify";
      notify.setAttribute("role", "status");
      notify.setAttribute("aria-live", "polite");
      const icon = document.createElement("span");
      icon.className = "prompt-guard-notify__icon";
      icon.textContent = "!";
      
      const body = document.createElement("span");
      body.className = "prompt-guard-notify__body";
      
      const title = document.createElement("strong");
      title.className = "prompt-guard-notify__title";
      
      const detail = document.createElement("span");
      detail.className = "prompt-guard-notify__detail";
      
      body.appendChild(title);
      body.appendChild(detail);
      
      const closeBtn = document.createElement("button");
      closeBtn.className = "prompt-guard-notify__close";
      closeBtn.setAttribute("aria-label", "Dismiss");
      closeBtn.setAttribute("type", "button");
      closeBtn.textContent = "\u00d7";
      closeBtn.addEventListener("click", () => {
        dismissNotify();
      });

      notify.appendChild(icon);
      notify.appendChild(body);
      notify.appendChild(closeBtn);

      document.body.appendChild(notify);
    }

    notify.classList.remove("fade-out");
    notify.dataset.severity = severity || "LOW";
    notify.querySelector(".prompt-guard-notify__title").textContent = `Prompt Guard \u2022 ${severity} risk detected`;
    notify.querySelector(".prompt-guard-notify__detail").textContent =
      `${fieldList(matches)} ${matches.some((match) => match.maskedValue) ? "was masked in the prompt." : "was detected in the prompt."}`;

    // Auto-dismiss after 8 seconds
    if (notifyAutoHideTimer) {
      root.clearTimeout(notifyAutoHideTimer);
    }
    notifyAutoHideTimer = root.setTimeout(() => {
      dismissNotify();
      notifyAutoHideTimer = null;
    }, 8000);
  }

  async function publishScan(matches, options = {}) {
    const signature = signatureFor(matches);
    if (!options.force && signature === lastSignature) {
      return;
    }

    lastSignature = signature;
    await api.runtime.sendMessage({
      type: "SCAN_RESULT",
      matches
    }).catch(() => undefined);
  }

  async function scanPrompt(element, options = {}) {
    if (!settingsHelper.isUrlEnabled(settings, root.location.href)) {
      return [];
    }

    const text = valueFromPrompt(element);
    if (!text.trim()) {
      renderNotification([]);
      await publishScan([], options);
      return [];
    }

    const matches = detector.scanText(text, settings.rules);
    renderNotification(matches);

    const maskedText = detector.applyMasksToText(text, matches);
    if (maskedText !== text) {
      setPromptValue(element, maskedText);
    }

    await publishScan(matches, options);
    return matches;
  }

  function scheduleScan(element) {
    if (!element) {
      return;
    }

    lastElement = element;
    root.clearTimeout(scanTimer);
    scanTimer = root.setTimeout(() => {
      scanPrompt(lastElement);
    }, SCAN_DEBOUNCE_MS);
  }

  function promptScore(element) {
    const text = [
      element.id,
      element.className,
      element.getAttribute("aria-label"),
      element.getAttribute("placeholder"),
      element.getAttribute("data-testid"),
      element.getAttribute("role")
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    let score = 0;
    if (element === document.activeElement || element.contains(document.activeElement)) {
      score += 100;
    }
    if (text.includes("prompt") || text.includes("composer")) {
      score += 40;
    }
    if (text.includes("message") || text.includes("ask")) {
      score += 30;
    }
    if (element.isContentEditable || element.matches("textarea,[role='textbox']")) {
      score += 20;
    }
    if (valueFromPrompt(element).trim()) {
      score += 15;
    }

    return score;
  }

  function findPromptCandidates() {
    return Array.from(new Set(Array.from(document.querySelectorAll(promptSelectors))))
      .filter(isVisible)
      .filter((element) => !(element.matches("input") && element.type === "password"))
      .sort((a, b) => promptScore(b) - promptScore(a));
  }

  function findLikelyPrompt() {
    const activePrompt = promptElementFromTarget(document.activeElement);
    if (activePrompt) {
      return activePrompt;
    }

    return findPromptCandidates()[0] || null;
  }

  async function scanLikelyPrompts() {
    await loadSettings();
    const candidates = findPromptCandidates();

    for (const prompt of candidates) {
      lastElement = prompt;
      const matches = await scanPrompt(prompt, { force: true });
      if (matches.length) {
        return { promptFound: true, matches };
      }
    }

    renderNotification([]);
    await publishScan([], { force: true });
    return { promptFound: candidates.length > 0, matches: [] };
  }

  function isSubmitControl(target) {
    if (!target || !(target instanceof Element)) {
      return false;
    }

    const control = target.closest("button,[role='button'],input[type='submit']");
    if (!control) {
      return false;
    }

    const label = [
      control.getAttribute("aria-label"),
      control.getAttribute("title"),
      control.textContent,
      control.value,
      control.getAttribute("data-testid")
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return submitWords.some((word) => label.includes(word));
  }

  async function loadSettings() {
    const response = await api.runtime.sendMessage({ type: "GET_SETTINGS" }).catch(() => null);
    if (response && response.ok && response.settings) {
      settings = settingsHelper.mergeSettings(response.settings);
    }
  }

  // ── Attach per-element listeners for real-time scanning ──
  function attachElementListeners(element) {
    if (attachedElements.has(element)) {
      return;
    }
    attachedElements.add(element);

    element.addEventListener("focus", () => {
      const text = valueFromPrompt(element);
      if (text.trim()) {
        scheduleScan(element);
      }
    });

    element.addEventListener("paste", () => {
      root.setTimeout(() => {
        scanPrompt(element);
      }, 50);
    });
  }

  function attachToExistingPrompts() {
    const candidates = findPromptCandidates();
    candidates.forEach(attachElementListeners);
  }

  // ── Global event listeners ──

  document.addEventListener(
    "input",
    (event) => {
      if (suppressNextInput) {
        return;
      }

      const prompt = promptElementFromTarget(event.target);
      if (prompt) {
        attachElementListeners(prompt);
        scheduleScan(prompt);
      }
    },
    true
  );

  document.addEventListener(
    "keydown",
    (event) => {
      const prompt = promptElementFromTarget(event.target);
      if (!prompt) {
        return;
      }

      if (event.key === "Enter" && !event.shiftKey) {
        scanPrompt(prompt);
      }
    },
    true
  );

  document.addEventListener(
    "click",
    (event) => {
      if (!isSubmitControl(event.target)) {
        return;
      }

      const prompt = findLikelyPrompt();
      if (prompt) {
        scanPrompt(prompt);
      }
    },
    true
  );

  document.addEventListener(
    "focusin",
    (event) => {
      const prompt = promptElementFromTarget(event.target);
      if (prompt) {
        attachElementListeners(prompt);
        const text = valueFromPrompt(prompt);
        if (text.trim()) {
          scheduleScan(prompt);
        }
      }
    },
    true
  );

  // ── MutationObserver for SPA-added prompt elements ──
  const observer = new MutationObserver((mutations) => {
    let foundNewPrompt = false;

    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof Element)) {
          continue;
        }

        if (node.matches && node.matches(promptSelectors)) {
          attachElementListeners(node);
          foundNewPrompt = true;
          continue;
        }

        const prompts = node.querySelectorAll ? node.querySelectorAll(promptSelectors) : [];
        for (const prompt of prompts) {
          attachElementListeners(prompt);
          foundNewPrompt = true;
        }
      }

      if (mutation.type === "attributes" && mutation.target instanceof Element) {
        if (mutation.target.matches && mutation.target.matches(promptSelectors)) {
          attachElementListeners(mutation.target);
          foundNewPrompt = true;
        }
      }
    }

    if (foundNewPrompt) {
      root.setTimeout(() => {
        const candidates = findPromptCandidates();
        for (const candidate of candidates) {
          const text = valueFromPrompt(candidate);
          if (text.trim()) {
            scheduleScan(candidate);
            break;
          }
        }
      }, 100);
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["contenteditable", "role", "aria-label", "placeholder", "data-testid"]
  });

  // ── Listen for messages from the background / popup ──
  if (api.raw.runtime && api.raw.runtime.onMessage) {
    api.raw.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message && message.type === "SETTINGS_UPDATED") {
        settings = settingsHelper.mergeSettings(message.settings);
        if (lastElement) {
          scanPrompt(lastElement);
        }
      }

      if (message && message.type === "REQUEST_SCAN") {
        scanLikelyPrompts()
          .then((result) => {
            sendResponse({
              ok: true,
              promptFound: result.promptFound,
              matchCount: result.matches.length,
              highestSeverity: detector.highestSeverity(result.matches)
            });
          })
          .catch((error) => sendResponse({ ok: false, error: error.message }));
        return true;
      }

      return undefined;
    });
  }

  // ── Initial setup ──
  loadSettings().then(() => {
    attachToExistingPrompts();
    const prompt = findLikelyPrompt();
    if (prompt) {
      scheduleScan(prompt);
    }
  });
})(globalThis);
