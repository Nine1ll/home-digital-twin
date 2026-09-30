// '사용' 토스트의 되돌리기와 활동 기록(기기 시간대)
import assert from "node:assert/strict";
import { withPage, search, qty, toast } from "../lib.mjs";

export default () =>
  withPage(async ({ page }) => {
    await search(page, "커피");
    const before = await qty(page, "커피");
    await page.click("#search-results .use");
    await page.click("[data-step='1']");
    await page.click("#action-form button[type=submit]");
    await page.waitForSelector("#toast .toast-action");
    await search(page, "커피");
    assert.equal(await qty(page, "커피"), before - 2);
    await page.click("#toast .toast-action");
    await toast(page, "되돌렸어요");
    await search(page, "커피");
    assert.equal(await qty(page, "커피"), before, "되돌리면 수량 복구");

    await page.click("[data-nav=settings]");
    await page.waitForSelector("#activities .card-row");
    const first = await page.$eval("#activities .card-row", (r) => r.textContent);
    assert.match(first, /되돌리기/);
    assert.doesNotMatch(first, /UTC/);
    assert.match(first, /오[전후] \d+:\d\d/, "기기 시간대로 표시");
  });
