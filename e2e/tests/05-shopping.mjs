// 장보기: 체크 유지, 목록 보내기, '샀어요' → 등록하면 목록에서 빠짐.
// 같은 서버에서 여러 번 돌려도 되도록 그때 목록에 있는 상품을 쓴다
import assert from "node:assert/strict";
import { withPage, toast } from "../lib.mjs";

export default () =>
  withPage(async ({ page }) => {
    await page.click("[data-nav=alerts]");
    const names = () => page.$$eval(".shop-row strong", (s) => s.map((x) => x.textContent));
    const list = await names();
    assert.ok(list.length >= 2, `장보기 목록에 2개 이상 필요: ${list}`);
    const [buy, check] = [list[0], list.at(-1)];

    await page.click(`.shop-row:has-text('${check}') .check`);
    await page.reload();
    await page.waitForSelector("[data-nav]");
    await page.click("[data-nav=alerts]");
    assert.equal(await page.$eval(`.shop-row:has-text('${check}') input`, (c) => c.checked), true, "새로고침 뒤에도 체크 유지");

    await page.evaluate(() => (navigator.share = async (d) => (window.__shared = d.text)));
    await page.click("#share-list");
    assert.match(await page.evaluate(() => window.__shared), /^장보기 목록\n- /);

    await page.click(`.shop-row:has-text('${buy}') [data-bought]`);
    await page.waitForSelector("#item-form");
    assert.equal(await page.$eval("input[name=name]", (i) => i.value), buy);
    assert.ok(await page.$eval("input[name=product_id]", (i) => i.value), "기존 상품으로 연결");
    await page.selectOption("select[name=location_id]", { index: 1 });
    await page.fill("input[name=quantity]", "50");
    await page.click("#item-form button[type=submit]");
    await toast(page, "등록 완료");
    await page.click("[data-nav=alerts]");
    assert.ok(!(await names()).includes(buy), `등록하면 목록에서 빠짐: ${buy}`);
    return `${buy} 구매 처리`;
  });
