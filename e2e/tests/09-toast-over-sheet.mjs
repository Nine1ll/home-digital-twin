// 시트가 열린 채 난 오류도 토스트로 보인다(모달 위 최상위 레이어)
import assert from "node:assert/strict";
import { withPage, toast } from "../lib.mjs";

export default () =>
  withPage(async ({ page }) => {
    await page.click("[data-space]:has-text('주방')");
    await page.click("#space-settings");
    await page.click("#delete-space");
    await page.click("#confirm-delete");
    await toast(page, "삭제할 수 없");
    assert.equal(await page.$eval("#dialog", (d) => d.open), true);
    assert.equal(await page.$eval("#toast", (t) => t.matches(":popover-open")), true, "시트 위 토스트");
  });
