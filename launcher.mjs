import { createServer } from 'file:///C:/tmp/israeli-whist/node_modules/vite/dist/node/index.js';

const server = await createServer({
  root: 'C:/tmp/israeli-whist',
  server: { port: 5175, host: '127.0.0.1', strictPort: true },
});
await server.listen();
server.printUrls();
