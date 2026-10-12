import http from 'http';
import os from 'os';
import app, { hasClientBuild } from './app.js';
import env, { validateEnv } from './config/env.js';
import { connectDB, disconnectDB } from './config/db.js';
import { initSockets } from './sockets/index.js';

/** Prints the LAN address so a real phone can reach the dev server. */
function lanAddress() {
  for (const iface of Object.values(os.networkInterfaces()).flat()) {
    if (iface && iface.family === 'IPv4' && !iface.internal) return iface.address;
  }
  return 'localhost';
}

async function start() {
  // Check the configuration before touching the database, so a misconfigured
  // deploy fails in two seconds with a readable reason.
  let warnings = [];
  try {
    warnings = validateEnv();
  } catch (err) {
    console.error(`\n[config] ${err.message}`);
    process.exit(1);
  }

  await connectDB();

  const server = http.createServer(app);
  initSockets(server);

  server.listen(env.port, '0.0.0.0', () => {
    const lan = lanAddress();
    console.log('');
    console.log('  ╭──────────────────────────────────────────────╮');
    console.log('  │   Madad API                                  │');
    console.log('  ╰──────────────────────────────────────────────╯');
    console.log(`  Mode      ${env.nodeEnv}`);
    console.log(`  Local     http://localhost:${env.port}/api/health`);
    console.log(`  Network   http://${lan}:${env.port}/api/health`);
    console.log(`  Voice     ${env.sarvam.enabled ? 'Sarvam AI' : 'browser fallback'}`);
    console.log(`  Push      ${env.vapid.enabled ? 'enabled' : 'in-app only'}`);
    console.log(`  Client    ${hasClientBuild ? 'served from client/dist' : 'served separately (Vite dev)'}`);
    if (warnings.length) {
      console.log('');
      for (const w of warnings) console.log(`  ⚠ ${w}`);
    }
    console.log('');
  });

  const shutdown = async (signal) => {
    console.log(`\n[server] ${signal} received, shutting down…`);
    server.close(async () => {
      await disconnectDB();
      process.exit(0);
    });
    // Don't hang forever if a socket refuses to close.
    setTimeout(() => process.exit(1), 10000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

process.on('unhandledRejection', (err) => {
  console.error('[fatal] Unhandled rejection:', err);
});

start();
