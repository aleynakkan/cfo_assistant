#!/bin/bash
set -e

echo "🚀 Starting CFO Assistant Backend..."

# Migration'ı dene, başarısız olursa uygulamayı yine de başlat
echo "📊 Running database migrations..."
python migrate_email_tables.py || {
    echo "⚠️  Migration failed, but continuing with app startup..."
}

echo "🌐 Starting FastAPI application..."
exec uvicorn main:app --host 0.0.0.0 --port 8080