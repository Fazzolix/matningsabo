# ===== Stage 1: Build React frontend =====
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend

# Copy package files
COPY frontend/package.json frontend/package-lock.json ./
# Use ci for reproducible builds
RUN npm ci

# Copy and build frontend
COPY frontend/ ./
RUN npm run build

# ===== Stage 2: Production image =====
FROM python:3.11-slim
WORKDIR /app

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1

# Create non-root user
RUN groupadd -g 1001 appgroup && \
    useradd -u 1001 -g appgroup -s /bin/sh -m appuser

# Create and activate virtual environment
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Install dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY backend ./backend

# Copy built frontend from the builder stage
COPY --from=frontend-builder /app/frontend/build ./backend/static

# Create necessary directories with secure permissions
RUN mkdir -p /tmp/flask_session && \
    chown -R appuser:appgroup /app /tmp/flask_session && \
    chmod 750 /tmp/flask_session

# Switch to non-root user
USER appuser

# Expose port (non-privileged)
EXPOSE 8080

# Start the application using Gunicorn
WORKDIR /app/backend
CMD exec gunicorn --bind :${PORT:-8080} --workers 2 --timeout 120 --worker-class sync --log-level info app:app
