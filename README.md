# Prompt Guard Browser Extension

Prompt Guard is a Manifest V3 WebExtension for Chrome and Firefox. It monitors visible AI prompt fields, detects sensitive data locally, shows warnings based on severity, and can mask matched text in the prompt using per-field settings.

## Commands

```powershell
npm test
npm run build:chrome
npm run build:firefox
npm run build
```

Build outputs:

- Chrome: `dist/chrome`
- Firefox: `dist/firefox`

## Load Locally

Chrome:

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Choose **Load unpacked**.
4. Select `dist/chrome`.

Firefox:

1. Open `about:debugging#/runtime/this-firefox`.
2. Choose **Load Temporary Add-on**.
3. Select `dist/firefox/manifest.json`.

## Privacy

Detection runs locally in the page content script. The extension does not store recent alert history. The popup only shows the latest in-memory alert for the active tab, and raw detected values are not persisted.
