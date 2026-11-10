import { getConfig } from '../config/env.mjs';
import { createBatchApp } from './httpServer.mjs';

const config = getConfig();
const app = createBatchApp(config);

app.server.listen(config.port, config.host, () => {
  console.log(`BATCH Gateway listening on http://${config.host}:${config.port}`);
  console.log(`  Dashboard:       http://localhost:${config.port}/`);
  console.log(`  OpenAI Endpoint: http://localhost:${config.port}/v1`);
  console.log(`  Anthropic /v1:   http://localhost:${config.port}/v1/messages`);
  console.log(`  MCP Endpoint:    http://localhost:${config.port}/mcp`);
  console.log(`  Data DB:         ${config.dbPath}`);
});

const shutdown = async () => {
  await app.close();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
