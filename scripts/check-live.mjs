import { APP_VERSION } from "../src/lib/auditEngine.js";

const baseUrl = normalizeBaseUrl(process.argv[2] || process.env.LIVE_URL || "https://web-production-b74c9.up.railway.app");

const checks = [
  await fetchJson("/__version", false),
  await fetchJson("/__frontend-check", false),
  await fetchJson("/__deploy-check", false),
  await fetchJson("/health", false)
];

const version = checks.find((check) => check.path === "/__version");
const frontend = checks.find((check) => check.path === "/__frontend-check");
const deploy = checks.find((check) => check.path === "/__deploy-check");
const health = checks.find((check) => check.path === "/health");

const ok =
  version.ok &&
  version.json?.version === APP_VERSION &&
  frontend.ok &&
  frontend.json?.ok === true &&
  deploy.ok &&
  deploy.json?.ok === true &&
  health.ok &&
  health.json?.version === APP_VERSION;

console.log(
  JSON.stringify(
    {
      ok,
      expectedVersion: APP_VERSION,
      baseUrl,
      checks: checks.map((check) => ({
        path: check.path,
        status: check.status,
        ok: check.ok,
        version: check.json?.version,
        frontendOk: check.json?.ok,
        contentKind: check.contentKind,
        diagnosis: diagnose(check)
      }))
    },
    null,
    2
  )
);

if (!ok) {
  throw new Error(
    "Live deployment is not running this upload root. Check GitHub root files, Railway branch, and Railway Root Directory."
  );
}

function normalizeBaseUrl(value) {
  return String(value || "").replace(/\/+$/, "");
}

async function fetchJson(path, throwOnHttpError = true) {
  const url = `${baseUrl}${path}`;
  try {
    const response = await fetch(url, { redirect: "follow" });
    const text = await response.text();
    const contentKind = text.trim().startsWith("<!doctype html") || text.trim().startsWith("<html") ? "html" : "json-or-text";
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    if (throwOnHttpError && !response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }
    return {
      path,
      status: response.status,
      ok: response.ok && Boolean(json),
      json,
      contentKind,
      sample: json ? undefined : text.slice(0, 180)
    };
  } catch (error) {
    return {
      path,
      status: 0,
      ok: false,
      contentKind: "error",
      error: error.message || String(error)
    };
  }
}

function diagnose(check) {
  if (check.contentKind === "html") {
    return "Endpoint returned index.html. The live server is old or Railway is serving the wrong root.";
  }
  if (!check.json) {
    return check.error || "Endpoint did not return JSON.";
  }
  if (check.json.version && check.json.version !== APP_VERSION) {
    return `Version mismatch: live=${check.json.version}`;
  }
  if (check.json.ok === false) {
    return "Endpoint returned ok=false.";
  }
  return "ok";
}
