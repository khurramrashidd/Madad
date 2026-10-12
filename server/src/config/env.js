import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const num = (v, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

export const env = {
  port: num(process.env.PORT, 5000),
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',

  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/madad',

  jwtSecret: process.env.JWT_SECRET || 'madad_dev_secret_change_me_in_production',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '30d',

  clientOrigins: (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  /**
   * Accounts that become admins automatically on registration.
   *
   * The alternative is hand-editing `role` in the database after every fresh
   * deploy, which is both tedious and the sort of thing you do at 2am before
   * a demo and get wrong. Comma-separated, matched case-insensitively.
   */
  adminEmails: (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),

  seed: {
    lat: num(process.env.SEED_CENTER_LAT, 18.9894),
    lng: num(process.env.SEED_CENTER_LNG, 73.1175),
    city: process.env.SEED_CITY || 'Panvel',
  },

  mockOtp: process.env.MOCK_OTP || '123456',

  minBounty: num(process.env.MIN_BOUNTY, 10),
  maxBounty: num(process.env.MAX_BOUNTY, 500),

  trust: {
    startingScore: num(process.env.TRUST_STARTING_SCORE, 70),
    restrictBelow: num(process.env.TRUST_RESTRICT_BELOW, 40),
  },

  sarvam: {
    apiKey: process.env.SARVAM_API_KEY || '',
    apiUrl: process.env.SARVAM_API_URL || 'https://api.sarvam.ai/speech-to-text',
    get enabled() {
      return Boolean(process.env.SARVAM_API_KEY);
    },
  },

  vapid: {
    publicKey: process.env.VAPID_PUBLIC_KEY || '',
    privateKey: process.env.VAPID_PRIVATE_KEY || '',
    subject: process.env.VAPID_SUBJECT || 'mailto:admin@madad.local',
    get enabled() {
      return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
    },
  },
};

const DEFAULT_SECRET = 'madad_dev_secret_change_me_in_production';

/**
 * Refuses to start a production server that is unsafe in a way the operator
 * would not notice.
 *
 * The default JWT secret is the dangerous one: the app works perfectly with
 * it, so nothing ever prompts you to change it — but anyone who has read this
 * repository can mint a valid token for any account. Better to fail the
 * deploy with an explanation than to run an app whose auth is decorative.
 *
 * Returns the list of non-fatal warnings; throws on anything fatal.
 */
export function validateEnv() {
  const warnings = [];
  const fatal = [];

  if (env.isProd) {
    if (env.jwtSecret === DEFAULT_SECRET) {
      fatal.push(
        'JWT_SECRET is still the example value. Anyone could forge a login token.\n' +
        '    Generate one with:  node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"'
      );
    } else if (env.jwtSecret.length < 32) {
      warnings.push('JWT_SECRET is shorter than 32 characters — use a longer random value.');
    }

    if (env.mongoUri.includes('127.0.0.1') || env.mongoUri.includes('localhost')) {
      fatal.push(
        'MONGO_URI points at localhost, but there is no database on a hosted container.\n' +
        '    Use the MongoDB Atlas connection string.'
      );
    }

    if (!env.adminEmails.length) {
      warnings.push('ADMIN_EMAILS is empty — no account will be able to reach the admin dashboard.');
    }
    if (!env.vapid.enabled) {
      warnings.push('VAPID keys are not set — notifications will be in-app only, with no push.');
    }
  }

  if (fatal.length) {
    throw new Error(
      `Refusing to start with an unsafe configuration:\n\n  - ${fatal.join('\n\n  - ')}\n`
    );
  }

  return warnings;
}

export default env;
