FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./backend/
COPY frontend/ ./frontend/

ENV DATA_DIR=/app/data
ENV PORT=8000
ENV DEV_MODE=false

EXPOSE 8000

CMD ["python", "backend/main.py"]
