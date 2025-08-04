FROM node:20-slim

WORKDIR /app

RUN npm install -g npm

# You only install from host-mounted package.json
CMD ["sh", "-c", "cd examples && npm install && npm run dev -- --host 0.0.0.0 --port 4600"]
