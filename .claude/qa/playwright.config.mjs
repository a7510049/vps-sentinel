// 開發用瀏覽器測試：電腦三種引擎＋iPhone（WebKit）＋安卓（Chromium）。
// 由 gate.py browser 呼叫（它會先開測試用哨兵、設好 SENTINEL_QA_URL／SENTINEL_QA_TOKEN）。
import { defineConfig, devices } from "@playwright/test";

const desk = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };
export default defineConfig({
  testDir: "./specs",
  outputDir: "./test-results/run",
  snapshotPathTemplate: "./visual/{projectName}/{arg}{ext}",
  timeout: 90_000,
  retries: 0,
  workers: 2,
  reporter: [["list"]],
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: "disabled" } },
  use: {
    baseURL: process.env.SENTINEL_QA_URL,
    trace: "off",
    launchOptions: { args: [] },
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"], ...desk, launchOptions: { executablePath: process.env.SENTINEL_QA_CHROME || "/opt/pw-browsers/chromium", args: ["--no-sandbox"] } } },
    { name: "desktop-firefox", use: { ...devices["Desktop Firefox"], ...desk } },
    { name: "desktop-webkit", use: { ...devices["Desktop Safari"], ...desk } },
    { name: "iphone-webkit", use: { ...devices["iPhone 15"] } },
    { name: "android-chromium", use: { ...devices["Pixel 7"], launchOptions: { executablePath: process.env.SENTINEL_QA_CHROME || "/opt/pw-browsers/chromium", args: ["--no-sandbox"] } } },
  ],
});
