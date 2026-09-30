// 가장 좁은 폰부터 태블릿까지 모든 탭에서 화면이 옆으로 넘치지 않는다
import assert from "node:assert/strict";
import { withPage } from "../lib.mjs";

export default async () => {
  for (const width of [320, 360, 390, 820, 1180])
    await withPage(
      async ({ page }) => {
        for (const view of ["home", "search", "add", "alerts", "settings"]) {
          await page.click(`[data-nav=${view}]`);
          if (view === "home") {
            await page.click("[data-space]:has-text('주방')");
            await page.click("[data-space]:has-text('식품')"); // 경로가 가장 긴 곳
          }
          const sw = await page.evaluate(() => document.documentElement.scrollWidth);
          assert.ok(sw <= width, `${width}px ${view}: scrollWidth ${sw}`);
        }
      },
      { width, height: 800 },
    );
};
