import fs from "node:fs/promises";
import path from "node:path";
import { APP_VERSION } from "../src/lib/auditEngine.js";

const distDir = path.join(process.cwd(), "dist");
const indexPath = path.join(distDir, "index.html");
const expectedMarkers = [
  APP_VERSION,
  "Глобальный поиск",
  "Найти бизнесы",
  "Найденные бизнесы автопилотом"
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

console.log("Frontend build markers verified:", expectedMarkers.join(", "));
