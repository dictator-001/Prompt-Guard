const fs = require('fs');
const path = require('path');

const filesToProcess = [
  'package.json',
  'README.md',
  'scripts/build.mjs',
  'src/background/background.js',
  'src/shared/browser-api.js',
  'src/shared/detector.js',
  'src/shared/default-rules.js',
  'src/shared/settings.js',
  'src/content/content.js',
  'src/content/content.css',
  'src/popup/popup.html',
  'src/popup/popup.js',
  'src/popup/popup.css',
  'src/options/options.html',
  'src/options/options.js',
  'tests/scanner.test.js'
];

for (const relPath of filesToProcess) {
  const filePath = path.join(process.cwd(), relPath);
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Replace logic:
    content = content.replace(/AI Shield/g, 'Prompt Guard');
    content = content.replace(/AIShield/g, 'PromptGuard');
    content = content.replace(/aiShield/g, 'promptGuard');
    content = content.replace(/ai-shield/g, 'prompt-guard');
    content = content.replace(/ai_shield/g, 'prompt_guard'); // just in case
    
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Updated', relPath);
  } else {
    console.log('File not found', relPath);
  }
}
