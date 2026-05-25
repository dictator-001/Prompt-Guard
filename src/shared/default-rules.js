(function initDefaultRules(root) {
  const rules = [
    {
      id: "aws-access-key",
      severity: "CRITICAL",
      fieldName: "AWS Access Key",
      pattern: "\\bAKIA[0-9A-Z]{16}\\b",
      risk: "Direct cloud account compromise potential",
      enabled: true
    },
    {
      id: "aws-secret-key",
      severity: "CRITICAL",
      fieldName: "AWS Secret Key",
      pattern: "\\b[0-9a-zA-Z/+]{40}\\b",
      risk: "Full API authentication credential",
      enabled: true,
      contextKeywords: ["aws", "secret", "aws_secret_access_key", "secret key"]
    },
    {
      id: "github-token",
      severity: "CRITICAL",
      fieldName: "GitHub Token",
      pattern: "\\bgh[pousr]_[A-Za-z0-9]{36,255}\\b",
      risk: "Repository compromise / CI-CD compromise",
      enabled: true
    },
    {
      id: "google-api-key",
      severity: "CRITICAL",
      fieldName: "Google API Key",
      pattern: "\\bAIza[0-9A-Za-z-_]{35}\\b",
      risk: "Abuse of cloud APIs and billing",
      enabled: true
    },
    {
      id: "stripe-secret-key",
      severity: "CRITICAL",
      fieldName: "Stripe Secret Key",
      pattern: "\\bsk_live_[0-9a-zA-Z]{24,}\\b",
      risk: "Financial transaction abuse",
      enabled: true
    },
    {
      id: "jwt-token",
      severity: "CRITICAL",
      fieldName: "JWT Token",
      pattern: "\\beyJ[A-Za-z0-9_-]+\\.[A-Za-z0-9.*-]+\\.[A-Za-z0-9.*-]+\\b",
      risk: "Session hijacking / identity impersonation",
      enabled: true
    },
    {
      id: "generic-api-key-secret",
      severity: "CRITICAL",
      fieldName: "Generic API Key / Secret",
      pattern: "\\b[A-Za-z0-9_-]{20,}\\b",
      risk: "Credential leakage / unauthorized access",
      enabled: true,
      contextKeywords: ["api key", "apikey", "secret", "token", "bearer", "credential", "access key"]
    },
    {
      id: "credit-card-number",
      severity: "CRITICAL",
      fieldName: "Credit Card Number",
      pattern: "\\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\\b",
      risk: "Financial fraud",
      enabled: true
    },
    {
      id: "aadhaar-number",
      severity: "HIGH",
      fieldName: "Aadhaar Number",
      pattern: "\\b[2-9]\\d{3}\\s?\\d{4}\\s?\\d{4}\\b",
      risk: "National identity theft",
      enabled: true
    },
    {
      id: "passport-number-india",
      severity: "HIGH",
      fieldName: "Passport Number (India)",
      pattern: "\\b[A-Z][0-9]{7}\\b",
      risk: "Identity fraud / travel document abuse",
      enabled: true,
      contextKeywords: ["passport", "travel document"]
    },
    {
      id: "pan-card-number",
      severity: "HIGH",
      fieldName: "PAN Card Number",
      pattern: "\\b[A-Z]{5}[0-9]{4}[A-Z]\\b",
      risk: "Financial and tax identity misuse",
      enabled: true
    },
    {
      id: "bank-account-number",
      severity: "HIGH",
      fieldName: "Bank Account Number",
      pattern: "\\b\\d{9,18}\\b",
      risk: "Banking fraud potential",
      enabled: true,
      contextKeywords: ["account", "acct", "bank", "beneficiary", "ifsc", "branch"]
    },
    {
      id: "cvv",
      severity: "HIGH",
      fieldName: "CVV",
      pattern: "\\b\\d{3,4}\\b",
      risk: "Card-not-present fraud when paired with card data",
      enabled: true,
      contextKeywords: ["cvv", "cvc", "security code", "card verification"]
    },
    {
      id: "upi-id",
      severity: "HIGH",
      fieldName: "UPI ID",
      pattern: "\\b[\\w.-]{2,256}@[a-zA-Z]{2,64}\\b",
      risk: "Payment targeting / phishing",
      enabled: true,
      contextKeywords: ["upi", "vpa", "payment", "pay"]
    },
    {
      id: "email-address",
      severity: "HIGH",
      fieldName: "Email Address",
      pattern: "\\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}\\b",
      risk: "Phishing / account targeting",
      enabled: true
    },
    {
      id: "phone-number-india",
      severity: "HIGH",
      fieldName: "Phone Number (India)",
      pattern: "\\b(?:\\+91[-\\s]?)?[6-9]\\d{9}\\b",
      risk: "Social engineering / OTP targeting",
      enabled: true
    },
    {
      id: "imei-number",
      severity: "HIGH",
      fieldName: "IMEI Number",
      pattern: "\\b\\d{15}\\b",
      risk: "Device tracking / telecom abuse",
      enabled: true,
      contextKeywords: ["imei", "device id", "handset"]
    },
    {
      id: "ifsc-code",
      severity: "MEDIUM",
      fieldName: "IFSC Code",
      pattern: "\\b[A-Z]{4}0[A-Z0-9]{6}\\b",
      risk: "Banking metadata exposure",
      enabled: true
    },
    {
      id: "dob-dd-mm-yyyy",
      severity: "MEDIUM",
      fieldName: "Date of Birth (DD/MM/YYYY)",
      pattern: "\\b(0[1-9]|[12][0-9]|3[01])[./-](0[1-9]|1[0-2])[./-](19|20)\\d\\d\\b",
      risk: "Identity correlation",
      enabled: true,
      masking: { enabled: true, character: "*", preserveStart: 0, preserveEnd: 0 }
    },
    {
      id: "dob-yyyy-mm-dd",
      severity: "MEDIUM",
      fieldName: "Date of Birth (YYYY-MM-DD)",
      pattern: "\\b(19|20)\\d\\d[./-](0[1-9]|1[0-2])[./-](0[1-9]|[12][0-9]|3[01])\\b",
      risk: "Identity correlation",
      enabled: true,
      masking: { enabled: true, character: "*", preserveStart: 0, preserveEnd: 0 }
    },
    {
      id: "vehicle-registration-number",
      severity: "MEDIUM",
      fieldName: "Vehicle Registration Number",
      pattern: "\\b[A-Z]{2}[ -]?\\d{1,2}[ -]?[A-Z]{1,3}[ -]?\\d{4}\\b",
      risk: "Physical/user tracking",
      enabled: true,
      contextKeywords: ["vehicle", "registration", "license plate", "number plate"]
    },
    {
      id: "ipv4-address",
      severity: "MEDIUM",
      fieldName: "IPv4 Address",
      pattern: "\\b(?:(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)\\.){3}(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)\\b",
      risk: "Infrastructure exposure",
      enabled: true
    },
    {
      id: "ipv6-address",
      severity: "MEDIUM",
      fieldName: "IPv6 Address",
      pattern: "\\b(?:[A-Fa-f0-9]{1,4}:){7}[A-Fa-f0-9]{1,4}\\b",
      risk: "Infrastructure exposure",
      enabled: true
    },
    {
      id: "mac-address",
      severity: "MEDIUM",
      fieldName: "MAC Address",
      pattern: "\\b(?:[0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}\\b",
      risk: "Device fingerprinting",
      enabled: true
    },
    {
      id: "url",
      severity: "MEDIUM",
      fieldName: "URL",
      pattern: "\\bhttps?://[^\\s/$.?#].[^\\s]*\\b",
      risk: "Internal endpoint leakage",
      enabled: true
    },
    {
      id: "domain-name",
      severity: "LOW",
      fieldName: "Domain Name",
      pattern: "\\b(?:[a-zA-Z0-9-]+\\.)+[a-zA-Z]{2,}\\b",
      risk: "Public infrastructure metadata",
      enabled: true,
      contextKeywords: ["domain", "host", "hostname", "server", "endpoint"]
    },
    {
      id: "generic-numeric-identifier",
      severity: "LOW",
      fieldName: "Generic Numeric Identifier",
      pattern: "\\b\\d{9,18}\\b",
      risk: "Possible false positives without context",
      enabled: true,
      contextKeywords: ["id", "identifier", "reference", "customer", "user", "order", "invoice"]
    },
    {
      id: "generic-token-string",
      severity: "LOW",
      fieldName: "Generic Token/String",
      pattern: "\\b[A-Za-z0-9_-]{20,}\\b",
      risk: "Requires contextual validation",
      enabled: true,
      contextKeywords: ["token", "key", "secret", "identifier", "credential", "hash"]
    }
  ];

  root.PromptGuardDefaultRules = Object.freeze(rules.map((rule) => Object.freeze({ ...rule })));
})(globalThis);
