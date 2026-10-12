#!/usr/bin/env node
/**
 * Points the client at this machine's LAN address so a phone can reach it.
 *
 *   npm run set-ip           auto-detect and write client/.env
 *   npm run set-ip -- 192.168.1.42    use a specific address
 *   npm run set-ip -- --reset         go back to the laptop-only Vite proxy
 *
 * Why this exists: an installed APK has no dev proxy, so VITE_API_URL must be
 * an absolute address. That address changes every time you join a different
 * Wi-Fi network, and a stale value is the most common reason the phone build
 * suddenly "stops working".
 */
import path from 'path';
import { CLIENT, SERVER, c, lanAddresses, readEnv, writeEnvKey, exists } from './lib.mjs';
import fs from 'fs';

const clientEnv = path.join(CLIENT, '.env');
const args = process.argv.slice(2);

if (!exists(clientEnv)) {
  const example = path.join(CLIENT, '.env.example');
  if (exists(example)) {
    fs.copyFileSync(example, clientEnv);
    console.log(c.dim('Created client/.env from the example.'));
  } else {
    fs.writeFileSync(clientEnv, '');
  }
}

const apiPort = Number(readEnv(path.join(SERVER, '.env')).PORT || 5000);

// ---- reset ----
if (args.includes('--reset')) {
  writeEnvKey(clientEnv, 'VITE_API_URL', '');
  console.log('');
  console.log(c.green('  Reset to the Vite dev proxy (laptop only).'));
  console.log(c.dim('  Restart the client for it to take effect:  npm run dev'));
  console.log('');
  process.exit(0);
}

// ---- choose an address ----
const explicit = args.find((a) => /^\d{1,3}(\.\d{1,3}){3}$/.test(a));
const found = lanAddresses();

if (!explicit && found.length === 0) {
  console.error('');
  console.error(c.red('  No LAN address found.'));
  console.error(c.dim('  Connect to Wi-Fi and try again, or pass one directly:'));
  console.error(c.dim('    npm run set-ip -- 192.168.1.42'));
  console.error('');
  process.exit(1);
}

const ip = explicit || found[0].address;
const url = `http://${ip}:${apiPort}`;

writeEnvKey(clientEnv, 'VITE_API_URL', url);

console.log('');
console.log(c.bold('  Client pointed at your LAN address'));
console.log(c.dim('  ─────────────────────────────────────────────'));
console.log(`  VITE_API_URL   ${c.bold(url)}`);
if (!explicit) console.log(c.dim(`  adapter        ${found[0].name}`));

if (found.length > 1 && !explicit) {
  console.log('');
  console.log(c.dim('  Other addresses on this machine, if that one is wrong:'));
  found.slice(1).forEach((a) => console.log(c.dim(`    ${a.address}  [${a.name}]`)));
  console.log(c.dim(`    npm run set-ip -- <address>`));
}

console.log('');
console.log('  On your phone (same Wi-Fi), open:');
console.log(`    ${c.bold(`http://${ip}:5173`)}`);
console.log('');
console.log(c.dim('  Restart the client so Vite picks this up:  npm run dev'));
console.log(c.dim('  Going back to laptop-only?  npm run set-ip -- --reset'));
console.log('');
