# 우리집 · Home Digital Twin

실제 집의 **방 → 가구 → 수납 칸**과 물건을 연결하는 가정용 디지털 트윈의 참고 구현입니다. 사용자가 직접 배우며 만드는 [원본 프로젝트](https://github.com/Nine1ll/home-inventory)와 비교할 수 있도록 원본 소스를 `reference/original/`에 보존했습니다.

공간을 만들고 배치한 뒤 물건을 등록합니다. 검색 결과에서 보관 위치로 이동하고, 소비·폐기·이동·실사 결과를 기록하면 재고와 활동 이력이 함께 갱신됩니다. 유통기한과 상품별 총 재고, 기록 기반 소비 예측으로 구매 안내를 확인할 수 있습니다.

## 빠른 실행

최근 사용자 피드백으로 잔량 관리, 집 프리셋, 공간 복제·일괄 생성, 표시 이름, 운영자용 로그와 바코드 실패 흐름을 추가했습니다. [변경 내용·사용법·학습 순서](docs/FEEDBACK.md)를 먼저 읽어 보세요.

Python 3.12 기준입니다. Node 빌드 없이 FastAPI가 프론트 파일도 함께 제공합니다.

```bash
python -m venv .venv
source .venv/bin/activate
# Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn backend.main:app --reload
```

브라우저에서 `http://localhost:8000`을 열고 가입합니다. API 문서는 `http://localhost:8000/docs`입니다. 개발 환경에서 비밀키를 설정하지 않으면 서버 재시작 시 재로그인이 필요합니다. `.env`를 사용할 때는 아래처럼 실행하세요.

```bash
cp .env.example .env
# .env의 SECRET_KEY에 아래 명령으로 만든 값을 입력
python -c "import secrets; print(secrets.token_urlsafe(48))"
uvicorn backend.main:app --reload --env-file .env
```

**이 앱은 새 `twin.db`를 사용합니다. 원본 `home_inventory.db`와 스키마가 다르며 자동 이관하지 않습니다.** 기존 Render 백엔드·Netlify 배포를 수정하지 않습니다.

## 먼저 해 볼 순서

1. 가입 → 우리집에서 ‘주방’을 추가합니다. 위치 (0, 0), 크기 (10, 9)로 시작하세요.
2. 주방 안에 ‘냉장고’, 냉장고 안에 ‘두 번째 칸’을 만듭니다.
3. 해당 칸에서 ‘여기에 물건 넣기’로 우유 3개와 유통기한을 등록합니다.
4. 물건 찾기에서 우유 검색 → 위치 보기로 보관 공간에 진입합니다.
5. 우유의 소비 관리를 ‘대략적인 잔량’으로 설정하고 개봉·한 컵 사용·잔량·다 씀을 기록합니다. 활동 기록은 운영자용 CLI에서만 조회합니다.
6. 알림에서 유통기한과 구매 기준을 확인합니다. 기록이 적으면 예측을 꾸며내지 않습니다.

## 현재 구현 범위

| 기능 | 구현과 제약 |
|---|---|
| 공간 트윈 | 계층형 2D 배치도, 위치·크기 편집, 드래그 저장, 공간 탐색. 사진으로 집을 자동 복원하거나 3D 스캔하는 기능은 아님 |
| 재고 | 상품/위치/유통기한별 합산, 부분 이동, 소비, 폐기, 실제 수량 정정 |
| 이력 | 이름·이동 당시 경로의 스냅샷 보존. 재고가 0이어도 삭제하지 않음 |
| 가족 | 가입 시 초대 코드로 같은 집에 합류, 코드 회전. 모든 가족은 동일 권한. 기존 계정의 집 전환은 미지원 |
| 바코드 | 지원 브라우저의 BarcodeDetector로 카메라 인식. 미지원 시 수동 번호 조회. 가구 상품 사전 → Open Food Facts 순서로 조회 |
| 위치 추천 | 해당 상품의 등록·이동 횟수 상위 3곳. 학습 모델이 아닌 설명 가능한 빈도 기준 |
| 사진 | **별도 Ollama 비전 모델 연결 필요**. 사진 인식 결과는 이름/날짜 후보이며 사용자가 확인 후 저장 |
| 소비 예측 ML | 7일·3개 소비일 미만은 데이터 부족. 평균 기준선과 Ridge를 시간순 검증해 선택 |
| 알림 | 앱 내 유통기한/구매 안내. 앱을 열거나 새로고침할 때 갱신. 닫힌 앱의 푸시·문자·메일 발송은 미구현 |
| 인증 | bcrypt, JWT 24시간, 가구 범위 검사. 운영 환경 비밀키 필수 |

BarcodeDetector는 브라우저에 따라 지원 범위가 다르고 카메라는 HTTPS 또는 localhost가 필요합니다. 실제 카메라/외부 상품 조회/실제 비전 모델은 이 작업 환경에서 통합 검증하지 않았습니다. 네트워크 실패 시 수동 등록으로 진행할 수 있습니다. 바코드나 사진만으로 정확한 유통기한을 보장하지 않습니다.

## 사진 인식 연결

백엔드가 접근 가능한 로컬 또는 사설망 Ollama 서버에 비전 모델을 준비합니다.

```bash
ollama pull qwen2.5vl:7b
```

`.env`에 아래 값을 설정하고 `--env-file .env`로 앱을 실행합니다.

```dotenv
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=qwen2.5vl:7b
```

사진은 사용자가 ‘사진 인식’을 누를 때만 전송합니다. 최대 5MB/2천만 화소이며, 1280px 이내 JPEG로 변환하여 메타데이터를 제거합니다. 앱은 원본 사진을 저장하지 않습니다. Ollama 서버를 인터넷에 공개하지 말고 백엔드와 연결되는 사설 경로를 사용하세요. Render 백엔드에서 개인 PC의 localhost에 접속할 수는 없습니다. 모델 구동에 필요한 메모리와 장치는 별도로 준비해야 합니다.

## 예시 데이터

빈 집을 채우기 전에 공간/알림 동작을 살펴보려면 별도 예시 계정을 만듭니다. 비밀번호는 프롬프트로 입력하며 소스에 저장하지 않습니다.

```bash
python -m backend.seed --email demo@example.com
```

집 이름에 ‘합성 예시’가 표시됩니다. 4개 방, 4개 가구, 6개 상품, 60일의 합성 이력이 생성되며 이미 존재하는 이메일은 덮어쓰지 않습니다. **이 데이터의 예측 결과는 실제 모델 성능 근거가 아닙니다.**

## 구조와 학습 자료

- `backend/models.py`: 데이터 구조
- `backend/inventory.py`: 소유권·수량 변경·활동 이력
- `backend/main.py`: API와 요청 처리
- `backend/intelligence.py`: 위치 추천과 예측
- `backend/recognition.py`: 외부 사진 인식 어댑터
- `frontend/api.js`: 통신과 시간 제한
- `frontend/app.js`: 공간·검색·등록·알림·설정 화면
- `frontend/styles.css`: 모바일/데스크톱 스타일
- [설계 설명](docs/ARCHITECTURE.md)
- [기능별 학습 순서](docs/LEARNING.md)
- [배포와 운영 범위](docs/DEPLOYMENT.md)
- [검증 결과](docs/VALIDATION.md)

## 테스트

```bash
pip install -r requirements-dev.txt
pytest -q
node --check frontend/app.js
node --check frontend/api.js
```

테스트는 별도 메모리 SQLite를 사용합니다. 기존 원본 테스트는 자동 수집하지 않습니다.

## 외부 자료와 라이선스

프로젝트 코드는 MIT입니다. 원본 저작권 고지는 `LICENSE`와 원본 폴더에 보존했습니다.

- [Open Food Facts API](https://openfoodfacts.github.io/openfoodfacts-server/api/ref-cheatsheet/): 상품명 조회. UI에 출처 표시. 대량 저장/재배포 시 데이터베이스 라이선스를 별도로 확인하세요.
- [Ollama Vision](https://docs.ollama.com/capabilities/vision), [Structured outputs](https://docs.ollama.com/capabilities/structured-outputs): 사진으로 이름과 날짜 후보 생성. 선택 모델의 라이선스는 프로젝트 MIT와 별개입니다.
