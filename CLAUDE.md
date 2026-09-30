# CLAUDE.md

가족용 집 재고 앱(PWA). 폰·태블릿 우선. 사용자(저장소 주인)는 이 프로젝트로 구조를 **배우는 중**이므로 설계 이유를 문서에 남긴다.

## 구조

- `frontend/` 빌드 없는 HTML/CSS/JS. API 주소는 `config.js`의 `API_BASE`(비우면 같은 주소 `/api`). 서비스워커 `sw.js`는 푸시만 처리.
- `backend/` FastAPI. DB의 유일한 주인. 스키마는 Alembic(`backend/migrations/`), 시작 시 `migrate.py`가 적용.
- `ml/` 예측 전용 FastAPI. **DB에 접근하지 않는다.** api가 `POST /forecast`로 화면당 한 번 묶어 호출(`X-Internal-Token`), 실패하면 `unavailable`로 대체.
- `docker-compose.yml` web(nginx, 8080만 공개) → api → ml. 설계와 계약: `docs/ARCHITECTURE.md` ‘서버 분리’.

## 명령

```bash
python3.12 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
.venv/bin/pytest -q                                   # 백엔드·ML·마이그레이션 테스트
uvicorn backend.main:app --reload                     # API+화면 :8000
uvicorn ml.main:app --port 8001 --reload              # 예측 서버
cd e2e && npm ci && bash stack.sh up && CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" npm test; bash stack.sh down
```

## 작업 규칙

- 브랜치를 만들어 작업하고, **기능 단위로 커밋**한다. 커밋마다 `docs/CHANGELOG.md` 맨 위 절에 무엇을·왜·어떻게 검증했는지 한국어로 적는다(사용자 요청).
- 커밋 메시지는 영어 conventional commit(`feat(ui): …`), 본문에 이유.
- 최소 구현을 선호한다: 표준 라이브러리·브라우저 기본 기능 먼저, 새 의존성은 이유를 CHANGELOG에 적는다.
- UI 문구는 한국어. 동적 이름 뒤에 조사(을/를)를 붙이지 말고 `완료 · {이름}` 형식.
- 완료라고 말하기 전에: `pytest -q`, 화면 변경은 E2E, 그리고 **push 후 GitHub Actions 결과를 확인**한다(`gh` 없음 → `curl https://api.github.com/repos/Nine1ll/home-digital-twin/actions/runs?branch=<브랜치>`). 로컬 통과만 보고 보고했다가 CI가 계속 깨져 있던 적이 있다.
- 사용자 저장소의 `.env`, 8080 포트, git stash를 건드리지 않는다. 컨테이너 검증은 `e2e/stack.sh`(twin-e2e, 18080)로.

## 사용자 결정이 필요한 것

- 인증·보안을 약하게 만드는 변경(토큰 수명, 저장 위치, 푸시 도메인 허용 목록, 권한 검사)은 명시적 승인 후에만.
- 사용자 이메일 등 개인정보를 외부 서비스로 보내는 설정값(예: `VAPID_SUBJECT`)에 넣지 않는다.
- 새 기능보다 실사용 검증이 우선이라는 합의가 있다(`docs/GO_LIVE.md` 8장). 요청 없이 기능을 늘리지 않는다.

## 함정 (실제로 겪음)

- 스키마 변경: 모델만 바꾸면 운영 DB에 반영 안 됨 → `alembic revision --autogenerate -m "…"` 후 파일을 읽어 확인. 빠뜨리면 `tests/test_migrations.py`가 실패한다.
- 복원: `docker compose cp`로 DB 파일을 덮어쓰면 소유자가 바뀌어 쓰기 500. `python -m backend.backup --restore <파일>`만 쓴다.
- E2E: 같은 문구 토스트를 연달아 기다리면 이전 토스트로 통과한다 → 항상 `lib.mjs`의 `toast()`(확인 후 비움)를 쓴다. 테스트는 앞 테스트가 바꾼 데이터 위에서도 통과하게 상대값으로 확인.
- E2E 브라우저: Playwright 기본 headless shell은 알림 권한을 줘도 `denied` → `channel: "chromium"`(lib.mjs). CI 실패 이유는 `::error` 주석으로 남으니 `check-runs/<job>/annotations` API로 읽는다.
- CSS: 1열 그리드는 `minmax(0, 1fr)`(auto면 패널이 넘친다). 320px까지 `e2e/tests/08-no-overflow.mjs`로 확인. 모달 위 알림은 `popover`여야 보인다.
- 셸: zsh는 따옴표 없는 `$VAR`를 단어로 나누지 않는다(`$C stop ml` → 127).
- `node --check frontend/app.js`는 로컬 Node 22.2에서 ES 모듈 인식 실패 → `node --input-type=module --check < frontend/app.js`.
- ML 계약(`/forecast` 요청·응답)을 바꾸면 api·ml을 함께 배포해야 한다. 필드는 추가만 하면 호환된다.

## 문서 지도

`README.md` 실행 · `docs/ARCHITECTURE.md` 설계 이유 · `docs/LEARNING.md` 실습 · `docs/DEPLOYMENT.md` 운영(백업·푸시·compose) · `docs/GO_LIVE.md` 주인이 할 일 · `docs/CHANGELOG.md` 작업 로그
