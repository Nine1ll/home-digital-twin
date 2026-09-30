// 물건 한 줄의 전체 흐름: 사용(스테퍼) → 옮기기 → 위치 보기 → 시트 바깥 탭 → 새로 등록
import assert from "node:assert/strict";
import { withPage, search, qty, toast } from "../lib.mjs";

export default () =>
  withPage(async ({ page }) => {
    await search(page, "계란");
    const before = await qty(page, "계란");
    await page.click("#search-results .use");
    await page.click("[data-step='1']");
    await page.click("#action-form button[type=submit]");
    await toast(page, "기록 완료");
    await search(page, "계란");
    assert.equal(await qty(page, "계란"), before - 2, "사용 2개 반영");

    await page.click("#search-results .item-main");
    await page.click("[data-sheet=move]");
    await page.selectOption("select[name=destination_id]", { index: 1 });
    await page.click("#action-form button[type=submit]");
    await toast(page, "이동 기록 완료");
    await search(page, "계란");
    assert.ok((await page.$$("#search-results .item")).length >= 2, "옮기면 두 위치로 나뉨");

    await page.click("#search-results .item-main");
    await page.click("[data-sheet=find]");
    await page.waitForSelector(".space.found");

    await page.click("#view .item-main");
    await page.mouse.click(195, 40);
    assert.equal(await page.$eval("#dialog", (d) => d.open), false, "바깥 탭으로 시트 닫힘");

    const name = `E2E ${Date.now()}`;
    await page.click("[data-nav=add]");
    await page.fill("input[name=name]", name);
    await page.selectOption("select[name=location_id]", { index: 1 });
    await page.click("[data-step='1']");
    await page.click("[data-step='1']");
    await page.click("#item-form button[type=submit]");
    await toast(page, "등록 완료");
    await search(page, name);
    assert.equal(await qty(page, name), 3, "스테퍼로 3개 등록");
  });
