import express from "express";
import * as cheerio from "cheerio";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  APP_VERSION,
  buildReport,
  countTextSignals,
  createFallbackFacts,
  normalizeUrl
} from "./src/lib/auditEngine.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT || 8787);
const DATA_DIR = path.join(__dirname, "data");
const REPORTS_PATH = path.join(DATA_DIR, "reports.json");
const JOBS_PATH = path.join(DATA_DIR, "jobs.json");
const MAX_STORED_JOBS = 40;
const DIST_DIR = path.join(__dirname, "dist");
const DEPLOY_MARKER = `GITHUB_ROOT_UPLOAD_${APP_VERSION}`;
const DEPLOY_MARKER_PATH = path.join(__dirname, "DEPLOYMENT_MARKER.txt");
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.openstreetmap.ru/api/interpreter"
];
const REQUIRED_ROOT_ITEMS = [
  "package.json",
  "app-server.mjs",
  "server.js",
  "dist",
  "src",
  "scripts",
  "public",
  "railway.json",
  "nixpacks.toml",
  "pnpm-lock.yaml"
];
const jobsCache = new Map();

const app = express();
app.use(express.json({ limit: "1mb" }));
await loadJobs();

app.get("/health", (_request, response) => {
  response.json({ ok: true, version: APP_VERSION });
});

app.get("/__version", (_request, response) => {
  response.json({
    version: APP_VERSION,
    name: "SiteMoney Audit",
    timestamp: new Date().toISOString()
  });
});

app.get("/__frontend-check", async (_request, response) => {
  const check = await inspectFrontendBuild();
  response.status(check.ok ? 200 : 500).json(check);
});

app.get("/__deploy-check", async (_request, response) => {
  const frontend = await inspectFrontendBuild();
  const required = await inspectRequiredRootItems();
  const markerText = await readOptionalText(DEPLOY_MARKER_PATH);
  const markerFileOk = markerText.includes(DEPLOY_MARKER);
  const ok = frontend.ok && markerFileOk && required.every((item) => item.exists);

  response.status(ok ? 200 : 500).json({
    ok,
    version: APP_VERSION,
    markerExpected: DEPLOY_MARKER,
    markerFileOk,
    requiredRootItems: required,
    frontend,
    startCommand: "node app-server.mjs",
    rootDirectory:
      "empty if these files are in the GitHub root; RAILWAY_UPLOAD_READY only if that folder itself is inside the repo"
  });
});

app.get("/api/templates", (_request, response) => {
  response.json({
    niches: ["plumber", "dentist", "roofing", "salon", "law firm", "restaurant", "fitness studio"],
    modes: [
      { id: "fast", label: "Быстро", description: "HTML-сигналы и продаваемые правки." },
      { id: "deep", label: "Глубоко", description: "Больше проверок и доказательств." },
      { id: "agent", label: "Агент", description: "Отчет, CRM, follow-up и пакет услуги." }
    ],
    version: APP_VERSION
  });
});

app.post("/api/audit", async (request, response) => {
  try {
    const report = await auditSingle(request.body);
    await rememberReport(report);
    response.json(report);
  } catch (error) {
    response.status(400).json({ error: error.message || "Audit failed" });
  }
});

app.post("/api/bulk-audit", async (request, response) => {
  const urls = normalizeQueue(request.body.urls || request.body.queue || request.body.urlList);
  if (!urls.length) {
    response.status(400).json({ error: "Добавь хотя бы один URL в очередь." });
    return;
  }

  const limitedUrls = urls.slice(0, 12);
  const reports = [];
  for (const url of limitedUrls) {
    try {
      const report = await auditSingle({ ...request.body, url });
      await rememberReport(report);
      reports.push({ ok: true, report });
    } catch (error) {
      reports.push({ ok: false, url, error: error.message || "Audit failed" });
    }
  }

  response.json({
    version: APP_VERSION,
    total: reports.length,
    ok: reports.filter((item) => item.ok).length,
    reports
  });
});

app.post("/api/discover", async (request, response) => {
  try {
    const payload = normalizeDiscoveryPayload(request.body || {});
    const discovery = await runBusinessDiscovery(payload, request.body || {});

    response.json({
      version: APP_VERSION,
      source: "openstreetmap-overpass",
      query: payload,
      searchedLocations: discovery.locations.map((item) => item.label),
      warnings: discovery.warnings,
      total: discovery.rawBusinesses.length,
      withWebsite: discovery.rawBusinesses.filter((item) => item.website).length,
      withoutWebsite: discovery.rawBusinesses.filter((item) => !item.website).length,
      businesses: discovery.businesses,
      reports: discovery.reports
    });
  } catch (error) {
    response.status(400).json({ error: error.message || "Discovery failed" });
  }
});

app.post("/api/lead-machine", async (request, response) => {
  try {
    const data = await executeLeadMachine(request.body || {});
    response.json(data);
  } catch (error) {
    response.status(400).json({ error: error.message || "Lead machine failed" });
  }
});

app.post("/api/lead-machine/jobs", async (request, response) => {
  try {
    const job = await startLeadMachineJob(request.body || {});
    response.status(202).json({
      ok: true,
      version: APP_VERSION,
      job: publicJob(job),
      statusUrl: `/api/jobs/${job.id}`
    });
  } catch (error) {
    response.status(400).json({ error: error.message || "Could not start background scan" });
  }
});

app.get("/api/jobs/latest", (request, response) => {
  const type = String(request.query.type || "lead-machine");
  response.json({
    ok: true,
    version: APP_VERSION,
    job: publicJob(latestJob(type))
  });
});

app.get("/api/jobs/:id", (request, response) => {
  const job = jobsCache.get(request.params.id);
  if (!job) {
    response.status(404).json({ ok: false, error: "Job not found" });
    return;
  }
  response.json({
    ok: true,
    version: APP_VERSION,
    job: publicJob(job)
  });
});

app.get("/api/reports", async (_request, response) => {
  response.json(await readReports());
});

await ensureFreshFrontendBuild();

app.use(
  express.static(DIST_DIR, {
    setHeaders(response, filePath) {
      if (filePath.endsWith("index.html")) {
        response.setHeader("Cache-Control", "no-store");
      }
    }
  })
);
app.use(express.static(path.join(__dirname, "public")));
app.get(/.*/, async (_request, response, next) => {
  try {
    await fs.access(path.join(DIST_DIR, "index.html"));
    response.setHeader("Cache-Control", "no-store");
    response.sendFile(path.join(DIST_DIR, "index.html"));
  } catch {
    next();
  }
});

app.listen(PORT, () => {
  console.log(`SiteMoney Audit ${APP_VERSION} running on http://127.0.0.1:${PORT}`);
  resumeInterruptedJobs().catch((error) => {
    console.error("Could not resume background jobs", error);
  });
});

async function ensureFreshFrontendBuild() {
  const current = await inspectFrontendBuild();
  if (current.ok) return current;

  console.warn("Frontend build is missing or stale. Rebuilding before serving traffic.", current);
  try {
    const { build } = await import("vite");
    await build({
      root: __dirname,
      configFile: path.join(__dirname, "vite.config.js"),
      logLevel: "warn"
    });
  } catch (error) {
    throw new Error(`Frontend runtime rebuild failed: ${error.message || error}`);
  }

  const rebuilt = await inspectFrontendBuild();
  if (!rebuilt.ok) {
    throw new Error(`Frontend rebuild stayed stale: ${JSON.stringify(rebuilt)}`);
  }
  console.log("Frontend runtime rebuild verified.", rebuilt.checks);
  return rebuilt;
}

async function auditSingle(input) {
  const normalizedUrl = normalizeUrl(input.url);
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const fetchResponse = await fetch(normalizedUrl, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent":
          "Mozilla/5.0 SiteMoneyAudit/1.0 (+local audit tool; conversion diagnostics)",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      }
    });

    const html = await fetchResponse.text();
    const loadMs = Date.now() - startedAt;
    const facts = extractFacts({
      input,
      finalUrl: fetchResponse.url || normalizedUrl,
      status: fetchResponse.status,
      headers: fetchResponse.headers,
      html,
      loadMs
    });

    return buildReport({ ...input, url: normalizedUrl }, facts);
  } catch (error) {
    const facts = createFallbackFacts({ ...input, url: normalizedUrl }, readableFetchError(error));
    return buildReport({ ...input, url: normalizedUrl }, facts);
  } finally {
    clearTimeout(timeout);
  }
}

async function executeLeadMachine(input = {}, onProgress = null) {
  const payload = normalizeDiscoveryPayload({
    ...input,
    auditFound: input?.auditFound !== false,
    limit: input?.limit || 45,
    auditLimit: input?.auditLimit || 10,
    locationLimit: input?.locationLimit || 8
  });
  const machine = normalizeLeadMachinePayload(input || {});
  await reportProgress(onProgress, {
    phase: "prepare",
    message: "Готовлю фоновый поиск бизнесов",
    percent: 3,
    found: 0,
    audited: 0,
    ranked: 0
  });

  const discovery = await runBusinessDiscovery(payload, input || {}, onProgress);
  await reportProgress(onProgress, {
    phase: "rank",
    message: "Ранжирую лиды по деньгам и удобству контакта",
    percent: 92,
    found: discovery.rawBusinesses.length,
    audited: discovery.reports.length
  });

  const leads = buildMoneyMachineLeads(discovery.businesses, discovery.reports, payload, machine)
    .filter((lead) => lead.moneyScore >= machine.minMoneyScore)
    .slice(0, machine.maxLeads);
  const pipeline = summarizeMoneyPipeline(leads);

  await reportProgress(onProgress, {
    phase: "completed",
    message: `Скан завершен: найдено ${leads.length} лидов`,
    percent: 100,
    found: discovery.rawBusinesses.length,
    audited: discovery.reports.length,
    ranked: leads.length
  });

  return {
    version: APP_VERSION,
    source: "openstreetmap-overpass",
    generatedAt: new Date().toISOString(),
    query: { ...payload, ...machine },
    searchedLocations: discovery.locations.map((item) => item.label),
    warnings: discovery.warnings,
    totals: {
      found: discovery.rawBusinesses.length,
      ranked: leads.length,
      withWebsite: leads.filter((lead) => lead.website).length,
      withoutWebsite: leads.filter((lead) => !lead.website).length,
      audited: discovery.reports.length
    },
    pipeline,
    leads,
    reports: discovery.reports
  };
}

async function startLeadMachineJob(input = {}) {
  const now = new Date().toISOString();
  const job = {
    id: createJobId(),
    type: "lead-machine",
    status: "queued",
    createdAt: now,
    updatedAt: now,
    startedAt: "",
    completedAt: "",
    input,
    progress: {
      phase: "queued",
      message: "Фоновый режим включен: сервер принял скан в работу",
      percent: 0,
      found: 0,
      audited: 0,
      ranked: 0
    },
    result: null,
    error: ""
  };
  await saveJob(job);
  setTimeout(() => {
    runLeadMachineJob(job.id).catch((error) => {
      console.error(`Background lead-machine job ${job.id} crashed`, error);
    });
  }, 0);
  return job;
}

async function runLeadMachineJob(jobId) {
  const job = jobsCache.get(jobId);
  if (!job || job.status === "completed") return;

  job.status = "running";
  job.startedAt = job.startedAt || new Date().toISOString();
  job.progress = {
    ...job.progress,
    phase: "running",
    message: "Скан продолжается на сервере",
    percent: Math.max(1, Number(job.progress?.percent || 0))
  };
  await saveJob(job);

  const onProgress = async (patch) => {
    const current = jobsCache.get(jobId);
    if (!current || current.status !== "running") return;
    current.progress = {
      ...current.progress,
      ...patch,
      updatedAt: new Date().toISOString()
    };
    await saveJob(current);
  };

  try {
    const result = await executeLeadMachine(job.input || {}, onProgress);
    const done = jobsCache.get(jobId) || job;
    done.status = "completed";
    done.completedAt = new Date().toISOString();
    done.result = result;
    done.error = "";
    done.progress = {
      ...done.progress,
      phase: "completed",
      message: `Последний скан готов: ${result.totals?.ranked || 0} лидов`,
      percent: 100,
      found: result.totals?.found || 0,
      audited: result.totals?.audited || 0,
      ranked: result.totals?.ranked || 0,
      updatedAt: new Date().toISOString()
    };
    await saveJob(done);
  } catch (error) {
    const failed = jobsCache.get(jobId) || job;
    failed.status = "failed";
    failed.completedAt = new Date().toISOString();
    failed.error = error.message || "Lead machine failed";
    failed.progress = {
      ...failed.progress,
      phase: "failed",
      message: failed.error,
      updatedAt: new Date().toISOString()
    };
    await saveJob(failed);
  }
}

async function resumeInterruptedJobs() {
  const interrupted = [...jobsCache.values()].filter((job) =>
    job.type === "lead-machine" && ["queued", "running"].includes(job.status)
  );
  for (const job of interrupted) {
    job.status = "queued";
    job.progress = {
      ...job.progress,
      phase: "queued",
      message: "Сервер перезапущен, скан продолжен заново по сохраненным настройкам"
    };
    await saveJob(job);
    setTimeout(() => {
      runLeadMachineJob(job.id).catch((error) => {
        console.error(`Could not resume lead-machine job ${job.id}`, error);
      });
    }, 250);
  }
}

async function reportProgress(onProgress, patch) {
  if (!onProgress) return;
  await onProgress(patch);
}

function publicJob(job) {
  if (!job) return null;
  return {
    id: job.id,
    type: job.type,
    status: job.status,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    progress: job.progress || {},
    input: job.input || {},
    result: job.result || null,
    error: job.error || ""
  };
}

function latestJob(type = "lead-machine") {
  return [...jobsCache.values()]
    .filter((job) => job.type === type)
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))[0] || null;
}

async function loadJobs() {
  const jobs = await readJobs();
  jobsCache.clear();
  for (const job of jobs) {
    if (job?.id) jobsCache.set(job.id, job);
  }
}

async function readJobs() {
  try {
    const raw = await fs.readFile(JOBS_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveJob(job) {
  job.updatedAt = new Date().toISOString();
  jobsCache.set(job.id, job);
  await persistJobs();
  return job;
}

async function persistJobs() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const jobs = [...jobsCache.values()]
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    .slice(0, MAX_STORED_JOBS);
  await fs.writeFile(JOBS_PATH, JSON.stringify(jobs, null, 2));
}

function createJobId() {
  return `job-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

async function inspectFrontendBuild() {
  const markers = {
    version: APP_VERSION,
    globalSearch: "Глобальный поиск",
    findBusinesses: "Найти бизнесы",
    discoveryList: "Найденные бизнесы автопилотом",
    savedLeads: "Сохраненные лиды",
    leadCsv: "CSV лиды",
    geoPreset: "USA money",
    moneyMachine: "Money Machine",
    runMoneyMachine: "Запустить money machine",
    hotLeads: "Горячие лиды",
    leadWorkbench: "Lead Workbench",
    backgroundMode: "Фоновый режим",
    scanContinues: "Скан продолжается",
    latestScan: "Последний скан",
    serverJob: "Серверный job",
    safeAuditAction: "Проверить сайт",
    outreachPack: "TXT pack",
    googleSearch: "Google поиск"
  };

  try {
    const indexHtml = await fs.readFile(path.join(DIST_DIR, "index.html"), "utf8");
    const assets = Array.from(indexHtml.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g))
      .map((match) => match[1])
      .filter((assetPath) => assetPath.startsWith("/assets/"));
    let bundleText = indexHtml;
    for (const assetPath of assets) {
      const filePath = path.join(DIST_DIR, assetPath.replace(/^\//, ""));
      bundleText += "\n" + (await fs.readFile(filePath, "utf8"));
    }

    const checks = Object.fromEntries(
      Object.entries(markers).map(([key, marker]) => [key, bundleText.includes(marker)])
    );

    return {
      ok: Object.values(checks).every(Boolean),
      version: APP_VERSION,
      checks,
      assets
    };
  } catch (error) {
    return {
      ok: false,
      version: APP_VERSION,
      error: error.message || "Frontend build check failed"
    };
  }
}

async function inspectRequiredRootItems() {
  return Promise.all(
    REQUIRED_ROOT_ITEMS.map(async (item) => {
      try {
        await fs.access(path.join(__dirname, item));
        return { item, exists: true };
      } catch {
        return { item, exists: false };
      }
    })
  );
}

async function readOptionalText(filePath) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return "";
  }
}

function extractFacts({ input, finalUrl, status, headers, html, loadMs }) {
  const $ = cheerio.load(html || "");
  const text = $("body").text().replace(/\s+/g, " ").trim();
  const lowerText = text.toLowerCase();
  const title = $("title").first().text().trim();
  const metaDescription = $('meta[name="description"]').attr("content") || "";
  const h1 = $("h1")
    .map((_, element) => $(element).text().replace(/\s+/g, " ").trim())
    .get()
    .filter(Boolean)
    .slice(0, 5);
  const links = $("a").toArray();
  const imageCount = $("img").length;
  const imagesWithAlt = $("img[alt]")
    .toArray()
    .filter((element) => String($(element).attr("alt") || "").trim().length > 2).length;
  const hrefs = links.map((element) => String($(element).attr("href") || "").toLowerCase());
  const scripts = $("script")
    .map((_, element) => `${$(element).attr("src") || ""} ${$(element).html() || ""}`)
    .get()
    .join(" ")
    .toLowerCase();
  const fullText = `${title} ${metaDescription} ${text}`.toLowerCase();
  const ctaSamples = links
    .map((element) => $(element).text().replace(/\s+/g, " ").trim())
    .filter((label) => CTA_REGEXP.test(label))
    .slice(0, 8);
  const phoneMatch = html.match(/(\+?\d[\d\s().-]{7,}\d)/);
  const emailMatch = html.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  const url = new URL(finalUrl);

  return {
    source: "live",
    finalUrl,
    host: url.hostname,
    status,
    loadMs,
    pageSizeKb: Math.round(Buffer.byteLength(html || "", "utf8") / 1024),
    title,
    metaDescription,
    h1,
    wordCount: text ? text.split(/\s+/).length : 0,
    hasViewport: Boolean($('meta[name="viewport"]').attr("content")),
    isHttps: url.protocol === "https:",
    hasPhone: Boolean(phoneMatch) || hrefs.some((href) => href.startsWith("tel:")),
    phone: phoneMatch?.[0] || "",
    hasEmail: Boolean(emailMatch) || hrefs.some((href) => href.startsWith("mailto:")),
    email: emailMatch?.[0] || "",
    forms: $("form").length,
    ctaCount: ctaSamples.length + countTerms(fullText, CTA_WORDS),
    ctaSamples,
    hasBooking: /book|appointment|schedule|calendly|acuity|reservation|запис/i.test(fullText + hrefs.join(" ")),
    hasReviews: /review|testimonial|rating|stars|google reviews|yelp|отзыв/i.test(fullText),
    hasSocialLinks: hrefs.some((href) => /instagram|facebook|linkedin|tiktok|youtube|x\.com|twitter/.test(href)),
    hasMaps: hrefs.some((href) => /google\.com\/maps|maps\.app\.goo\.gl|waze/.test(href)) || /directions|map|address|адрес/i.test(fullText),
    hasSchema: $('script[type="application/ld+json"]').length > 0,
    hasAnalytics: /gtag|google-analytics|googletagmanager|plausible|matomo|segment|hotjar|clarity/.test(scripts),
    hasOgTags: $('meta[property^="og:"]').length > 0,
    imageAltRatio: imageCount ? Math.round((imagesWithAlt / imageCount) * 100) : 0,
    linksCount: links.length,
    securityHeaders: {
      hsts: headers.has("strict-transport-security"),
      csp: headers.has("content-security-policy"),
      frameOptions: headers.has("x-frame-options")
    },
    textSignals: countTextSignals(fullText),
    inputCityFound: fullText.includes(String(input.city || "").toLowerCase()),
    inputNicheFound: fullText.includes(String(input.niche || "").toLowerCase())
  };
}

function normalizeQueue(value) {
  if (Array.isArray(value)) {
    return value.map(String).map((item) => item.trim()).filter(Boolean);
  }
  return String(value || "")
    .split(/\r?\n|,|;/)
    .map((item) => item.trim())
    .filter(Boolean);
}

async function runBusinessDiscovery(payload, input = {}, onProgress = null) {
  const locations = payload.worldwide
    ? WORLD_LOCATIONS.slice(0, payload.locationLimit)
    : await resolveLocations(payload);
  const rawBusinesses = [];
  const seen = new Set();
  const warnings = [];

  await reportProgress(onProgress, {
    phase: "search",
    message: `Ищу бизнесы в ${locations.length} локациях`,
    percent: 8,
    totalLocations: locations.length,
    searchedLocations: [],
    found: 0
  });

  for (const [locationIndex, location] of locations.entries()) {
    let businesses = [];
    try {
      await reportProgress(onProgress, {
        phase: "search",
        message: `Поиск: ${location.label}`,
        percent: Math.min(72, 10 + Math.round((locationIndex / Math.max(locations.length, 1)) * 52)),
        currentLocation: location.label,
        totalLocations: locations.length,
        searchedLocations: locations.slice(0, locationIndex).map((item) => item.label),
        found: rawBusinesses.length
      });
      businesses = await searchBusinesses(location, payload);
    } catch (error) {
      warnings.push(`${location.label}: ${error.message || "search failed"}`);
      continue;
    }
    for (const business of businesses) {
      const key = String(business.website || `${business.name}-${business.lat}-${business.lon}`).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      rawBusinesses.push(business);
      if (rawBusinesses.length >= payload.limit) break;
    }
    await reportProgress(onProgress, {
      phase: "search",
      message: `Найдено ${rawBusinesses.length} бизнесов после ${location.label}`,
      percent: Math.min(72, 14 + Math.round(((locationIndex + 1) / Math.max(locations.length, 1)) * 52)),
      currentLocation: location.label,
      totalLocations: locations.length,
      searchedLocations: locations.slice(0, locationIndex + 1).map((item) => item.label),
      found: rawBusinesses.length
    });
    if (rawBusinesses.length >= payload.limit) break;
  }

  if (!rawBusinesses.length && warnings.length) {
    throw new Error(`Поиск временно не дал результатов. ${warnings.slice(0, 2).join(" | ")}`);
  }

  const reports = [];
  if (payload.auditFound) {
    const auditTargets = rawBusinesses.filter((item) => item.website).slice(0, payload.auditLimit);
    await reportProgress(onProgress, {
      phase: "audit",
      message: auditTargets.length ? `Аудирую ${auditTargets.length} сайтов` : "Нет сайтов для авто-аудита, ранжирую контакты",
      percent: 74,
      found: rawBusinesses.length,
      audited: 0,
      totalAudit: auditTargets.length
    });
    for (const [auditIndex, business] of auditTargets.entries()) {
      await reportProgress(onProgress, {
        phase: "audit",
        message: `Аудит ${auditIndex + 1}/${auditTargets.length}: ${business.name}`,
        percent: Math.min(90, 74 + Math.round((auditIndex / Math.max(auditTargets.length, 1)) * 16)),
        found: rawBusinesses.length,
        audited: reports.length,
        totalAudit: auditTargets.length,
        currentBusiness: business.name
      });
      const report = await auditSingle({
        ...input,
        url: business.website,
        niche: payload.niche,
        city: business.city || payload.city,
        averageSale: payload.averageSale,
        monthlyVisitors: payload.monthlyVisitors,
        mode: "agent",
        autopilot: true,
        createCrmTasks: true
      });
      report.discoveredBusiness = business;
      await rememberReport(report);
      reports.push(report);
      await reportProgress(onProgress, {
        phase: "audit",
        message: `Готов аудит ${reports.length}/${auditTargets.length}: ${business.name}`,
        percent: Math.min(90, 74 + Math.round(((auditIndex + 1) / Math.max(auditTargets.length, 1)) * 16)),
        found: rawBusinesses.length,
        audited: reports.length,
        totalAudit: auditTargets.length,
        currentBusiness: business.name
      });
    }
  }

  return {
    locations,
    warnings,
    rawBusinesses,
    reports,
    businesses: rankBusinesses(rawBusinesses, reports)
  };
}

function normalizeDiscoveryPayload(input) {
  const limit = clampNumber(input.limit, 5, 100, 30);
  const auditLimit = clampNumber(input.auditLimit, 1, 30, Math.min(6, limit));
  const locationLimit = clampNumber(input.locationLimit, 1, WORLD_LOCATIONS.length, 5);
  const city = String(input.city || "").trim();
  const country = String(input.country || "").trim();
  const locations = normalizeQueue(input.locations || input.locationList || "");
  const worldwide =
    Boolean(input.worldwide) ||
    /world|global|весь мир|мир|worldwide/i.test(`${input.scope || ""} ${city} ${country}`);

  return {
    niche: String(input.niche || "local service").trim(),
    city: city || "Austin",
    country,
    locations,
    worldwide,
    limit,
    auditLimit,
    locationLimit,
    radiusMeters: clampNumber(input.radiusKm, 1, 50, worldwide ? 12 : 18) * 1000,
    auditFound: input.auditFound !== false,
    requireWebsite: Boolean(input.requireWebsite),
    averageSale: Number(input.averageSale || 300),
    monthlyVisitors: Number(input.monthlyVisitors || 600)
  };
}

function normalizeLeadMachinePayload(input) {
  return {
    maxLeads: clampNumber(input.maxLeads || input.leadLimit, 5, 80, 30),
    minMoneyScore: clampNumber(input.minMoneyScore, 0, 100, 45),
    monthlyRetainer: clampNumber(input.monthlyRetainer, 0, 5000, 180),
    closeRate: clampNumber(input.closeRate, 1, 100, 12)
  };
}

async function resolveLocations(payload) {
  const labels = payload.locations.length
    ? payload.locations
    : [`${payload.city}${payload.country ? `, ${payload.country}` : ""}`];
  const resolved = [];
  for (const label of labels.slice(0, payload.locationLimit)) {
    const location = await geocodeLocation(label);
    if (location) resolved.push(location);
  }
  if (!resolved.length) {
    throw new Error("Не смог найти город/локацию. Попробуй формат: Austin, USA.");
  }
  return resolved;
}

async function geocodeLocation(label) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", label);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("addressdetails", "1");
  const response = await fetchWithTimeout(url, {
    headers: {
      "user-agent": "SiteMoneyAudit/1.0 discovery contact: local-tool"
    }
  }, 10000);
  if (!response.ok) return null;
  const data = await response.json();
  const item = data?.[0];
  if (!item) return null;
  return {
    label,
    lat: Number(item.lat),
    lon: Number(item.lon),
    city: item.address?.city || item.address?.town || item.address?.village || label,
    country: item.address?.country || ""
  };
}

async function searchBusinesses(location, payload) {
  const tagFilters = nicheToOverpassFilters(payload.niche);
  const query = `
    [out:json][timeout:25];
    (
      ${buildOverpassStatements(tagFilters, location, payload)}
    );
    out center tags ${Math.min(payload.limit * 2, 120)};
  `;
  let lastError = "";
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const response = await fetchWithTimeout(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
          "user-agent": "SiteMoneyAudit/1.0 discovery"
        },
        body: new URLSearchParams({ data: query })
      }, 30000);

      if (!response.ok) {
        lastError = `${new URL(endpoint).hostname} ${response.status}`;
        continue;
      }
      const data = await response.json();
      return (data.elements || [])
        .map((element) => normalizeOsmBusiness(element, location, payload))
        .filter((business) => business.name && (!payload.requireWebsite || business.website))
        .slice(0, payload.limit);
    } catch (error) {
      lastError = `${new URL(endpoint).hostname} ${error.message || "request failed"}`;
    }
  }

  const fallbackBusinesses = await searchBusinessesWithNominatim(location, payload);
  if (fallbackBusinesses.length) return fallbackBusinesses;

  throw new Error(`OpenStreetMap search failed after mirrors: ${lastError}`);
}

function buildOverpassStatements(tagFilters, location, payload) {
  const elementTypes = ["node", "way"];
  const websiteFilters = payload.requireWebsite ? ['["website"]', '["contact:website"]', '["url"]'] : [""];
  return tagFilters
    .flatMap((filter) =>
      websiteFilters.flatMap((websiteFilter) =>
        elementTypes.map(
          (type) =>
            `${type}${filter}${websiteFilter}(around:${payload.radiusMeters},${location.lat},${location.lon});`
        )
      )
    )
    .join("\n");
}

async function searchBusinessesWithNominatim(location, payload) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", `${payload.niche} ${location.label}`);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", String(Math.min(payload.limit, 30)));
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("extratags", "1");
  url.searchParams.set("namedetails", "1");

  const response = await fetchWithTimeout(url, {
    headers: {
      "user-agent": "SiteMoneyAudit/1.0 discovery fallback"
    }
  }, 15000);
  if (!response.ok) return [];
  const data = await response.json();
  return (data || [])
    .map((item) => normalizeNominatimBusiness(item, location, payload))
    .filter((business) => business.name && (!payload.requireWebsite || business.website))
    .slice(0, payload.limit);
}

function normalizeNominatimBusiness(item, location, payload) {
  const extra = item.extratags || {};
  const addressData = item.address || {};
  const website = normalizeBusinessWebsite(extra.website || extra["contact:website"] || extra.url);
  const phone = extra.phone || extra["contact:phone"] || "";
  const email = extra.email || extra["contact:email"] || "";
  const lat = Number(item.lat);
  const lon = Number(item.lon);
  const name =
    item.namedetails?.name ||
    item.namedetails?.["name:en"] ||
    extra.name ||
    String(item.display_name || "").split(",")[0];
  const address = [
    addressData.house_number,
    addressData.road,
    addressData.city || addressData.town || addressData.village || location.city,
    addressData.country || location.country
  ]
    .filter(Boolean)
    .join(", ");
  const contactScore = (website ? 34 : 0) + (phone ? 18 : 0) + (email ? 10 : 0);
  const fitScore = String(item.type || item.category || "").toLowerCase().includes(String(payload.niche).toLowerCase())
    ? 26
    : 14;

  return {
    id: `nominatim-${item.osm_type || "place"}-${item.osm_id || name}`,
    source: "OpenStreetMap Nominatim",
    name,
    niche: payload.niche,
    city: addressData.city || addressData.town || addressData.village || location.city,
    country: addressData.country || location.country,
    address,
    website,
    phone,
    email,
    lat,
    lon,
    mapUrl: lat && lon ? `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=17/${lat}/${lon}` : "",
    osmUrl: item.osm_type && item.osm_id ? `https://www.openstreetmap.org/${item.osm_type}/${item.osm_id}` : "",
    tags: compactTags({ amenity: item.type, shop: item.category, brand: extra.brand }),
    automationScore: Math.max(10, Math.min(100, contactScore + fitScore + 18)),
    status: website ? "ready_to_audit" : "needs_contact_research",
    suggestedAction: website
      ? "Авто-аудит сайта и подготовка сообщения"
      : "Открыть карту и найти сайт/телефон вручную"
  };
}

function normalizeOsmBusiness(element, location, payload) {
  const tags = element.tags || {};
  const website = normalizeBusinessWebsite(tags.website || tags["contact:website"] || tags.url);
  const lat = element.lat || element.center?.lat;
  const lon = element.lon || element.center?.lon;
  const name = tags.name || tags.brand || tags.operator || "";
  const phone = tags.phone || tags["contact:phone"] || "";
  const email = tags.email || tags["contact:email"] || "";
  const address = [
    tags["addr:housenumber"],
    tags["addr:street"],
    tags["addr:city"] || location.city,
    tags["addr:country"] || location.country
  ]
    .filter(Boolean)
    .join(", ");
  const noWebsitePenalty = website ? 0 : 32;
  const contactScore = (website ? 34 : 0) + (phone ? 18 : 0) + (email ? 10 : 0);
  const fitScore = businessNicheFit(tags, payload.niche);
  const automationScore = Math.max(5, Math.min(100, contactScore + fitScore - noWebsitePenalty + 25));

  return {
    id: `osm-${element.type}-${element.id}`,
    source: "OpenStreetMap",
    name,
    niche: payload.niche,
    city: location.city,
    country: location.country,
    address,
    website,
    phone,
    email,
    lat,
    lon,
    mapUrl: lat && lon ? `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=17/${lat}/${lon}` : "",
    osmUrl: `https://www.openstreetmap.org/${element.type}/${element.id}`,
    tags: compactTags(tags),
    automationScore,
    status: website ? "ready_to_audit" : "needs_website_lookup",
    suggestedAction: website
      ? "Авто-аудит сайта и подготовка сообщения"
      : "Найти сайт вручную или писать через телефон/карту"
  };
}

function rankBusinesses(businesses, reports) {
  const reportByWebsite = new Map(reports.map((report) => [report.input.url, report]));
  return businesses
    .map((business) => {
      const report = business.website ? reportByWebsite.get(business.website) : null;
      return {
        ...business,
        reportId: report?.id || "",
        score: report?.score.total || business.automationScore,
        moneyOpportunity: report?.money.monthlyOpportunity || 0,
        topPriority: report?.priorities?.[0]?.title || (business.website ? "Ждет аудита" : "Нет сайта в OSM")
      };
    })
    .sort((a, b) => {
      if (b.moneyOpportunity !== a.moneyOpportunity) return b.moneyOpportunity - a.moneyOpportunity;
      return b.score - a.score;
    });
}

function buildMoneyMachineLeads(businesses, reports, payload, machine) {
  const reportsById = new Map(reports.map((report) => [report.id, report]));
  const reportsByUrl = new Map();
  for (const report of reports) {
    [report.input?.url, report.finalUrl].filter(Boolean).forEach((url) => reportsByUrl.set(url, report));
  }

  return businesses
    .map((business, index) => {
      const report =
        reportsById.get(business.reportId) ||
        reportsByUrl.get(business.website) ||
        reports.find((item) => item.discoveredBusiness?.id === business.id);
      return buildMoneyMachineLead(business, report, payload, machine, index);
    })
    .sort((a, b) => {
      if (b.moneyScore !== a.moneyScore) return b.moneyScore - a.moneyScore;
      return b.estimatedDealValue - a.estimatedDealValue;
    });
}

function buildMoneyMachineLead(business, report, payload, machine, index) {
  const issue = detectLeadIssue(business, report);
  const offer = buildServiceOffer(issue, payload, machine);
  const contactRoute = pickContactRoute(business);
  const clientOpportunity = estimateClientOpportunity(business, report, payload, issue);
  const estimatedDealValue = offer.price + offer.monthly * 2;
  const moneyScore = scoreMoneyLead(business, report, payload, issue, offer);
  const priority = moneyScore >= 78 ? "hot" : moneyScore >= 58 ? "warm" : "cold";
  const pitch = createLeadPitch(business, report, issue, offer, clientOpportunity);

  return {
    ...business,
    rank: index + 1,
    moneyScore,
    priority,
    contactRoute,
    opportunity: issue.title,
    issue,
    serviceOffer: offer,
    estimatedDealValue,
    recurringValue: offer.monthly,
    clientOpportunity,
    recommendedAction: createRecommendedAction(business, issue, contactRoute),
    pitch,
    nextSteps: createLeadNextSteps(business, issue, offer),
    evidence: createLeadEvidence(business, report, issue),
    topPriority: issue.title,
    moneyOpportunity: clientOpportunity,
    score: report?.score?.total || business.score || moneyScore
  };
}

function detectLeadIssue(business, report) {
  const facts = report?.facts || {};
  const priority = report?.priorities?.[0];
  if (!business.website) {
    return {
      key: "no_website",
      title: "Нет сайта в открытых данных",
      severity: "high",
      reason: "Лид можно продавать как быстрый сайт/лендинг с заявкой и картой."
    };
  }
  if (priority) {
    return {
      key: priority.key,
      title: priority.title,
      severity: priority.severity,
      reason: priority.sellLine || priority.fix
    };
  }
  if (!facts.hasPhone && !facts.hasEmail) {
    return {
      key: "contact",
      title: "Нет быстрого контакта",
      severity: "high",
      reason: "Сайт есть, но горячий клиент не видит простой путь к заявке."
    };
  }
  if (!facts.hasBooking && facts.forms === 0) {
    return {
      key: "booking",
      title: "Нет формы заявки",
      severity: "high",
      reason: "Можно продать маленький lead-capture sprint без полного редизайна."
    };
  }
  return {
    key: "conversion",
    title: "Можно усилить конверсию",
    severity: "medium",
    reason: "Есть сайт, но можно упаковать улучшение первого экрана, CTA и доверия."
  };
}

function buildServiceOffer(issue, payload, machine) {
  const averageSale = Number(payload.averageSale || 300);
  const monthly = Math.max(0, Number(machine.monthlyRetainer || 0));
  const templates = {
    no_website: {
      name: "Website Starter",
      price: roundToNearest(Math.max(690, averageSale * 1.6), 10),
      monthly,
      scope: "1-страничный сайт, мобильная заявка, карта, телефон, базовое SEO"
    },
    contact: {
      name: "Lead Capture Fix",
      price: roundToNearest(Math.max(290, averageSale * 0.9), 10),
      monthly: Math.round(monthly * 0.6),
      scope: "CTA, кликабельный телефон, форма заявки, быстрый блок доверия"
    },
    booking: {
      name: "Booking Sprint",
      price: roundToNearest(Math.max(390, averageSale * 1.1), 10),
      monthly: Math.round(monthly * 0.7),
      scope: "Онлайн-запись или мини-форма, уведомления, tracking события"
    },
    proof: {
      name: "Trust Pack",
      price: roundToNearest(Math.max(250, averageSale * 0.7), 10),
      monthly: Math.round(monthly * 0.5),
      scope: "Отзывы, гарантии, фото работ, локальные доказательства"
    },
    local: {
      name: "Local SEO Patch",
      price: roundToNearest(Math.max(320, averageSale * 0.8), 10),
      monthly,
      scope: "Городские блоки, карта, service areas, schema и локальные CTA"
    },
    speed: {
      name: "Speed & Tracking Fix",
      price: roundToNearest(Math.max(260, averageSale * 0.6), 10),
      monthly: Math.round(monthly * 0.45),
      scope: "Ускорение, аналитика, события заявок и отчет до/после"
    }
  };

  return templates[issue.key] || {
    name: "Conversion Sprint",
    price: roundToNearest(Math.max(350, averageSale * 0.85), 10),
    monthly: Math.round(monthly * 0.6),
    scope: "3-5 правок, которые ближе всего к заявкам и продажам"
  };
}

function scoreMoneyLead(business, report, payload, issue, offer) {
  const hasDirectContact = Boolean(business.email || business.phone);
  const hasMap = Boolean(business.mapUrl || business.osmUrl);
  const averageSale = Number(payload.averageSale || 300);
  let score = 34;
  score += hasDirectContact ? 18 : hasMap ? 8 : 0;
  score += business.website ? 8 : 18;
  score += issue.severity === "high" ? 18 : issue.severity === "medium" ? 10 : 4;
  score += report?.score?.total && report.score.total < 62 ? 12 : 0;
  score += report?.money?.monthlyOpportunity > averageSale * 3 ? 10 : 0;
  score += averageSale >= 700 ? 8 : averageSale >= 300 ? 5 : 1;
  score += offer.price >= 600 ? 6 : 2;
  return clampNumber(score, 1, 100, 50);
}

function estimateClientOpportunity(business, report, payload, issue) {
  if (report?.money?.monthlyOpportunity) {
    return Math.round(report.money.monthlyOpportunity);
  }
  const averageSale = Number(payload.averageSale || 300);
  const baseLeads = issue.key === "no_website" ? 4 : 2;
  const contactLift = business.phone || business.email ? 1 : 0;
  return roundToNearest(Math.max(averageSale * (baseLeads + contactLift), averageSale * 1.4), 10);
}

function pickContactRoute(business) {
  if (business.email) return "email";
  if (business.phone) return "phone";
  if (business.website) return "website";
  if (business.mapUrl || business.osmUrl) return "map";
  return "research";
}

function createRecommendedAction(business, issue, contactRoute) {
  if (contactRoute === "email") return `Отправить email про: ${issue.title}`;
  if (contactRoute === "phone") return `Позвонить и предложить: ${issue.title}`;
  if (business.website) return `Открыть сайт и найти контакт для оффера: ${issue.title}`;
  return "Открыть карту, найти телефон/сайт и предложить стартовый сайт";
}

function createLeadPitch(business, report, issue, offer, clientOpportunity) {
  const location = [business.city, business.country].filter(Boolean).join(", ");
  const host = report?.host || (business.website ? new URL(business.website).hostname : "your business");
  if (!business.website) {
    return `Hi ${business.name}, I found your ${business.niche || "local service"} business in ${location}. I could not find a clear website, so mobile customers may leave before calling. I can build a simple booking-ready page with map, phone and request form for about $${offer.price}. Want me to send a quick mockup?`;
  }
  return `Hi ${business.name}, I checked ${host}. The fastest revenue leak I found is: ${issue.title}. For a ${business.niche || "local"} business this can easily mean around $${clientOpportunity}/mo in missed demand. I can fix it as a small ${offer.name} for about $${offer.price}, no full redesign needed. Want me to send the exact 3 fixes?`;
}

function createLeadNextSteps(business, issue, offer) {
  return [
    business.website ? "Открыть сайт и проверить контакт владельца" : "Открыть карту и найти телефон/сайт",
    `Предложить ${offer.name}: ${issue.title}`,
    "Скопировать питч, отправить вручную, отметить статус в CRM",
    "Через 48 часов отправить короткий follow-up"
  ];
}

function createLeadEvidence(business, report, issue) {
  const items = [
    business.website ? "Сайт найден" : "Сайт не найден в OSM",
    business.phone ? "Есть телефон" : "Телефон не найден",
    business.email ? "Есть email" : "Email не найден",
    issue.reason
  ];
  if (report?.score?.total) items.push(`Аудит сайта: ${report.score.total}/100`);
  if (report?.money?.monthlyOpportunity) items.push(`Оценка утечки: $${Math.round(report.money.monthlyOpportunity)}/мес`);
  return items.filter(Boolean);
}

function summarizeMoneyPipeline(leads) {
  const hot = leads.filter((lead) => lead.priority === "hot");
  const warm = leads.filter((lead) => lead.priority === "warm");
  const oneTimeValue = leads.reduce((sum, lead) => sum + Number(lead.estimatedDealValue || 0), 0);
  const monthlyValue = leads.reduce((sum, lead) => sum + Number(lead.recurringValue || 0), 0);
  const clientOpportunity = leads.reduce((sum, lead) => sum + Number(lead.clientOpportunity || 0), 0);

  return {
    totalLeads: leads.length,
    hot: hot.length,
    warm: warm.length,
    oneTimeValue,
    monthlyValue,
    clientOpportunity,
    topOffer: leads[0]?.serviceOffer?.name || "",
    nextBestAction: leads[0]?.recommendedAction || "Запустить поиск лидов"
  };
}

function roundToNearest(value, step) {
  return Math.round(Number(value || 0) / step) * step;
}

function nicheToOverpassFilters(niche) {
  const key = String(niche || "").toLowerCase();
  if (/dent|стомат|зуб/.test(key)) return ['["amenity"="dentist"]'];
  if (/doctor|clinic|medical|врач|клиник|медиц/.test(key)) return ['["amenity"="clinic"]', '["amenity"="doctors"]', '["healthcare"]'];
  if (/vet|animal|вет/.test(key)) return ['["amenity"="veterinary"]'];
  if (/plumb|сантех/.test(key)) return ['["craft"="plumber"]', '["shop"="bathroom_furnishing"]'];
  if (/electric|электр/.test(key)) return ['["craft"="electrician"]'];
  if (/hvac|air condition|heating|кондиционер|отоплен/.test(key)) return ['["craft"="hvac"]', '["shop"="air_conditioning"]'];
  if (/clean|уборк|клининг/.test(key)) return ['["craft"="cleaning"]', '["shop"="dry_cleaning"]', '["shop"="laundry"]'];
  if (/lock|ключ|замк/.test(key)) return ['["craft"="locksmith"]', '["shop"="locksmith"]'];
  if (/roof|крыш|кров/.test(key)) return ['["craft"="roofer"]'];
  if (/garden|landscap|ландшафт|сад/.test(key)) return ['["craft"="gardener"]', '["shop"="garden_centre"]'];
  if (/salon|hair|beauty|barber|салон|парик/.test(key)) return ['["shop"="hairdresser"]', '["shop"="beauty"]'];
  if (/spa|massage|массаж/.test(key)) return ['["shop"="massage"]', '["leisure"="spa"]'];
  if (/law|legal|юрист|адвокат/.test(key)) return ['["office"="lawyer"]'];
  if (/account|tax|bookkeep|бухгалтер|налог/.test(key)) return ['["office"="accountant"]'];
  if (/restaurant|food|cafe|ресторан|кафе/.test(key)) return ['["amenity"="restaurant"]', '["amenity"="cafe"]'];
  if (/gym|fitness|спорт/.test(key)) return ['["leisure"="fitness_centre"]', '["sport"]'];
  if (/real estate|realtor|недвиж/.test(key)) return ['["office"="estate_agent"]'];
  if (/auto|car|garage|авто/.test(key)) return ['["shop"="car_repair"]', '["amenity"="vehicle_inspection"]'];
  if (/hotel|hostel|travel|отель|гостин/.test(key)) return ['["tourism"="hotel"]', '["tourism"="hostel"]'];
  if (/photo|wedding|event|свад|фото/.test(key)) return ['["craft"="photographer"]', '["shop"="bridal"]'];
  if (/child|daycare|kindergarten|детск|садик/.test(key)) return ['["amenity"="kindergarten"]', '["social_facility"="childcare"]'];
  return ['["shop"]', '["office"]', '["craft"]'];
}

function normalizeBusinessWebsite(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const candidates = raw
    .split(/[;|\s]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => !/^mailto:|^tel:/i.test(item));
  try {
    return normalizeUrl(candidates[0] || raw);
  } catch {
    try {
      return normalizeUrl(candidates.find((item) => /\./.test(item)) || "");
    } catch {
      return "";
    }
  }
}

function businessNicheFit(tags, niche) {
  const haystack = `${tags.amenity || ""} ${tags.shop || ""} ${tags.office || ""} ${tags.craft || ""} ${tags.leisure || ""} ${tags.tourism || ""} ${tags.healthcare || ""} ${tags.social_facility || ""} ${tags.name || ""}`.toLowerCase();
  return String(niche || "")
    .toLowerCase()
    .split(/\s+/)
    .filter((token) => token.length > 2)
    .some((token) => haystack.includes(token))
    ? 28
    : 12;
}

function compactTags(tags) {
  const allowed = ["amenity", "shop", "office", "craft", "leisure", "sport", "tourism", "healthcare", "social_facility", "brand"];
  return Object.fromEntries(allowed.filter((key) => tags[key]).map((key) => [key, tags[key]]));
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 12000, retries = 1) {
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } catch (error) {
      lastError = error;
      const transient = error?.name !== "AbortError" && /fetch failed|network|socket|econn/i.test(error?.message || "");
      if (!transient || attempt === retries) throw error;
      await delay(550 * (attempt + 1));
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError || new Error("fetch failed");
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const WORLD_LOCATIONS = [
  { label: "New York, USA", city: "New York", country: "United States", lat: 40.7128, lon: -74.006 },
  { label: "Los Angeles, USA", city: "Los Angeles", country: "United States", lat: 34.0522, lon: -118.2437 },
  { label: "Chicago, USA", city: "Chicago", country: "United States", lat: 41.8781, lon: -87.6298 },
  { label: "Miami, USA", city: "Miami", country: "United States", lat: 25.7617, lon: -80.1918 },
  { label: "London, United Kingdom", city: "London", country: "United Kingdom", lat: 51.5074, lon: -0.1278 },
  { label: "Manchester, United Kingdom", city: "Manchester", country: "United Kingdom", lat: 53.4808, lon: -2.2426 },
  { label: "Toronto, Canada", city: "Toronto", country: "Canada", lat: 43.6532, lon: -79.3832 },
  { label: "Vancouver, Canada", city: "Vancouver", country: "Canada", lat: 49.2827, lon: -123.1207 },
  { label: "Sydney, Australia", city: "Sydney", country: "Australia", lat: -33.8688, lon: 151.2093 },
  { label: "Melbourne, Australia", city: "Melbourne", country: "Australia", lat: -37.8136, lon: 144.9631 },
  { label: "Dubai, UAE", city: "Dubai", country: "United Arab Emirates", lat: 25.2048, lon: 55.2708 },
  { label: "Doha, Qatar", city: "Doha", country: "Qatar", lat: 25.2854, lon: 51.531 },
  { label: "Singapore", city: "Singapore", country: "Singapore", lat: 1.3521, lon: 103.8198 },
  { label: "Hong Kong", city: "Hong Kong", country: "Hong Kong", lat: 22.3193, lon: 114.1694 },
  { label: "Tokyo, Japan", city: "Tokyo", country: "Japan", lat: 35.6762, lon: 139.6503 },
  { label: "Seoul, South Korea", city: "Seoul", country: "South Korea", lat: 37.5665, lon: 126.978 },
  { label: "Bangkok, Thailand", city: "Bangkok", country: "Thailand", lat: 13.7563, lon: 100.5018 },
  { label: "Kuala Lumpur, Malaysia", city: "Kuala Lumpur", country: "Malaysia", lat: 3.139, lon: 101.6869 },
  { label: "Madrid, Spain", city: "Madrid", country: "Spain", lat: 40.4168, lon: -3.7038 },
  { label: "Barcelona, Spain", city: "Barcelona", country: "Spain", lat: 41.3874, lon: 2.1686 },
  { label: "Berlin, Germany", city: "Berlin", country: "Germany", lat: 52.52, lon: 13.405 },
  { label: "Munich, Germany", city: "Munich", country: "Germany", lat: 48.1351, lon: 11.582 },
  { label: "Paris, France", city: "Paris", country: "France", lat: 48.8566, lon: 2.3522 },
  { label: "Amsterdam, Netherlands", city: "Amsterdam", country: "Netherlands", lat: 52.3676, lon: 4.9041 },
  { label: "Milan, Italy", city: "Milan", country: "Italy", lat: 45.4642, lon: 9.19 },
  { label: "Zurich, Switzerland", city: "Zurich", country: "Switzerland", lat: 47.3769, lon: 8.5417 },
  { label: "Stockholm, Sweden", city: "Stockholm", country: "Sweden", lat: 59.3293, lon: 18.0686 },
  { label: "Warsaw, Poland", city: "Warsaw", country: "Poland", lat: 52.2297, lon: 21.0122 },
  { label: "Prague, Czechia", city: "Prague", country: "Czechia", lat: 50.0755, lon: 14.4378 },
  { label: "Lisbon, Portugal", city: "Lisbon", country: "Portugal", lat: 38.7223, lon: -9.1393 },
  { label: "Vienna, Austria", city: "Vienna", country: "Austria", lat: 48.2082, lon: 16.3738 },
  { label: "Mexico City, Mexico", city: "Mexico City", country: "Mexico", lat: 19.4326, lon: -99.1332 },
  { label: "Sao Paulo, Brazil", city: "Sao Paulo", country: "Brazil", lat: -23.5558, lon: -46.6396 },
  { label: "Buenos Aires, Argentina", city: "Buenos Aires", country: "Argentina", lat: -34.6037, lon: -58.3816 },
  { label: "Bogota, Colombia", city: "Bogota", country: "Colombia", lat: 4.711, lon: -74.0721 },
  { label: "Santiago, Chile", city: "Santiago", country: "Chile", lat: -33.4489, lon: -70.6693 },
  { label: "Johannesburg, South Africa", city: "Johannesburg", country: "South Africa", lat: -26.2041, lon: 28.0473 },
  { label: "Cape Town, South Africa", city: "Cape Town", country: "South Africa", lat: -33.9249, lon: 18.4241 },
  { label: "Nairobi, Kenya", city: "Nairobi", country: "Kenya", lat: -1.2921, lon: 36.8219 },
  { label: "Istanbul, Turkiye", city: "Istanbul", country: "Turkiye", lat: 41.0082, lon: 28.9784 },
  { label: "Tel Aviv, Israel", city: "Tel Aviv", country: "Israel", lat: 32.0853, lon: 34.7818 },
  { label: "Mumbai, India", city: "Mumbai", country: "India", lat: 19.076, lon: 72.8777 },
  { label: "Bengaluru, India", city: "Bengaluru", country: "India", lat: 12.9716, lon: 77.5946 }
];

async function readReports() {
  try {
    const raw = await fs.readFile(REPORTS_PATH, "utf8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function rememberReport(report) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const reports = await readReports();
  const next = [report, ...reports.filter((item) => item.id !== report.id)].slice(0, 50);
  await fs.writeFile(REPORTS_PATH, JSON.stringify(next, null, 2));
}

function readableFetchError(error) {
  if (error?.name === "AbortError") return "Сайт не ответил за 12 секунд.";
  return error?.message || "Сайт недоступен для server-side fetch.";
}

const CTA_WORDS = ["call", "contact", "quote", "estimate", "book", "schedule", "заявк", "позвон"];
const CTA_REGEXP = /call|contact|quote|estimate|book|schedule|reserve|buy|order|заявк|позвон|запис/i;

function countTerms(text, terms) {
  return terms.reduce((sum, term) => sum + (text.includes(term) ? 1 : 0), 0);
}
