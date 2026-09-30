// E2E 공통 도우미. 실제 브라우저로 폰 화면(390×844)을 열어 사용자처럼 조작한다.
import assert from "node:assert/strict";
import { chromium } from "playwright";

export const WEB = process.env.WEB || "http://localhost:18080/";
export const DEMO = { email: "demo@example.com", password: "demo12345" };

// 페이지를 열고 fn을 실행한다. 페이지 JS 에러가 하나라도 나면 실패, 브라우저는 항상 닫는다
export async function withPage(fn, { width = 390, height = 844, login = true, context = {}, setup } = {}) {
  // 로컬은 CHROME_PATH(설치된 Chrome), CI는 playwright가 받은 Chromium
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
  try {
    const ctx = await browser.newContext({
      viewport: { width, height },
      hasTouch: true,
      isMobile: width < 700,
      ...context,
    });
    if (setup) await setup(ctx);
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(WEB);
    if (login) await signIn(page);
    const note = await fn({ page, ctx });
    assert.deepEqual(errors, [], "페이지 JS 에러");
    return note;
  } finally {
    await browser.close();
  }
}

export async function signIn(page, { email, password } = DEMO) {
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", password);
  await page.click("#auth-form button[type=submit]");
  await page.waitForSelector("[data-nav]");
}

// 토스트 문구를 기다린 뒤 비운다. 같은 문구를 연달아 기다려도 이전 토스트로 통과하지 않게
export const toast = (page, text) =>
  page.waitForFunction((t) => {
    const el = document.querySelector("#toast");
    if (!el.textContent.includes(t)) return false;
    el.textContent = "";
    return true;
  }, text);

export async function search(page, query) {
  await page.click("[data-nav=search]");
  await page.fill("#query", query);
}

// 찾기 결과에서 이름이 정확히 같은 첫 행의 수량
export const qty = (page, name) =>
  page.$eval(
    "#search-results",
    (el, n) =>
      Number(
        [...el.querySelectorAll(".item")]
          .find((r) => r.querySelector(".name").textContent === n)
          ?.querySelector(".qty").firstChild.textContent,
      ),
    name,
  );

// 로그인된 페이지의 토큰으로 API를 직접 확인한다
export async function api(page, path, init = {}) {
  const token = await page.evaluate(() => localStorage.getItem("twin_token"));
  const r = await fetch(new URL("/api" + path, WEB), {
    ...init,
    headers: { Authorization: "Bearer " + token, ...init.headers },
  });
  return { status: r.status, body: await r.json().catch(() => null) };
}

// 배치도의 격자 좌표(0~20) → 화면 좌표
export async function grid(page) {
  const m = await page.$eval("#map", (el) => el.getBoundingClientRect().toJSON());
  return (gx, gy) => [m.x + (gx / 20) * m.width, m.y + (gy / 20) * m.height];
}

export async function drag(page, from, to) {
  await page.mouse.move(...from);
  await page.mouse.down();
  await page.mouse.move(...to, { steps: 8 });
  await page.mouse.up();
}
