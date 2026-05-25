import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const srcDir = path.join(root, "src");
const distDir = path.join(root, "dist");

const target = process.argv[2] || "all";
const validTargets = new Set(["all", "chrome", "firefox"]);

if (!validTargets.has(target)) {
  console.error("Usage: node scripts/build.mjs [all|chrome|firefox]");
  process.exit(1);
}

const defaultHostPermissions = [
  "https://chatgpt.com/*",
  "https://*.chatgpt.com/*",
  "https://chat.openai.com/*",
  "https://claude.ai/*",
  "https://*.claude.ai/*",
  "https://gemini.google.com/*",
  "https://copilot.microsoft.com/*",
  "https://perplexity.ai/*",
  "https://www.perplexity.ai/*",
  "https://poe.com/*",
  "https://*.poe.com/*"
];

const baseManifest = {
  manifest_version: 3,
  name: "Prompt Guard",
  short_name: "Prompt Guard",
  version: "0.1.0",
  description: "Alerts when sensitive data is typed into AI prompt fields.",
  icons: {
    "128": "assets/icon128.png"
  },
  action: {
    default_title: "Prompt Guard",
    default_popup: "popup/popup.html",
    default_icon: {
      "128": "assets/icon128.png"
    }
  },
  options_page: "options/options.html",
  permissions: ["storage", "scripting", "activeTab", "tabs"],
  host_permissions: defaultHostPermissions,
  optional_host_permissions: ["http://*/*", "https://*/*"]
};

const contentScriptFiles = [
  "shared/browser-api.js",
  "shared/default-rules.js",
  "shared/detector.js",
  "shared/settings.js",
  "content/content.js"
];

function manifestFor(browser) {
  if (browser === "chrome") {
    return {
      ...baseManifest,
      minimum_chrome_version: "121",
      background: {
        service_worker: "background/background.js"
      },
      content_scripts: [
        {
          matches: defaultHostPermissions,
          js: contentScriptFiles,
          css: ["content/content.css"],
          run_at: "document_idle"
        }
      ]
    };
  }

  return {
    ...baseManifest,
    browser_specific_settings: {
      gecko: {
        id: "prompt-guard@example.local",
        strict_min_version: "142.0",
        data_collection_permissions: { required: ["none"] }
      }
    },
    background: {
      scripts: [
        "shared/browser-api.js",
        "shared/default-rules.js",
        "shared/detector.js",
        "shared/settings.js",
        "background/background.js"
      ]
    },
    content_scripts: [
      {
        matches: defaultHostPermissions,
        js: contentScriptFiles,
        css: ["content/content.css"],
        run_at: "document_idle"
      }
    ]
  };
}

async function build(browser) {
  const outDir = path.join(distDir, browser);
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  await cp(srcDir, outDir, { recursive: true });
  await writeFile(
    path.join(outDir, "manifest.json"),
    `${JSON.stringify(manifestFor(browser), null, 2)}\n`,
    "utf8"
  );
  console.log(`Built ${browser} extension at ${path.relative(root, outDir)}`);
}

if (target === "all") {
  await build("chrome");
  await build("firefox");
} else {
  await build(target);
}
