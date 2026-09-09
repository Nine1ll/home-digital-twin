# 검증 결과

2026-09-09, Python 3.12의 별도 가상환경에서 실행했습니다.

## 수행 결과

- `pytest -q`: **16 passed**, 2 deprecation warnings.
- `node --check frontend/app.js`: 통과.
- `node --check frontend/api.js`: 통과.
- FastAPI TestClient에서 정적 홈과 JavaScript 반환 확인.
- Python 코드는 Ruff format, 프론트는 Prettier로 정리했습니다.

## 검증한 시나리오

1. 인증 없는 요청 차단, 가족 초대 가입, 초대 코드 회전 후 기존 구성원 유지.
2. 다른 가구의 재고 조회·소비·위치 수정·위치 추천 접근 차단.
3. 유통기한 없는 동일 배치 병합과 다른 유통기한 분리.
4. 부분 이동 시 총수량 보존, 출발/도착 경로 이력.
5. 초과 소비·잘못된 이동 실패 시 재고/로그가 바뀌지 않음.
6. 폐기·수량 정정, 빈 재고와 이력 보존.
7. 공간 순환/영역 초과 방지, 공간 이름 변경 후 과거 경로 보존.
8. 상품별 총 재고 합산과 만료 재고 제외, 구매 기준 변경.
9. 가구 상품 사전의 바코드 조회.
10. 이미지가 아닌 파일 거부, 모델 미설정 상태 응답.
11. 비전 모델 HTTP 응답을 mock하여 후보 반환과 확인 플래그 검증.
12. 관측 부족, 폐기/오늘 소비 제외, 평균 기준선 및 시간순 ML 선택.
13. 오래된 version을 가진 두 번째 작성자의 재고 덮어쓰기 거부.

## 확인하지 않은 범위

브라우저 렌더링/모바일 터치/실제 카메라 장치, 실제 Open Food Facts 응답, 실제 Ollama 비전 모델, PostgreSQL 실서버, Docker 이미지 실행, Render 배포, GitHub Actions 원격 실행은 미검증입니다. 테스트는 인식 모델의 정확도를 증명하지 않습니다.

라이브러리 경고 2건은 Starlette의 TestClient/httpx 및 AnyIO 별칭 deprecation이며 실패는 아닙니다. 핵심 테스트는 통과했고 경고를 감추지는 않았습니다.

## GitHub 반영 상태

로컬 Git 커밋은 준비했습니다. 최초 GitHub 파일 생성 요청이 `403 Resource not accessible by integration`으로 거부되어 원격 저장소에는 반영되지 않았습니다. 권한이 해결되면 로컬 이력을 push할 수 있습니다. 다운로드 묶음의 Git bundle로도 동일 이력을 복원할 수 있습니다.
