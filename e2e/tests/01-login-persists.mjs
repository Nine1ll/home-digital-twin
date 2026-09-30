// 앱을 닫았다 열어도 로그인이 유지되고, 로그아웃하면 지워진다
import assert from "node:assert/strict";
import { withPage, WEB } from "../lib.mjs";

export default () =>
  withPage(async ({ page, ctx }) => {
    await page.close();
    let again = await ctx.newPage();
    await again.goto(WEB);
    await again.waitForSelector("[data-nav], #auth-form");
    assert.ok(await again.$("[data-nav]"), "다시 열어도 로그인 유지");
    await again.click("[data-nav=settings]");
    await again.click("#logout");
    await again.waitForSelector("#auth-form");
    await again.close();
    again = await ctx.newPage();
    await again.goto(WEB);
    await again.waitForSelector("[data-nav], #auth-form");
    assert.ok(await again.$("#auth-form"), "로그아웃 후엔 로그인 화면");
  });
