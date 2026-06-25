FROM node:18-alpine

# Wir setzen ein absolut festes Arbeitsverzeichnis
WORKDIR /usr/src/app

# Wir installieren die 3 benötigten Pakete direkt fest im Image
RUN npm install express multer sqlite3

# Wir kopieren deine server.js in genau diesen Ordner
COPY server.js .

# Der Container öffnet Port 8090
EXPOSE 8090

# Startbefehl – da der Ordner feststeht, knallt es hier nie wieder
CMD ["node", "server.js"]
