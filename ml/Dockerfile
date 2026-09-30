# 예측 서버. 저장소 루트에서 빌드한다: docker build -f ml/Dockerfile .
FROM python:3.12-slim
WORKDIR /app
COPY ml/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt && useradd --create-home appuser
COPY ml ./ml
USER appuser
EXPOSE 8001
CMD ["uvicorn", "ml.main:app", "--host", "0.0.0.0", "--port", "8001"]
