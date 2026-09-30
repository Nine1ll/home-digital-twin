// 푸시 설정 화면: 켜기 → 서버 저장 → 끄기, 로그아웃 시 해지, 알림 클릭 이동.
// 헤드리스 브라우저는 실제 푸시 서비스에 연결할 수 없어 PushManager만 흉내 낸다(외부 요청 없음)
import assert from "node:assert/strict";
import { withPage, api, WEB } from "../lib.mjs";

export default () =>
  withPage(
    async ({ page }) => {
      if (!(await api(page, "/me")).body.push_enabled) return "건너뜀: 서버에 VAPID 키 없음";
      await page.goto(new URL("/#alerts", WEB).href);
      await page.reload();
      await page.waitForSelector("[data-nav]");
      assert.equal(await page.$eval("[aria-current=page]", (b) => b.dataset.nav), "alerts", "#alerts로 열면 알림 화면");

      await page.click("[data-nav=settings]");
      await page.click("#push-on");
      await page.waitForSelector("#push-off");
      await page.click("[data-nav=home]");
      await page.evaluate(() => navigator.serviceWorker.dispatchEvent(new MessageEvent("message", { data: { view: "alerts" } })));
      assert.equal(await page.$eval("[aria-current=page]", (b) => b.dataset.nav), "alerts", "알림 클릭 → 알림 화면");

      await page.click("[data-nav=settings]");
      await page.click("#push-off");
      await page.waitForSelector("#push-on");
      await page.click("#push-on");
      await page.waitForSelector("#push-off");
      const token = await page.evaluate(() => localStorage.getItem("twin_token"));
      await page.click("#logout");
      await page.waitForSelector("#auth-form");
      const r = await fetch(new URL("/api/push/test", WEB), { method: "POST", headers: { Authorization: "Bearer " + token } });
      assert.equal(r.status, 409, "로그아웃하면 이 기기 구독 해지");
    },
    {
      width: 390,
      context: { isMobile: false },
      setup: async (ctx) => {
        await ctx.grantPermissions(["notifications"], { origin: new URL(WEB).origin });
        await ctx.addInitScript(() => {
          let current = null;
          const fake = {
            endpoint: "https://fcm.googleapis.com/fcm/send/e2e-fake",
            toJSON() {
              return { endpoint: this.endpoint, keys: { p256dh: "p", auth: "a" } };
            },
            async unsubscribe() {
              current = null;
              return true;
            },
          };
          PushManager.prototype.subscribe = async () => (current = fake);
          PushManager.prototype.getSubscription = async () => current;
        });
      },
    },
  );
