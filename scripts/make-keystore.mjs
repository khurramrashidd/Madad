#!/usr/bin/env node
/**
 * Creates a release signing keystore and wires it into the Gradle build.
 *
 *   npm run android:keystore
 *
 * A debug APK is signed with a throwaway key Android generates for you. It
 * installs, but it shows scary warnings and cannot be updated by anything
 * signed differently. A release APK needs your own key.
 *
 * Keep the generated .jks and its passwords. Losing them means you can never
 * ship an update to the same app — Android identifies an app by its signature,
 * not its name. Both files are gitignored for you.
 */
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { CLIENT, c, run, exists } from './lib.mjs';

const ANDROID = path.join(CLIENT, 'android');
const KEYSTORE = path.join(ANDROID, 'madad-release.jks');
const PROPS = path.join(ANDROID, 'keystore.properties');

if (!exists(ANDROID)) {
  console.error(c.red('\n  No android/ folder yet. Run:  npm run android:init\n'));
  process.exit(1);
}

if (exists(KEYSTORE)) {
  console.log('');
  console.log(c.yellow('  A keystore already exists at:'));
  console.log(`    ${KEYSTORE}`);
  console.log(c.dim('\n  Delete it by hand if you really want a new one — but note that'));
  console.log(c.dim('  an app signed with a different key cannot update the old install.\n'));
  process.exit(0);
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q, fallback = '') =>
  new Promise((res) => rl.question(`  ${q}${fallback ? c.dim(` [${fallback}]`) : ''}: `, (a) => res(a.trim() || fallback)));

console.log('');
console.log(c.bold('  Create a release signing key'));
console.log(c.dim('  ─────────────────────────────────────────────'));
console.log(c.dim('  Press Enter to accept the suggested value.\n'));

const name = await ask('Your name', 'Madad Developer');
const org = await ask('College or organisation', 'Madad');
const city = await ask('City', 'Panvel');
const country = await ask('Country code (2 letters)', 'IN');

let password = '';
while (password.length < 6) {
  password = await ask('Keystore password (min 6 chars)');
  if (password.length < 6) console.log(c.red('    Too short.'));
}

rl.close();

const dname = `CN=${name}, OU=${org}, O=${org}, L=${city}, C=${country}`;

console.log('');
console.log(c.dim('  Generating a 2048-bit RSA key valid for 10,000 days…'));

const res = await run(
  'keytool',
  [
    '-genkeypair', '-v',
    '-keystore', KEYSTORE,
    '-alias', 'madad',
    '-keyalg', 'RSA',
    '-keysize', '2048',
    '-validity', '10000',
    '-storepass', password,
    '-keypass', password,
    '-dname', dname,
  ],
  { timeout: 60000 }
);

if (!res.ok) {
  console.error('');
  console.error(c.red('  keytool failed.'));
  console.error(c.dim(`  ${res.stderr || res.stdout}`));
  console.error('');
  console.error(c.dim('  keytool ships with the JDK. If it is not on PATH, use the one'));
  console.error(c.dim('  inside Android Studio:'));
  console.error(c.dim('    "C:\\Program Files\\Android\\Android Studio\\jbr\\bin\\keytool.exe"'));
  console.error('');
  process.exit(1);
}

// Gradle reads the credentials from here so they never enter version control.
fs.writeFileSync(
  PROPS,
  [
    '# Signing credentials. NEVER commit this file.',
    'storeFile=madad-release.jks',
    'keyAlias=madad',
    `storePassword=${password}`,
    `keyPassword=${password}`,
    '',
  ].join('\n'),
  'utf8'
);

// Keep both out of git even if the user initialises a repo inside android/.
const gitignore = path.join(ANDROID, '.gitignore');
let ig = exists(gitignore) ? fs.readFileSync(gitignore, 'utf8') : '';
for (const entry of ['madad-release.jks', 'keystore.properties']) {
  if (!ig.includes(entry)) ig += `\n${entry}`;
}
fs.writeFileSync(gitignore, ig.trim() + '\n', 'utf8');

console.log('');
console.log(c.green(c.bold('  Keystore created.')));
console.log('');
console.log(`  key       ${KEYSTORE}`);
console.log(`  settings  ${PROPS}`);
console.log('');
console.log(c.yellow('  Back both files up somewhere safe.'));
console.log(c.dim('  Lose them and you can never update this app on a phone that has it.'));
console.log('');
console.log(c.bold('  One manual step left'));
console.log(c.dim('  ─────────────────────────────────────────────'));
console.log('  Open ' + c.bold('client/android/app/build.gradle') + ' and paste this');
console.log('  inside the ' + c.bold('android { }') + ' block:');
console.log('');
console.log(c.dim(`
    signingConfigs {
        release {
            def props = new Properties()
            def f = rootProject.file("keystore.properties")
            if (f.exists()) {
                props.load(new FileInputStream(f))
                storeFile file(props['storeFile'])
                storePassword props['storePassword']
                keyAlias props['keyAlias']
                keyPassword props['keyPassword']
            }
        }
    }

    buildTypes {
        release {
            signingConfig signingConfigs.release
            minifyEnabled false
        }
    }
`));
console.log('  Then build it:  ' + c.bold('npm run android:apk:release'));
console.log('');
