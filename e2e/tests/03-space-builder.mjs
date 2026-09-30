// 공간 만들기: 종류 자동·빈자리 배치, 배치도에서 그리기·크기 조절·이동·탭
import assert from "node:assert/strict";
import { withPage, toast, api, grid, drag } from "../lib.mjs";

export default () =>
  withPage(async ({ page }) => {
    await page.click("[data-space]:has-text('주방')");
    await page.click("#new-space");
    assert.equal(await page.$eval("select[name=kind]", (s) => s.value), "furniture", "방 안은 가구");
    assert.equal(await page.evaluate(() => document.activeElement.name), "name", "이름 칸에 바로 커서");
    await page.fill("input[name=name]", "식탁");
    await page.click("#location-form button[type=submit]");
    await toast(page, "공간을 저장");
    const rects = await page.$$eval("[data-space]", (bs) => bs.map((b) => b.getBoundingClientRect().toJSON()));
    for (const [i, a] of rects.entries())
      for (const b of rects.slice(i + 1))
        assert.ok(a.right - 1 <= b.left || b.right - 1 <= a.left || a.bottom - 1 <= b.top || b.bottom - 1 <= a.top, "겹치지 않게 배치");

    await page.click("[data-space]:has-text('식탁')");
    await page.click("#new-space");
    assert.equal(await page.$eval("select[name=kind]", (s) => s.value), "storage", "가구 안은 수납 칸");
    await page.click("#close-dialog");

    await page.click("[data-parent]:has-text('주방')");
    await page.click("#edit-map");
    const at = await grid(page);
    const name = `오븐${Date.now() % 100000}`;
    await drag(page, at(12.3, 14.3), at(17.6, 19.6));
    await page.waitForSelector("#location-form");
    const drawn = await page.$eval("#location-form", (f) => ["x", "y", "width", "height"].map((k) => Number(f.elements[k].value)));
    assert.deepEqual(drawn, [12, 14, 6, 6], "그린 사각형이 칸 단위로 맞춰짐");
    await page.fill("input[name=name]", name);
    await page.click("#location-form button[type=submit]");
    await toast(page, "공간을 저장");
    const find = async () => (await api(page, "/locations")).body.find((l) => l.name === name);
    const { id } = await find();

    const h = await page.$eval(`[data-space="${id}"] .handle`, (el) => {
      const r = el.getBoundingClientRect();
      return [r.x + r.width / 2, r.y + r.height / 2];
    });
    const [ox, oy] = at(0, 0), [cx, cy] = at(1, 1), cell = [cx - ox, cy - oy];
    await drag(page, h, [h[0] - 2 * cell[0], h[1] - 1.5 * cell[1]]);
    await toast(page, "크기를 저장");
    let l = await find();
    assert.deepEqual([l.x, l.y, l.width, l.height], [12, 14, 4, 4.5], "모서리로 크기 조절");

    await drag(page, at(13, 15), at(14, 13));
    await toast(page, "위치를 저장");
    l = await find();
    assert.deepEqual([l.x, l.y, l.width, l.height], [13, 12, 4, 4.5], "끌어서 이동");

    await page.mouse.click(...at(15, 14));
    await page.waitForSelector("#location-form");
    assert.equal(await page.$eval("input[name=name]", (i) => i.value), name, "탭하면 설정");
  });
