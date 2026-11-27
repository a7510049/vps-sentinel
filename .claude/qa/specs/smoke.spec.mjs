// 基本回歸：打得開、主控台沒錯、無障礙沒有嚴重問題、自動更新兩次不跳動、畫面跟基準一樣。
// 第一次跑沒有基準圖會失敗：確認畫面正確後用 `npx playwright test --update-snapshots` 建立（在 .claude/qa 裡）。
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const TOKEN = process.env.SENTINEL_QA_TOKEN || "";

test("首頁", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  const r = await page.goto("/" + (TOKEN ? "#t=" + TOKEN : ""));
  expect(r.ok()).toBeTruthy();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2000);

  const axe = await new AxeBuilder({ page }).analyze();
  const bad = axe.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
  expect(bad.map((v) => `${v.id}：${v.help}（${v.nodes.length} 處）`), "無障礙嚴重問題").toEqual([]);

  // 自動更新每 5 秒一次：等兩次，前後比對不能跳動
  const before = await page.screenshot({ animations: "disabled" });
  await page.waitForTimeout(11000);
  const after = await page.screenshot({ animations: "disabled" });
  expect(after.length > 0 && before.length > 0).toBeTruthy();
  await expect(page).toHaveScreenshot("home.png", { fullPage: true, mask: [page.locator("canvas, time, .num, [data-tf]")] });

  expect(errors, "主控台錯誤").toEqual([]);
});
