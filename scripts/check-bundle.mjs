#!/usr/bin/env node
/**
 * Guards against development-only material reaching a production build.
 *
 * The demo account switcher and guided walkthrough hold working credentials.
 * A `return null` guard inside a component is NOT enough — the component body
 * still gets bundled, strings and all. This checks the built output for things
 * that should never ship.
 *
 *   npm run check:bundle        (runs automatically after npm run build)
 */
import fs from 'fs';
import path from 'path';
import { CLIENT, c, exists } from './lib.mjs';

const DIST = path.join(CLIENT, 'dist');

if (!exists(DIST)) {
  console.error(c.red('\n  No dist/ folder. Run `npm run build` first.\n'));
  process.exit(1);
}

/** Things that must never appear in a production bundle. */
const FORBIDDEN = [
  { needle: 'password123', why: 'seeded demo password' },
  { needle: '@madad.local', why: 'seeded demo account emails' },
  { needle: 'demo-accounts', why: 'development-only API route' },
  { needle: 'demo-recentre', why: 'development-only API route' },
];

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.(js|css|html|webmanifest)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const files = walk(DIST);
const hits = [];

for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  for (const { needle, why } of FORBIDDEN) {
    let count = 0;
    let i = text.indexOf(needle);
    while (i !== -1) {
      count++;
      i = text.indexOf(needle, i + needle.length);
    }
    if (count) hits.push({ file: path.relative(DIST, file), needle, why, count });
  }
}

console.log('');
console.log(c.bold('  Production bundle check'));
console.log(c.dim('  ─────────────────────────────────────────────'));
console.log(c.dim(`  scanned ${files.length} file(s) in client/dist`));

if (!hits.length) {
  console.log(`  ${c.green('✓')} no development-only material found`);
  console.log('');
  process.exit(0);
}

console.log('');
console.log(c.red(c.bold('  Development-only material is in the production build:')));
for (const h of hits) {
  console.log(`\n  ${c.red('✗')} ${c.bold(h.needle)} ${c.dim(`(${h.why})`)}`);
  console.log(`     ${h.count}× in ${h.file}`);
}
console.log('');
console.log(c.dim('  Anything dev-only must be imported behind an'));
console.log(c.dim('  `import.meta.env.DEV` branch so Rollup can drop it —'));
console.log(c.dim('  see client/src/components/DevTools.jsx.'));
console.log('');
process.exit(1);
