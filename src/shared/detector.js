(function initDetector(root) {
  const severityRank = {
    CRITICAL: 4,
    HIGH: 3,
    MEDIUM: 2,
    LOW: 1
  };

  const severityOrder = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];

  const genericRuleIds = new Set([
    "generic-api-key-secret",
    "generic-numeric-identifier",
    "generic-token-string",
    "bank-account-number",
    "cvv"
  ]);

  function compileRule(rule) {
    try {
      return new RegExp(rule.pattern, "g");
    } catch (error) {
      return null;
    }
  }

  function hasRequiredContext(text, match, rule) {
    if (!rule.contextKeywords || rule.contextKeywords.length === 0) {
      return true;
    }

    const start = Math.max(0, match.index - 80);
    const end = Math.min(text.length, match.index + match.value.length + 80);
    const windowText = text.slice(start, end).toLowerCase();
    return rule.contextKeywords.some((keyword) => windowText.includes(String(keyword).toLowerCase()));
  }

  function luhnValid(value) {
    const digits = value.replace(/\D/g, "");
    let sum = 0;
    let shouldDouble = false;

    for (let index = digits.length - 1; index >= 0; index -= 1) {
      let digit = Number(digits[index]);
      if (shouldDouble) {
        digit *= 2;
        if (digit > 9) {
          digit -= 9;
        }
      }
      sum += digit;
      shouldDouble = !shouldDouble;
    }

    return digits.length >= 13 && sum % 10 === 0;
  }

  function validateMatch(rule, value, text, matchIndex) {
    const match = { value, index: matchIndex };

    if (!hasRequiredContext(text, match, rule)) {
      return false;
    }

    if (rule.id === "credit-card-number") {
      return luhnValid(value);
    }

    if (rule.id === "upi-id") {
      return !value.includes(".") || !/^[^@\s]+@[A-Za-z]{2,64}$/.test(value) || /\b(upi|vpa|pay|payment)\b/i.test(text);
    }

    return true;
  }

  function normalizedMasking(rule) {
    const source = rule.masking && typeof rule.masking === "object" ? rule.masking : {};
    return {
      enabled: source.enabled === true,
      character: Array.from(String(source.character || "*").trim())[0] || "*",
      preserveStart: Number.isInteger(source.preserveStart) ? Math.max(0, source.preserveStart) : undefined,
      preserveEnd: Number.isInteger(source.preserveEnd) ? Math.max(0, source.preserveEnd) : undefined
    };
  }

  function repeatMask(length, character) {
    return character.repeat(Math.max(0, length));
  }

  function maskGenericWithOptions(value, masking, defaultStart, defaultEnd) {
    const preserveStart = masking.preserveStart ?? defaultStart;
    const preserveEnd = masking.preserveEnd ?? defaultEnd;

    if (value.length <= preserveStart + preserveEnd) {
      return repeatMask(value.length, masking.character);
    }

    return [
      value.slice(0, preserveStart),
      repeatMask(value.length - preserveStart - preserveEnd, masking.character),
      preserveEnd > 0 ? value.slice(-preserveEnd) : ""
    ].join("");
  }

  function maskEmail(value, masking) {
    const [local, domain] = value.split("@");
    if (!local || !domain) {
      return maskGeneric(value, masking);
    }

    const preserveStart = masking.preserveStart ?? 1;
    const preserveEnd = masking.preserveEnd ?? 0;
    const maskedLocal = maskGenericWithOptions(local, masking, preserveStart, preserveEnd);
    return `${maskedLocal}@${domain}`;
  }

  function maskDigits(value, masking) {
    const digits = value.replace(/\D/g, "");
    const preserveStart = masking.preserveStart ?? 0;
    const preserveEnd = masking.preserveEnd ?? 4;

    if (digits.length <= preserveStart + preserveEnd) {
      return value.replace(/\d/g, masking.character);
    }

    let digitIndex = 0;
    return value.replace(/\d/g, (digit) => {
      const keep =
        digitIndex < preserveStart ||
        digitIndex >= digits.length - preserveEnd;
      digitIndex += 1;
      return keep ? digit : masking.character;
    });
  }

  function maskGeneric(value, masking) {
    if (value.length <= 4) {
      return repeatMask(value.length, masking.character);
    }

    return maskGenericWithOptions(value, masking, masking.preserveStart ?? 4, masking.preserveEnd ?? 0);
  }

  function maskUrl(value, masking) {
    if ((masking.preserveStart ?? 0) > 0 || (masking.preserveEnd ?? 0) > 0) {
      return maskGeneric(value, masking);
    }

    try {
      const parsed = new URL(value);
      return `${parsed.origin}/...`;
    } catch (error) {
      return maskGeneric(value, masking);
    }
  }

  function maskValue(value, rule) {
    const masking = normalizedMasking(rule);
    if (!masking.enabled) {
      return "";
    }

    if (rule.id === "email-address") {
      return maskEmail(value, masking);
    }

    if (rule.id === "url") {
      return maskUrl(value, masking);
    }

    if (/\d/.test(value) && value.replace(/\D/g, "").length >= 3) {
      return maskDigits(value, masking);
    }

    return maskGeneric(value, masking);
  }

  function isOverlapping(candidate, accepted) {
    return accepted.some((match) => candidate.start < match.end && candidate.end > match.start);
  }

  function specificityScore(rule) {
    return genericRuleIds.has(rule.id) ? 0 : 1;
  }

  function dedupeMatches(matches) {
    const sorted = [...matches].sort((a, b) => {
      const severityDelta = severityRank[b.severity] - severityRank[a.severity];
      if (severityDelta !== 0) {
        return severityDelta;
      }

      const specificityDelta = specificityScore(b.rule) - specificityScore(a.rule);
      if (specificityDelta !== 0) {
        return specificityDelta;
      }

      const lengthDelta = b.value.length - a.value.length;
      if (lengthDelta !== 0) {
        return lengthDelta;
      }

      return a.start - b.start;
    });

    const accepted = [];
    for (const match of sorted) {
      if (!isOverlapping(match, accepted)) {
        accepted.push(match);
      }
    }

    return accepted
      .sort((a, b) => a.start - b.start)
      .map(({ rule, value, ...publicMatch }) => publicMatch);
  }

  function scanText(text, rules) {
    if (!text || typeof text !== "string") {
      return [];
    }

    const matches = [];
    const activeRules = (rules || root.PromptGuardDefaultRules || []).filter((rule) => rule && rule.enabled !== false);

    activeRules.forEach((rule) => {
      const regex = compileRule(rule);
      if (!regex) {
        return;
      }

      let result;
      let count = 0;
      while ((result = regex.exec(text)) && count < 50) {
        const value = result[0];
        if (value && validateMatch(rule, value, text, result.index)) {
          matches.push({
            rule,
            ruleId: rule.id,
            severity: rule.severity,
            fieldName: rule.fieldName,
            risk: rule.risk,
            start: result.index,
            end: result.index + value.length,
            maskedValue: maskValue(value, rule),
            value
          });
        }

        if (regex.lastIndex === result.index) {
          regex.lastIndex += 1;
        }
        count += 1;
      }
    });

    return dedupeMatches(matches);
  }

  function highestSeverity(matches) {
    return severityOrder.find((severity) => matches.some((match) => match.severity === severity)) || null;
  }

  function summarizeMatches(matches) {
    const fields = Array.from(new Set(matches.map((match) => match.fieldName)));
    const maskedSnippets = Array.from(new Set(matches.map((match) => match.maskedValue).filter(Boolean))).slice(0, 5);
    return {
      count: matches.length,
      highestSeverity: highestSeverity(matches),
      fields,
      maskedSnippets
    };
  }

  function applyMasksToText(text, matches) {
    if (!text || !Array.isArray(matches) || matches.length === 0) {
      return text;
    }

    return [...matches]
      .filter((match) => match.maskedValue && Number.isInteger(match.start) && Number.isInteger(match.end))
      .sort((a, b) => b.start - a.start)
      .reduce((nextText, match) => {
        if (match.start < 0 || match.end > nextText.length || match.start >= match.end) {
          return nextText;
        }

        return `${nextText.slice(0, match.start)}${match.maskedValue}${nextText.slice(match.end)}`;
      }, text);
  }

  root.PromptGuardDetector = {
    scanText,
    highestSeverity,
    summarizeMatches,
    applyMasksToText,
    maskValue,
    severityRank
  };
})(globalThis);
