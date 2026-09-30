// ML 서버가 죽어도 앱은 동작하고 예측만 '예측 일시 중단', 다시 켜면 복구
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { withPage, toast } from "../lib.mjs";

const compose = process.env.E2E_COMPOSE ?? "docker compose -p twin-e2e --env-file e2e/.env.e2e";
const root = fileURLToPath(new URL("../..", import.meta.url));
const ml = (cmd) => execSync(`${compose} ${cmd} ml`, { cwd: root, stdio: "ignore" });

export default () => {
  if (!compose) return "건너뜀: E2E_COMPOSE가 비어 있음(compose 밖에서 실행)";
  return withPage(async ({ page }) => {
    const badges = async () => {
      await page.click("[data-nav=alerts]");
      await page.click("#refresh-alerts");
      await toast(page, "최신");
      return page.$$eval(".card-row .badge:not(.warn)", (b) => [...new Set(b.map((x) => x.textContent))]);
    };
    assert.ok((await badges()).includes("평균 소비량"), "ML 정상");
    ml("stop");
    try {
      const down = await badges();
      assert.deepEqual(down, ["예측 일시 중단"], `ML 꺼지면 예측만 중단: ${down}`);
      assert.ok((await page.$$(".shop-row")).length > 0, "장보기는 계속 동작");
    } finally {
      ml("start");
    }
    for (let i = 0; i < 20 && !(await badges()).includes("평균 소비량"); i++) await page.waitForTimeout(500);
    assert.ok((await badges()).includes("평균 소비량"), "ML 다시 켜면 복구");
  });
};
