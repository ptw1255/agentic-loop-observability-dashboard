import fs from "node:fs/promises";
import path from "node:path";
import { webkit } from "playwright";

const baseUrl = process.env.DASHBOARD_URL ?? "http://127.0.0.1:4174";
const outputDir = path.resolve("docs/snapshots");

await fs.mkdir(outputDir, { recursive: true });

const browser = await webkit.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1100 },
  deviceScaleFactor: 1
});
const page = await context.newPage();

await page.goto(baseUrl, { waitUntil: "networkidle" });
await page.locator('[data-role="output-list"] .output-card').first().waitFor();
await page.screenshot({
  path: path.join(outputDir, "inbox-webkit.png"),
  fullPage: false
});

await page.getByRole("button", { name: "Run traced demo" }).click();
await page.getByText("Execution outline", { exact: true }).waitFor();
await page.waitForTimeout(1500);
const observabilityPanel = page.getByRole("heading", { name: "Execution observability" }).locator("..");
await observabilityPanel.screenshot({
  path: path.join(outputDir, "loop-detail-webkit.png")
});

await browser.close();

console.log(`Captured WebKit product snapshots in ${outputDir}`);
