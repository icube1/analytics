import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const mobileRoot = path.resolve(scriptDir, "..");
const webDistDir = path.join(mobileRoot, "../web/dist");
const indexPath = path.join(webDistDir, "index.html");
const marker = "analytics-mobile-runtime-config";

function readEnvValue(name, fallback = "") {
  if (process.env[name]) return process.env[name];
  const envPath = path.join(mobileRoot, ".env.local");
  try {
    const envText = readFileSync(envPath, "utf8");
    const match = envText.match(new RegExp(`^${name}=(.+)$`, "m"));
    if (match?.[1]) return match[1].trim().replace(/^['"]|['"]$/g, "");
  } catch {
    // optional local env
  }
  return fallback;
}

const apiBase = readEnvValue("MOBILE_API_BASE", "");
const authScheme = readEnvValue("MOBILE_AUTH_SCHEME", "analytics");
const authPath = readEnvValue("MOBILE_AUTH_CALLBACK_PATH", "/auth/callback");

const config = {
  apiBase,
  authCallbackScheme: authScheme,
  authCallbackPath: authPath,
  deepLinkHosts: ["app.gala-soft.ru"],
};

let indexHtml;
try {
  indexHtml = readFileSync(indexPath, "utf8");
} catch {
  console.error(`Missing web build at ${indexPath}. Run npm run build:web first.`);
  process.exit(1);
}

if (indexHtml.includes(marker)) {
  indexHtml = indexHtml.replace(
    new RegExp(`<!-- ${marker} -->[\\s\\S]*?<!-- /${marker} -->`, "m"),
    "",
  );
}

const injection = `<!-- ${marker} -->
<script>
window.__ANALYTICS_MOBILE_CONFIG__ = ${JSON.stringify(config)};
if (window.__ANALYTICS_MOBILE_CONFIG__.apiBase) {
  window.__ANALYTICS_API_BASE__ = window.__ANALYTICS_MOBILE_CONFIG__.apiBase;
}
</script>
<!-- /${marker} -->`;

const updated = indexHtml.includes("</head>")
  ? indexHtml.replace("</head>", `${injection}\n  </head>`)
  : `${injection}\n${indexHtml}`;

writeFileSync(indexPath, updated, "utf8");

console.log(`Prepared mobile bundle config in ${indexPath}`);
if (!apiBase) {
  console.warn(
    "MOBILE_API_BASE is empty — API calls use same-origin /api inside the WebView host.",
  );
}
