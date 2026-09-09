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

## Docker

```bash
docker build -t home-digital-twin .
docker run --rm -p 8000:8000 --env-file .env -v twin-data:/data home-digital-twin
```

Docker 기본 DB는 `/data/twin.db`입니다. `.env`에 `DATABASE_URL=sqlite:///./twin.db`가 있으면 이 기본값을 덮어쓰므로 Docker에서는 `sqlite:////data/twin.db`로 바꾸세요. 이미지에는 앱과 프론트만 포함하고 테스트용 계정/데이터를 포함하지 않습니다. 컨테이너 구동 자체는 이 작업 환경에서 검증하지 않았습니다.

## 운영 전 남은 범위

개인/가족용 참고 MVP입니다. 인터넷 공개 운영 전에는 다음 범위를 실제 배포 환경에서 확인하세요.

- 로그인/가입/사진 인식의 요청 제한은 인프라 계층에 구성해야 합니다. 현재 앱에는 분산 rate limiter가 없습니다.
- 계정 복구·이메일 확인·탈퇴·가족 권한 구분·토큰 폐기는 구현하지 않았습니다. 초대 코드는 접근 권한을 부여하므로 가족에게만 전달합니다.
- 브라우저 저장 JWT는 세션 단위이며 XSS에 대한 HttpOnly cookie 보호를 제공하지 않습니다. 앱은 출력 이스케이프를 적용하지만 인증 저장 방식 전환을 검토할 수 있습니다.
- v1은 `create_all`로 초기 스키마를 생성합니다. 운영 데이터가 생긴 뒤 스키마 변경은 Alembic 등의 마이그레이션과 백업 절차를 먼저 마련하세요.
- SQLite 테스트만 수행했습니다. PostgreSQL 환경의 실제 동시 요청과 연결 풀은 별도로 확인해야 합니다.
- 활동 기록은 애플리케이션에서 수정 API를 제공하지 않는 방식입니다. DB 권한/보관 정책/백업까지 강제된 감사 시스템이 아닙니다.
- 사진 인식은 최대 5MB이며 EXIF를 재인코딩으로 제거합니다. 외부 모델 서버의 로그/보관 정책은 해당 서버 운영자가 확인해야 합니다.
- 식품 외 상품의 외부 카탈로그, 3D 스캔, 백그라운드 푸시는 후속 범위입니다.
