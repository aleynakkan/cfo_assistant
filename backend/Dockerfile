# Python 3.10 slim tabanlı bir imaj kullanıyoruz
FROM python:3.10-slim

# Çalışma dizinini ayarla
WORKDIR /app

# Gerekli bağımlılıkları yüklemek için requirements.txt dosyasını kopyala
COPY requirements.txt .

# Bağımlılıkları yükle
RUN pip install --no-cache-dir -r requirements.txt

# Uygulama dosyalarını kopyala
COPY . .

# Başlangıç script'i oluştur
RUN echo '#!/bin/bash\necho "Running database migrations..."\npython migrate_email_tables.py\necho "Starting application..."\nexec uvicorn main:app --host 0.0.0.0 --port 8080' > /app/start.sh && chmod +x /app/start.sh

# Başlangıç script'i ile uygulamayı başlat
CMD ["/app/start.sh"]