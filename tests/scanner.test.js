const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadDetector() {
  const context = {
    console,
    URL,
    globalThis: null
  };
  context.globalThis = context;
  vm.createContext(context);

  for (const file of ["src/shared/default-rules.js", "src/shared/detector.js"]) {
    const source = readFileSync(path.join(__dirname, "..", file), "utf8");
    vm.runInContext(source, context, { filename: file });
  }

  return {
    rules: context.PromptGuardDefaultRules,
    detector: context.PromptGuardDetector
  };
}

function scan(text) {
  const { rules, detector } = loadDetector();
  return detector.scanText(text, rules);
}

test("detects representative sensitive values from the severity table", () => {
  const matches = scan([
    "AWS key AKIAIOSFODNN7EXAMPLE",
    "Aadhaar 2345 6789 1234",
    "PAN ABCDE1234F",
    "Email john@gmail.com",
    "Card 4111111111111111",
    "URL https://internal.example.com/path",
    "IP 192.168.1.10"
  ].join("\n"));

  const fields = matches.map((match) => match.fieldName);
  assert(fields.includes("AWS Access Key"));
  assert(fields.includes("Aadhaar Number"));
  assert(fields.includes("PAN Card Number"));
  assert(fields.includes("Email Address"));
  assert(fields.includes("Credit Card Number"));
  assert(fields.includes("URL"));
  assert(fields.includes("IPv4 Address"));
});

test("stores masked snippets instead of raw values when masking is enabled", () => {
  const { rules, detector } = loadDetector();
  const emailRule = rules.find((rule) => rule.id === "email-address");
  const [match] = detector.scanText("Email john@gmail.com", [
    { ...emailRule, masking: { enabled: true, character: "*", preserveStart: 1, preserveEnd: 0 } }
  ]);
  assert.equal(match.fieldName, "Email Address");
  assert.equal(match.maskedValue, "j***@gmail.com");
  assert(!JSON.stringify(match).includes("\"john@gmail.com\""));
});

test("does not flag short ordinary numbers as CVV without context", () => {
  const matches = scan("The release number is 1234 and the year is 2026.");
  assert.equal(matches.some((match) => match.fieldName === "CVV"), false);
});

test("context-aware generic token rules do not override more specific credential matches", () => {
  const matches = scan("api key ghp_abcdefghijklmnopqrstuvwxyzABCDEFGHIJ12");
  assert.equal(matches.length, 1);
  assert.equal(matches[0].fieldName, "GitHub Token");
  assert.equal(matches[0].severity, "CRITICAL");
});

test("generic long tokens require credential context", () => {
  const withoutContext = scan("Here is a long opaque value abcdefghijklmnopqrstuvwxyz123456.");
  assert.equal(withoutContext.length, 0);

  const withContext = scan("api key abcdefghijklmnopqrstuvwxyz123456");
  assert.equal(withContext.length, 1);
  assert.equal(withContext[0].fieldName, "Generic API Key / Secret");
});

test("uses per-rule mask character and preserve counts", () => {
  const { rules, detector } = loadDetector();
  const emailRule = rules.find((rule) => rule.id === "email-address");
  const matches = detector.scanText("Email john@gmail.com", [
    {
      ...emailRule,
      masking: {
        enabled: true,
        character: "x",
        preserveStart: 1,
        preserveEnd: 0
      }
    }
  ]);

  assert.equal(matches[0].maskedValue, "jxxx@gmail.com");
});

test("masking can be disabled per rule without exposing raw values", () => {
  const { rules, detector } = loadDetector();
  const emailRule = rules.find((rule) => rule.id === "email-address");
  const matches = detector.scanText("Email john@gmail.com", [
    {
      ...emailRule,
      masking: {
        enabled: false,
        character: "x",
        preserveStart: 0,
        preserveEnd: 0
      }
    }
  ]);

  assert.equal(matches.length, 1);
  assert.equal(matches[0].maskedValue, "");
  assert(!JSON.stringify(matches[0]).includes("john@gmail.com"));
});

test("applies enabled masks to text", () => {
  const { rules, detector } = loadDetector();
  const cardRule = rules.find((rule) => rule.id === "credit-card-number");
  const rulesWithMasking = [{ ...cardRule, masking: { enabled: true, character: "*", preserveStart: 0, preserveEnd: 4 } }];
  const matches = detector.scanText("Card 4111111111111111", rulesWithMasking);
  const maskedText = detector.applyMasksToText("Card 4111111111111111", matches);
  assert.equal(maskedText, "Card ************1111");
});
