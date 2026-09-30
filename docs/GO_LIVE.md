# 실제로 올리기: 직접 할 일 체크리스트

위에서부터 순서대로 하세요. 명령어의 `/path/to/app`은 서버에 저장소를 둔 경로로 바꿉니다.

## 1. PR 합치기 (GitHub, 10분)

브랜치가 쌓여 있으므로 **순서대로** 합칩니다. 세 브랜치 모두 CI 통과 상태입니다.

1. `mobile-ux` → `main` PR을 만들고 합칩니다.
2. `home-builder` → `main` PR을 만들고 합칩니다.
3. `split-services` → `main` PR을 만들고 합칩니다.

PR 본문은 `docs/CHANGELOG.md`의 해당 절을 붙여 넣으면 됩니다. 합친 뒤 로컬에서 `git checkout main && git pull`.

## 2. 서버 준비 (30분)

항상 켜 둘 기기 하나(미니PC, 안 쓰는 노트북, NAS 등). 메모리 1GB 이상이면 충분합니다.

```bash
# Docker 설치(Ubuntu 예시). macOS는 Docker Desktop
curl -fsSL https://get.docker.com | sh
git clone https://github.com/Nine1ll/home-digital-twin.git /path/to/app
cd /path/to/app
cp .env.example .env
mkdir -p backups
```

`.env`를 열어 아래를 채웁니다. 무작위 값은 `python3 -c "import secrets; print(secrets.token_urlsafe(48))"`로 **각각 따로** 만드세요.

```dotenv
APP_ENV=production
SECRET_KEY=<무작위 값 1>
ML_TOKEN=<무작위 값 2>
```

```bash
docker compose up -d --build
docker compose ps            # web, api, ml 세 개가 Up
curl localhost:8080/api/health   # {"status":"ok"}
```

## 3. 인터넷에 안전하게 열기: Cloudflare Tunnel + Access (1시간)

앱에는 로그인 시도 횟수 제한이 없으므로 **Access로 가족 이메일만 들어오게** 막습니다. 포트를 열 필요가 없고 HTTPS도 자동입니다. Cloudflare에 연결된 도메인이 하나 필요합니다(연 1~2만 원).

1. **Tunnel**: Cloudflare 대시보드 → Zero Trust → Networks → Tunnels → Create a tunnel(Cloudflared)
   - 안내에 나오는 설치 명령을 서버에서 실행합니다.
   - Public hostname: `twin.내도메인` → Service `HTTP`, `localhost:8080`
2. **Access**: Zero Trust → Access → Applications → Add an application → Self-hosted
   - Domain: `twin.내도메인`
   - Session duration: **1 month** (짧으면 가족이 자주 이메일 인증을 다시 해야 함)
   - Policy: Action `Allow`, Include → `Emails` → 가족 이메일들
   - 로그인 방식: One-time PIN(이메일로 받는 6자리 코드)이면 추가 설정이 필요 없습니다.
3. 확인: 시크릿 창에서 `https://twin.내도메인` → Cloudflare 인증 화면이 먼저 나오면 성공. 목록에 없는 이메일은 들어오지 못해야 합니다.

## 4. 예약 작업: 백업과 아침 알림 (15분)

```bash
crontab -e
```

```cron
# 매일 새벽 3시 백업(최근 7개 보관). 시간은 서버 시간대 기준
0 3 * * * cd /path/to/app && docker compose exec -T api python -m backend.backup
# 매일 아침 9시 푸시(5단계를 마친 뒤)
0 9 * * * cd /path/to/app && docker compose exec -T api python -m backend.push
```

- `date`로 서버 시간대를 확인하세요. UTC라면 한국 9시는 `0 0 * * *`, 3시는 `0 18 * * *`입니다.
- `backups/` 폴더를 NAS·외장 디스크·클라우드로 한 번 더 복사하세요. 같은 디스크에만 있으면 디스크 고장 때 함께 잃습니다.
- 다음 날 `ls backups/`로 파일이 생겼는지 꼭 확인하세요.

## 5. 푸시 알림 키 (10분, 선택)

```bash
docker compose exec -T api python -m backend.push --keys
```

출력된 두 줄로 `.env`의 **빈** `VAPID_PRIVATE_KEY=`, `VAPID_PUBLIC_KEY=` 줄을 바꿉니다(끝에 덧붙이면 중복). `VAPID_SUBJECT`에는 `mailto:본인이메일`. 그다음 `docker compose up -d`로 반영합니다.

## 6. 가족 폰에 설치 (가족당 5분)

1. 아이폰은 **사파리**, 안드로이드는 **크롬**으로 `https://twin.내도메인` 접속 → Cloudflare 이메일 인증
2. 첫 사람: 가입 → 설정 → ‘초대 코드 보내기’로 가족에게 전달
3. 다른 가족: 가입 화면에서 초대 코드 입력
4. 홈 화면에 추가
   - 아이폰: 공유 버튼 → 홈 화면에 추가
   - 안드로이드: 메뉴 → 앱 설치(또는 홈 화면에 추가)
5. **홈 화면 아이콘으로 연 앱에서** 설정 → 유통기한 알림 → 알림 켜기 → 테스트 알림 보내기

## 7. 실제 기기에서 확인할 것 (제가 검증하지 못한 부분)

- [ ] 아이폰 홈 화면 앱에서 테스트 푸시가 도착한다 (iOS 16.4 이상)
- [ ] 안드로이드에서 테스트 푸시가 도착하고, 누르면 알림 화면이 열린다
- [ ] 배치도 ‘배치’에서 손가락으로 끌어 공간 그리기·모서리로 크기 조절이 된다
- [ ] 안드로이드 크롬에서 바코드 스캔이 된다 (아이폰 사파리는 스캔 버튼이 숨겨지고 번호 입력만)
- [ ] 앱을 완전히 닫았다 열어도 로그인이 유지된다
- [ ] 다크 모드 폰에서 글자가 잘 보인다

문제가 있으면 화면 캡처와 기기·OS 버전을 남겨 두세요.

## 8. 2~4주 써 보기

기능을 더 만들기 전에 가족이 실제로 쓰는지 봅니다. 이것만 메모하세요.

- 등록을 **건너뛴** 순간과 이유 (귀찮았다, 위치를 몰랐다, 폰이 멀었다…)
- 찾기로 **못 찾은** 물건
- 알림이 **쓸모없었던** 날과 **있었으면 좋았을** 날
- 예측이 틀렸던 상품 (기록을 빠뜨렸는지, 모델이 틀렸는지)

이 메모가 다음 개발의 우선순위가 됩니다.

## 비상시

| 상황 | 할 일 |
|---|---|
| 폰 분실 | `.env`의 `SECRET_KEY`를 새 값으로 → `docker compose up -d` (모든 기기 로그아웃). Access에서 해당 이메일 세션도 취소 |
| 데이터를 잘못 지움 | `docs/DEPLOYMENT.md`의 ‘백업과 복원’ (`--restore`, 복원 전 상태는 자동 보관) |
| 예측만 안 보임 | `docker compose ps`, `docker compose logs ml` → `docker compose restart ml` |
| 앱 전체가 안 열림 | `docker compose ps` → `docker compose logs api` → `docker compose up -d` |
| 코드 업데이트 | `git pull && docker compose up -d --build` (스키마 변경은 시작 때 자동 적용, 그 전에 백업) |
