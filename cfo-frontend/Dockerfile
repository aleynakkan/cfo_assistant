# Node.js tabanlı bir imaj kullanıyoruz
FROM node:20

# Çalışma dizinini ayarla
WORKDIR /app

# Bağımlılıkları yüklemek için package.json ve package-lock.json dosyalarını kopyala
COPY package*.json ./

# Bağımlılıkları yükle
RUN npm install

# Uygulama dosyalarını kopyala
COPY . .

# Build argument olarak API URL'i al
ARG VITE_API_URL=https://cfo-backend-332747511395.us-central1.run.app
ENV VITE_API_URL=$VITE_API_URL

# Uygulamayı build et
RUN npm run build

# Statik dosyaları sunmak için bir Nginx imajı kullan
FROM nginx:alpine

# Ortam değişkeni ile portu ayarla
ENV PORT=8080
RUN sed -i "s/80/$PORT/g" /etc/nginx/conf.d/default.conf


COPY --from=0 /app/dist /usr/share/nginx/html

# Nginx'i başlat
CMD ["nginx", "-g", "daemon off;"]