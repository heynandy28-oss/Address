import { createApp } from './app.js';
import { DB_FILE, HOST, PORT } from './config.js';
import { openDatabase } from './db/index.js';

const db = openDatabase(DB_FILE);
const app = createApp(db);

const server = app.listen(PORT, HOST, () => {
  console.log(`[address-intelligence] listening on http://${HOST}:${PORT}`);
  console.log(`[address-intelligence] sqlite database: ${DB_FILE}`);
});

function shutdown(signal: string): void {
  console.log(`[address-intelligence] received ${signal}, shutting down`);
  server.close(() => {
    try {
      db.close();
    } catch {
      // database already closed
    }
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
