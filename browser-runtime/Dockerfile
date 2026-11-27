FROM mcr.microsoft.com/playwright:v1.56.1-noble
WORKDIR /app
ENV NODE_ENV=production PORT=8787
COPY package.json ./
RUN npm install --omit=dev --ignore-scripts && npm cache clean --force
COPY server.mjs ./
USER pwuser
EXPOSE 8787
CMD ["node", "server.mjs"]
