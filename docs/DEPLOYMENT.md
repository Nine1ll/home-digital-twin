# 실행과 배포

## 현재 제공 방식

한 FastAPI 서버가 API와 프론트를 함께 제공합니다. 기존 Netlify/Render 서비스는 그대로 두고 별도 서비스로 배포합니다. 이 작업에서 실제 배포는 수행하지 않았습니다.

## Render

`render.yaml`을 참고해 새 Web Service를 만듭니다. 빌드 명령은 `pip install -r requirements.txt`, 시작 명령은 `uvicorn backend.main:app --host 0.0.0.0 --port $PORT`입니다.

환경변수:

- `APP_ENV=production`
- `SECRET_KEY`: 32자 이상의 충분히 무작위인 값. Blueprint는 생성 설정을 포함합니다.
- `DATABASE_URL`: 지속되는 PostgreSQL DB. 예: `postgresql+psycopg://user:password@host/database`.
- `OLLAMA_URL`, `OLLAMA_MODEL`: 선택. 백엔드가 실제 접근 가능한 비전 모델 서버만 연결합니다.

DB 비밀번호는 Git에 넣지 않습니다. Render의 임시 로컬 디스크에 SQLite 파일을 두면 재배포 시 없어질 수 있으므로 영속 PostgreSQL 또는 명시적으로 구성한 영속 볼륨을 사용하세요. 설정 파일만 제공하며 리소스를 생성하거나 요금을 발생시키는 배포를 자동 수행하지 않습니다.

## 세 서버로 실행 (Docker Compose, 집 서버 추천)

화면(web, nginx) → API(api) → 예측(ml)을 한 대에서 따로 띄웁니다. 구조 설명은 [서버 분리](ARCHITECTURE.md#서버-분리).

```bash
cp .env.example .env
# .env: APP_ENV=production, SECRET_KEY와 ML_TOKEN에 각각 무작위 값
python -c "import secrets; print(secrets.token_urlsafe(48))"
docker compose up -d --build
# http://localhost:8080  (HTTPS는 앞단에 Cloudflare Tunnel 등을 둔다)
```

- 밖으로 열리는 포트는 web(8080) 하나입니다. api와 ml은 compose 내부망에서만 보입니다.
- `docker compose stop ml`로 장애를 흉내 내면 예측만 ‘예측 일시 중단’이 되고 나머지는 동작합니다.
- 화면만 Cloudflare Pages·Netlify 같은 정적 호스팅에 올릴 수도 있습니다. 이때는 배포 시 `frontend/config.js`를 `export const API_BASE = "https://API주소";`로 덮어쓰고, API의 `CORS_ORIGINS`에 화면 주소를 넣습니다.

## Docker (한 서버)

```bash
docker build -t home-digital-twin .
docker run -d --name home-digital-twin --restart unless-stopped -p 8000:8000 --env-file .env -v twin-data:/data home-digital-twin
```

Docker 기본 DB는 `/data/twin.db`입니다. `.env`에 `DATABASE_URL=sqlite:///./twin.db`가 있으면 이 기본값을 덮어쓰므로 Docker에서는 `sqlite:////data/twin.db`로 바꾸세요. 이미지에는 앱과 프론트만 포함하고 테스트용 계정/데이터를 포함하지 않습니다. 컨테이너 구동 자체는 이 작업 환경에서 검증하지 않았습니다.

## 백업과 복원

SQLite DB를 매일 `./backups`(호스트 폴더)에 날짜별로 저장하고 최근 7개를 보관합니다. DB와 같은 디스크에만 두면 디스크 고장 때 함께 잃으므로, 이 폴더를 NAS·클라우드 드라이브로 한 번 더 옮기세요.

```bash
mkdir -p backups                      # compose 실행 전에 한 번 (컨테이너가 쓸 수 있게)
docker compose exec -T api python -m backend.backup            # 지금 백업
docker compose exec -T api python -m backend.backup --keep 30  # 30개 보관
```

cron 예시(매일 새벽 3시, 서버 시간대 기준):

```bash
0 3 * * * cd /path/to/app && docker compose exec -T api python -m backend.backup
```

복원(가족에게 잠시 쓰지 말라고 알린 뒤):

```bash
ls backups/                                        # 되돌릴 파일 고르기
docker compose stop api
docker compose run --rm -T api python -m backend.backup --restore twin-20260930-030000.db
docker compose start api
```

- 복원 직전 DB는 `backups/pre-restore-…db`로 자동 저장됩니다. 잘못 복원했으면 그 파일로 다시 복원하세요.
- **`docker compose cp`로 DB 파일을 직접 덮어쓰지 마세요.** 파일 소유자가 바뀌어 앱이 읽기만 되고 쓰기는 500 에러가 납니다. `--restore`는 파일을 바꾸지 않고 내용만 옮깁니다.
- 파일 이름의 시각은 컨테이너 시간(UTC)입니다.
- PostgreSQL을 쓰면 이 도구 대신 `pg_dump`/`pg_restore`를 쓰세요.

## 유통기한 푸시 알림

매일 아침 가구별로 “유통기한 임박 · 장보기” 요약을 알림을 켠 기기에 보냅니다. 알릴 것이 없는 날은 보내지 않습니다.

1. 키를 한 번 만들어 `.env`(또는 Render 환경변수)에 넣습니다. **키를 바꾸면 모든 기기가 알림을 다시 켜야 합니다.**
   ```bash
   python -m backend.push --keys
   ```
   `VAPID_SUBJECT`에는 푸시 서비스가 문제 시 연락할 `mailto:` 주소를 넣으세요.
2. 앱을 HTTPS로 엽니다(푸시·서비스워커는 HTTPS 또는 localhost에서만 동작). 설정 → 유통기한 알림 → 알림 켜기 → 테스트 알림 보내기로 확인합니다.
   - 아이폰·아이패드(iOS 16.4+): 사파리 공유 → 홈 화면에 추가한 앱에서만 켤 수 있습니다.
3. 발송을 예약합니다. 서버 시간대 기준이니 한국 시간 오전 9시는 서버가 UTC면 `0 0 * * *`입니다.
   ```bash
   # 집 서버(Docker): 호스트 crontab
   0 9 * * * cd /path/to/app && docker compose exec -T api python -m backend.push
   # 한 서버 Docker(아래)라면: docker exec home-digital-twin python -m backend.push
   # 직접 실행
   0 9 * * * cd /path/to/app && .venv/bin/python -m backend.push
   ```
   Render는 `render.yaml`로 API와 비공개 예측 서버(pserv, 유료 인스턴스가 필요할 수 있음)를 만듭니다. 같은 저장소로 Cron Job을 만들고 명령을 `python -m backend.push`, 환경변수는 웹 서비스와 같게 둡니다.

보안: 서버가 구독 주소로 직접 요청을 보내므로, 알려진 푸시 서비스(FCM, Mozilla, Apple, Windows) 주소만 받습니다. 만료된 구독(404/410)은 발송 중 자동 삭제되고, 로그아웃하면 그 기기의 구독도 해지됩니다.

## 운영 전 남은 범위

개인/가족용 참고 MVP입니다. 인터넷 공개 운영 전에는 다음 범위를 실제 배포 환경에서 확인하세요.

- 로그인/가입/사진 인식의 요청 제한은 인프라 계층에 구성해야 합니다. 현재 앱에는 분산 rate limiter가 없습니다.
- 계정 복구·이메일 확인·탈퇴·가족 권한 구분·토큰 폐기는 구현하지 않았습니다. 초대 코드는 접근 권한을 부여하므로 가족에게만 전달합니다.
- 로그인 유지를 위해 30일 JWT를 브라우저 `localStorage`에 저장합니다. 토큰 폐기 목록이 없으므로 **폰을 잃어버리면 `SECRET_KEY`를 새 값으로 바꾸고 재시작**해 모든 기기를 로그아웃시키세요(가족 모두 다시 로그인). HttpOnly cookie가 아니어서 XSS에 대한 추가 보호는 없습니다. 앱은 출력 이스케이프를 적용합니다.
- DB 스키마는 Alembic 마이그레이션으로 관리하며 앱 시작 때 자동 적용됩니다. 스키마를 바꾸는 배포 전에는 백업을 먼저 하세요(`LEARNING.md` 8장).
- SQLite 테스트만 수행했습니다. PostgreSQL 환경의 실제 동시 요청과 연결 풀은 별도로 확인해야 합니다.
- 활동 기록은 애플리케이션에서 수정 API를 제공하지 않는 방식입니다. DB 권한/보관 정책/백업까지 강제된 감사 시스템이 아닙니다.
- 사진 인식은 최대 5MB이며 EXIF를 재인코딩으로 제거합니다. 외부 모델 서버의 로그/보관 정책은 해당 서버 운영자가 확인해야 합니다.
- 식품 외 상품의 외부 카탈로그, 3D 스캔은 후속 범위입니다.
