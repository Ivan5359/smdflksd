import { buildReport, createDemoReport } from "../src/lib/auditEngine.js";

const demo = createDemoReport();
assert(demo.score.total > 0, "demo score should be positive");
assert(demo.priorities.length > 0, "demo should include priorities");
assert(demo.outreach.email.includes("demo-plumbing.example"), "demo outreach should mention host");
assert(demo.package.tiers.length === 3, "demo should include three sellable tiers");

const fallback = buildReport(
  {
    url: "https://example.com",
    niche: "dentist",
    city: "Miami",
    averageSale: 300,
    monthlyVisitors: 500,
    mode: "fast"
  },
  {
    finalUrl: "https://example.com",
    host: "example.com",
    status: 200,
    isHttps: true,
    hasViewport: true,
    ctaCount: 0,
    forms: 0,
    hasPhone: false,
    hasEmail: false,
    h1: [],
    evidence: []
  }
);

assert(fallback.priorities.some((item) => item.key === "contact"), "missing contact should become a priority");
console.log("Smoke test passed:", {
  version: demo.appVersion,
  demoScore: demo.score.total,
  fallbackScore: fallback.score.total
});

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
