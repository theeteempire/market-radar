# رادار السوق — صورة تشغيل خفيفة، بدون أي حزم npm.
FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8787

COPY package.json server.js ./
COPY src ./src
COPY public ./public
COPY scripts ./scripts
COPY README.md LICENSE ./

# مجلد الإعدادات يجب أن يكون قابلًا للكتابة من المستخدم غير الجذري.
RUN mkdir -p /app/data && chown -R node:node /app

USER node
EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
