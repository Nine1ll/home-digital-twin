// tests/를 이름 순서대로 실행한다(앞 테스트가 만든 데이터를 뒤에서 쓰지 않도록 각자 상대값으로 확인).
//   npm test            전부
//   npm test -- undo    이름에 undo가 들어간 것만
import { readdirSync } from "node:fs";

process.env.ENV_FILE ??= "e2e/.env.e2e";
const only = process.argv[2];
const files = readdirSync(new URL("./tests", import.meta.url))
  .filter((f) => f.endsWith(".mjs") && (!only || f.includes(only)))
  .sort();
let failed = 0;
for (const f of files) {
  const start = Date.now();
  try {
    const { default: test } = await import(`./tests/${f}`);
    const note = await test();
    console.log(`✓ ${f} (${Date.now() - start}ms)${note ? ` · ${note}` : ""}`);
  } catch (e) {
    failed++;
    console.log(`✗ ${f}\n    ${String(e.stack || e).split("\n").slice(0, 6).join("\n    ")}`);
  }
}
console.log(failed ? `\n${failed}/${files.length}개 실패` : `\n${files.length}개 모두 통과`);
process.exit(failed ? 1 : 0);
