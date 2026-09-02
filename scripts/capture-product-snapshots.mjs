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
await page.locator('[data-role="output-list"] .output-row__link').first().waitFor();
await page.screenshot({
  path: path.join(outputDir, "inbox-webkit.png"),
  fullPage: false
});

await page.getByText("Execution evidence", { exact: true }).click();
await page.getByRole("button", { name: "Run traced demo" }).click();
await page.waitForTimeout(2500);
await page.getByText("Execution evidence", { exact: true }).click();
await page.getByText("Observed execution", { exact: true }).waitFor();
await page.getByRole("button", { name: "Refresh observability" }).click();
await page.waitForTimeout(1200);
await page.getByText("Execution evidence", { exact: true }).click();
await page.getByText("Observed execution", { exact: true }).waitFor();
const observabilityPanel = page.getByRole("heading", { name: "Execution observability" }).locator("..");
await observabilityPanel.screenshot({
  path: path.join(outputDir, "loop-detail-webkit.png")
});

const commandCenter = await context.newPage();
await commandCenter.goto(`${baseUrl}/loop-execution.html?window=24h`, { waitUntil: "networkidle" });
await commandCenter.locator('[data-role="execution-content"] .execution-kpis').waitFor();
await commandCenter.screenshot({
  path: path.join(outputDir, "loop-command-center-webkit.png"),
  fullPage: false
});
await commandCenter.getByRole("link", { name: "Last hour" }).click();
await commandCenter.locator('[data-role="execution-content"] .execution-kpis').waitFor();
await commandCenter.getByRole("button", { name: /Needs attention/ }).click();
await commandCenter.getByRole("heading", { name: "Runs" }).waitFor();

const accounting = await context.newPage();
await accounting.goto(`${baseUrl}/time-accounting.html?window=all`, { waitUntil: "networkidle" });
await accounting.locator('[data-role="accounting-content"] .accounting-kpis').waitFor();
await accounting.screenshot({
  path: path.join(outputDir, "time-accounting-webkit.png"),
  fullPage: true
});

await browser.close();

console.log(`Captured WebKit product snapshots in ${outputDir}`);
