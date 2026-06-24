import fs from "node:fs/promises";
import path from "node:path";
import { APP_VERSION } from "../src/lib/auditEngine.js";

const distDir = path.join(process.cwd(), "dist");
const indexPath = path.join(distDir, "index.html");
const markerPath = path.join(process.cwd(), "DEPLOYMENT_MARKER.txt");
const expectedDeployMarker = `GITHUB_ROOT_UPLOAD_${APP_VERSION}`;
const expectedMarkers = [
  APP_VERSION,
  "Глобальный поиск",
  "Найти бизнесы",
  "Найденные бизнесы автопилотом",
  "Сохраненные лиды",
  "CSV лиды",
  "USA money",
  "Money Machine",
  "Запустить money machine",
  "Горячие лиды",
  "Lead Workbench",
  "Фоновый режим",
  "Скан продолжается",
  "Последний скан",
  "Серверный job",
  "сайт проверен",
  "Owner email",
  "Проверить сайт",
  "TXT pack",
  "Google поиск",
  "Daily Send Queue",
  "Gmail drafts ready",
  "Email QA",
  "Close Kit",
  "Reply Assistant",
  "Gmail draft",
  "Daily plan",
  "Profit Cockpit",
  "Today Operator Plan",
  "profit score",
  "Deal Automation Ladder",
  "Profit sprint",
  "Email Operator",
  "Parse plan",
  "Recipients & status",
  "Bot/API pack",
  "Follow-up timeline"
];

const indexHtml = await fs.readFile(indexPath, "utf8");
const assetPaths = Array.from(indexHtml.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g))
  .map((match) => match[1])
  .filter((assetPath) => assetPath.startsWith("/assets/"));

let bundleText = indexHtml;
for (const assetPath of assetPaths) {
  const filePath = path.join(distDir, assetPath.replace(/^\//, ""));
  bundleText += "\n" + (await fs.readFile(filePath, "utf8"));
}

const missing = expectedMarkers.filter((marker) => !bundleText.includes(marker));
if (missing.length) {
  throw new Error(`Build is stale. Missing frontend markers: ${missing.join(", ")}`);
}

const deployMarker = await fs.readFile(markerPath, "utf8");
if (!deployMarker.includes(expectedDeployMarker)) {
  throw new Error(`Deployment marker is missing or stale. Expected ${expectedDeployMarker}`);
}

console.log("Frontend build markers verified:", expectedMarkers.join(", "));
console.log("Deployment marker verified:", expectedDeployMarker);
