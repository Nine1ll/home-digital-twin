#!/usr/bin/env bash
# E2E용 세 서버(web·api·ml)를 띄우고 데모 데이터를 넣는다.
# 운영용 .env와 8080 포트는 건드리지 않는다: e2e/.env.e2e, 포트 18080, 프로젝트 twin-e2e.
#   bash e2e/stack.sh up     # 빌드 + 실행 + 데모 계정
#   bash e2e/stack.sh down   # 컨테이너·볼륨·테스트 설정 삭제
set -euo pipefail
cd "$(dirname "$0")/.."
export COMPOSE_PROJECT_NAME=twin-e2e WEB_PORT=18080 ENV_FILE=e2e/.env.e2e
compose() { docker compose --env-file "$ENV_FILE" "$@"; }
rand() { python3 -c "import secrets; print(secrets.token_urlsafe(48))"; }

case "${1:-up}" in
  up)
    printf 'APP_ENV=production\nSECRET_KEY=%s\nML_TOKEN=%s\nVAPID_SUBJECT=mailto:e2e@example.com\n' "$(rand)" "$(rand)" > "$ENV_FILE"
    compose build
    compose run --rm --no-deps -T api python -m backend.push --keys >> "$ENV_FILE"
    mkdir -p backups
    compose up -d
    for _ in $(seq 60); do curl -fs "http://localhost:$WEB_PORT/api/health" >/dev/null && break; sleep 1; done
    echo demo12345 | compose exec -T api python -m backend.seed --email demo@example.com
    echo "준비 완료: http://localhost:$WEB_PORT"
    ;;
  down)
    compose down -v --remove-orphans
    rm -f "$ENV_FILE"
    ;;
  logs)
    compose logs --no-color
    ;;
esac
