// 새 계정: 빠른 시작으로 방 4개 → 냉장고 → 좌우 3칸 나누기
import assert from "node:assert/strict";
import { withPage, toast, api } from "../lib.mjs";

export default () =>
  withPage(
    async ({ page }) => {
      await page.click("#switch-auth");
      await page.fill("input[name=email]", `new${Date.now()}@example.com`);
      await page.fill("input[name=password]", "newpass1234");
      await page.click("#auth-form button[type=submit]");
      await page.waitForSelector("#starter-go");
      await page.click("label.choice:has-text('욕실')");
      await page.click("#starter-go");
      await page.waitForFunction(() => document.querySelectorAll("[data-space]").length === 4);
      const rooms = (await api(page, "/locations")).body.map((l) => [l.name, l.x, l.y, l.width, l.height]);
      assert.deepEqual(rooms, [["주방", 0, 0, 10, 10], ["거실", 10, 0, 10, 10], ["침실", 0, 10, 10, 10], ["욕실", 10, 10, 10, 10]]);

      await page.click("[data-space]:has-text('주방')");
      await page.click("#new-space");
      await page.fill("input[name=name]", "냉장고");
      await page.click("#location-form button[type=submit]");
      await toast(page, "공간을 저장");
      await page.click("[data-space]:has-text('냉장고')");
      await page.click("#space-settings");
      await page.click("#split-space");
      await page.click("#split-form [data-step='-1']");
      await page.click("label.choice:has-text('좌우로')");
      await page.click("#split-form button[type=submit]");
      await page.waitForFunction(() => document.querySelectorAll("[data-space]").length === 3);
      const all = (await api(page, "/locations")).body;
      const fridge = all.find((l) => l.name === "냉장고");
      const kids = all.filter((l) => l.parent_id === fridge.id);
      assert.deepEqual(kids.map((l) => [l.name, l.x, l.width]), [["칸 1", 0, 6.7], ["칸 2", 6.7, 6.6], ["칸 3", 13.3, 6.7]]);
      await page.click("#space-settings");
      assert.equal(await page.$("#split-space"), null, "이미 나눈 가구엔 칸 나누기 없음");
    },
    { login: false },
  );
