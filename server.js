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
const DIST_DIR = path.join(__dirname, "dist");

const app = express();
app.use(express.json({ limit: "1mb" }));

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

app.get("/api/reports", async (_request, response) => {
  response.json(await readReports());
});

app.use(express.static(DIST_DIR));
app.use(express.static(path.join(__dirname, "public")));
app.get(/.*/, async (_request, response, next) => {
  try {
    await fs.access(path.join(DIST_DIR, "index.html"));
    response.sendFile(path.join(DIST_DIR, "index.html"));
  } catch {
    next();
  }
});

app.listen(PORT, () => {
  console.log(`SiteMoney Audit ${APP_VERSION} running on http://127.0.0.1:${PORT}`);
});

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
