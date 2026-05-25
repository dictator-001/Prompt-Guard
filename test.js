const fs = require('fs');

const rulesCode = fs.readFileSync('src/shared/default-rules.js', 'utf8');
const rulesEval = rulesCode.replace('(function initDefaultRules(root) {', '').replace('})(globalThis);', '');
const rootObj = {};
eval(rulesEval);
const rules = rootObj.AIShieldDefaultRules;

const detectorCode = fs.readFileSync('src/shared/detector.js', 'utf8');
const detectorEval = detectorCode.replace('(function initDetector(root) {', '').replace('})(globalThis);', '');
eval(detectorEval);
const detector = rootObj.AIShieldDetector;

rules.forEach(r => {
  const dummy = r.id === 'email-address' ? 'test@example.com' :
                r.id === 'credit-card-number' ? '4111111111111111' :
                r.id === 'generic-api-key-secret' ? 'ABCDEFGHIJKLMNOPQRST' :
                r.id === 'aws-access-key' ? 'AKIA1234567890123456' :
                r.id === 'jwt-token' ? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c' :
                '12345678901234567890';
  const matches = detector.scanText(dummy, rules);
  if (matches.length > 0) {
    const masked = detector.applyMasksToText(dummy, matches);
    const reMatches = detector.scanText(masked, rules);
    if (reMatches.length > 0) {
      console.log('Rule', r.id, 'matches its own mask!', masked, 'Rematches:', reMatches.map(m => m.ruleId));
    }
  }
})
