FROM python:3.12-slim
WORKDIR /workspace
COPY backend/pyproject.toml /tmp/pyproject.toml
RUN pip install --no-cache-dir fastapi "uvicorn[standard]" pydantic
COPY . /workspace
CMD ["uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000"]
