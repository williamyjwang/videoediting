FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=secret,id=build_ca \
    if [ -f /run/secrets/build_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/build_ca; fi; \
    npm ci
COPY . .
RUN npm run build

FROM node:24-bookworm-slim AS runtime
RUN --mount=type=secret,id=build_ca \
    node -e "const fs=require('node:fs'); fs.writeFileSync('/tmp/build-ca.pem',require('node:tls').rootCertificates.join('\\n')+'\\n'+(fs.existsSync('/run/secrets/build_ca')?fs.readFileSync('/run/secrets/build_ca','utf8'):''))" \
    && sed -i 's|http://deb.debian.org|https://deb.debian.org|g' /etc/apt/sources.list.d/debian.sources \
    && apt-get -o Acquire::https::CaInfo=/tmp/build-ca.pem update -o APT::Update::Error-Mode=any \
    && apt-get -o Acquire::https::CaInfo=/tmp/build-ca.pem install -y --no-install-recommends chromium ffmpeg ca-certificates tini \
    && rm -rf /var/lib/apt/lists/* /tmp/build-ca.pem
RUN --mount=type=secret,id=build_ca \
    if [ -f /run/secrets/build_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/build_ca; fi; \
    npm install --global @openai/codex@0.163.0
WORKDIR /app
COPY --from=build --chown=node:node /app /app
RUN mkdir -p /var/data /home/node/.codex && chown -R node:node /var/data /home/node/.codex
ENV NODE_ENV=production \
    PORT=3001 \
    MCC_DATA_DIR=/var/data \
    REMOTION_BROWSER_EXECUTABLE=/usr/bin/chromium \
    MCC_RENDER_CONCURRENCY=1
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "-g", "--"]
CMD ["npm", "start"]
