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