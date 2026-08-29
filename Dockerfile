# Footato auto-hébergé : construit le site et le rafraîchit depuis le réseau
# où la collecte fonctionne, c'est-à-dire une connexion résidentielle.
#
# L'image embarque les dépendances de build parce que le conteneur reconstruit
# le site à chaque collecte : ce n'est pas un simple serveur de fichiers.
FROM node:22-alpine

# Python/pdfplumber extrait les tableaux standardisés DNCG lors des passes
# financières complètes. Poppler sert au diagnostic des PDF déposés.
RUN apk add --no-cache git tzdata python3 py3-pip poppler-utils

WORKDIR /app

# Couche de dépendances séparée : une modification du code ne réinstalle pas.
COPY package.json package-lock.json requirements-finance.txt ./
RUN npm ci
RUN python3 -m venv /opt/finance-venv \
  && /opt/finance-venv/bin/pip install --no-cache-dir -r requirements-finance.txt

COPY . .

# Une première construction pour que le site réponde immédiatement au démarrage,
# avant même la première collecte.
RUN npm run build

ENV NODE_ENV=production \
    PORT=8080 \
    HOST=0.0.0.0 \
    REFRESH_INTERVAL_HOURS=6 \
    REFRESH_FULL_EVERY=4 \
    FINANCE_PYTHON=/opt/finance-venv/bin/python

EXPOSE 8080

# Le serveur répond même si une collecte échoue : il continue de servir la
# dernière version valide, et signale l'échec dans /api/status.
HEALTHCHECK --interval=60s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/status').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/serve.mjs"]
