# ─────────────────────────────────────────────────────────────────────────────
# Stage 1 — Build the React frontend
# ─────────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS frontend

WORKDIR /build/frontend

# Install deps first for better layer caching
# Use npm install (not npm ci) so npm resolves the correct platform-specific
# native bindings for rolldown (Vite 8's bundler) on the build platform.
# npm ci uses the macOS-generated lockfile which lacks linux-arm64-musl entries.
COPY frontend/package.json ./
RUN npm install

# Copy source and build (plain web build — no Tauri toolchain needed)
COPY frontend/ ./
RUN npm run build


# ─────────────────────────────────────────────────────────────────────────────
# Stage 2 — Python backend + static serving
# ─────────────────────────────────────────────────────────────────────────────
FROM python:3.12-slim

WORKDIR /app

# Install Python dependencies
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir --upgrade pip \
 && pip install --no-cache-dir -r requirements.txt

# Copy backend source
COPY backend/ .

# Copy the built React app into static/ so FastAPI can serve it
COPY --from=frontend /build/frontend/dist ./static

# Persistent volume for SQLite database
VOLUME ["/data"]
ENV WICKWATCH_DB_PATH=/data/wickwatch.db

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
