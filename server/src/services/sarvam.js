import env from '../config/env.js';
import { TASK_CATEGORIES } from '../utils/constants.js';

/**
 * Speech-to-text via Sarvam AI, plus a rule-based parser that turns the
 * transcript into a pre-filled task form.
 *
 * Sarvam is optional. With no API key the client falls back to the browser's
 * Web Speech API and posts the transcript here for parsing only — so the
 * feature demos fully either way.
 */

/**
 * @param {Buffer} audioBuffer
 * @param {string} languageCode e.g. 'hi-IN', 'en-IN'
 */
export async function transcribeWithSarvam(audioBuffer, languageCode = 'en-IN') {
  if (!env.sarvam.enabled) {
    const err = new Error('Sarvam API key not configured');
    err.code = 'SARVAM_DISABLED';
    throw err;
  }

  const form = new FormData();
  form.append('file', new Blob([audioBuffer], { type: 'audio/wav' }), 'audio.wav');
  form.append('language_code', languageCode);
  form.append('model', 'saarika:v2');

  const resp = await fetch(env.sarvam.apiUrl, {
    method: 'POST',
    headers: { 'api-subscription-key': env.sarvam.apiKey },
    body: form,
  });

  if (!resp.ok) {
    throw new Error(`Sarvam returned ${resp.status}: ${await resp.text()}`);
  }

  const data = await resp.json();
  return data.transcript || data.text || '';
}

// ---- Transcript → task form ----

const NUMBER_WORDS = {
  ten: 10, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60,
  seventy: 70, eighty: 80, ninety: 90, hundred: 100,
  das: 10, bees: 20, tees: 30, chalis: 40, pachas: 50,
  saath: 60, sattar: 70, assi: 80, nabbe: 90, sau: 100,
};

const CATEGORY_HINTS = {
  delivery: ['deliver', 'drop', 'pick up', 'pickup', 'courier', 'parcel', 'bhej', 'pahuncha', 'le aao'],
  printout: ['print', 'printout', 'photocopy', 'xerox', 'scan', 'stationery'],
  heavy_lifting: ['heavy', 'lift', 'carry', 'move', 'shift', 'luggage', 'furniture', 'uthana', 'saman'],
  queue_standing: ['queue', 'line', 'stand in', 'token', 'counter', 'lineup', 'lain'],
  shopping: ['buy', 'shop', 'grocery', 'purchase', 'store', 'medicine', 'kharid', 'laana', 'sabzi'],
  pet_care: ['dog', 'cat', 'pet', 'walk the', 'feed the'],
  tech_help: ['laptop', 'computer', 'wifi', 'printer setup', 'install', 'phone fix', 'software'],
  tutoring: ['teach', 'tutor', 'explain', 'notes', 'assignment', 'padha'],
};

/** Pull a rupee amount out of free speech. */
function extractBounty(text) {
  const t = text.toLowerCase();

  // "50 rupees", "₹50", "rs 50", "50 rs", "50 rupaye"
  const patterns = [
    /(?:₹|rs\.?|rupees?|rupaye|rupay)\s*(\d{1,4})/i,
    /(\d{1,4})\s*(?:₹|rs\.?|rupees?|rupaye|rupay)/i,
    /(?:pay|paying|paid|bounty|reward|dunga|dungi|denge)\s*(?:you)?\s*(\d{1,4})/i,
  ];
  for (const re of patterns) {
    const m = t.match(re);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n >= env.minBounty && n <= env.maxBounty) return n;
    }
  }

  // Spelled-out numbers: "fifty rupees", "pachas rupaye"
  for (const [word, value] of Object.entries(NUMBER_WORDS)) {
    const re = new RegExp(`\\b${word}\\b\\s*(?:₹|rs\\.?|rupees?|rupaye)?`, 'i');
    if (re.test(t) && value >= env.minBounty && value <= env.maxBounty) return value;
  }

  return null;
}

function extractCategory(text) {
  const t = text.toLowerCase();
  let best = { category: 'other', score: 0 };

  for (const [category, hints] of Object.entries(CATEGORY_HINTS)) {
    const score = hints.reduce((acc, h) => (t.includes(h) ? acc + 1 : acc), 0);
    if (score > best.score) best = { category, score };
  }
  return TASK_CATEGORIES.includes(best.category) ? best.category : 'other';
}

function extractLandmark(text) {
  // "near X", "at X", "outside X", "ke paas X"
  const m = text.match(/\b(?:near|outside|at|behind|opposite|ke paas|ke samne)\s+([A-Za-z0-9\s]{3,40})/i);
  if (!m) return '';
  return m[1].trim().replace(/\s+(and|for|to|i|we|please)\b.*$/i, '').slice(0, 60);
}

/** Strip the money talk so the title reads like a task, not a sentence. */
function buildTitle(text) {
  let title = text
    .replace(/(?:₹|rs\.?|rupees?|rupaye|rupay)\s*\d{1,4}/gi, '')
    .replace(/\d{1,4}\s*(?:₹|rs\.?|rupees?|rupaye|rupay)/gi, '')
    .replace(/\b(?:i (?:need|want|would like)|can (?:someone|anyone)|please|kindly|mujhe|chahiye)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  title = title.charAt(0).toUpperCase() + title.slice(1);
  if (title.length > 90) {
    const cut = title.slice(0, 90);
    title = cut.slice(0, cut.lastIndexOf(' ')) + '…';
  }
  return title || 'Quick local task';
}

/**
 * @param {string} transcript
 * @returns {{title, description, bounty, category, landmark, confidence, missing}}
 */
export function parseTranscript(transcript) {
  const text = String(transcript || '').trim();
  if (!text) {
    return { title: '', description: '', bounty: null, category: 'other', landmark: '', confidence: 0, missing: ['title', 'bounty'] };
  }

  const bounty = extractBounty(text);
  const category = extractCategory(text);
  const landmark = extractLandmark(text);
  const title = buildTitle(text);

  const missing = [];
  if (!bounty) missing.push('bounty');
  if (title.length < 5) missing.push('title');

  // Rough confidence so the UI can decide how loudly to ask for confirmation.
  let confidence = 0.4;
  if (bounty) confidence += 0.3;
  if (category !== 'other') confidence += 0.2;
  if (landmark) confidence += 0.1;

  return {
    title,
    description: text.length > 90 ? text : '',
    bounty,
    category,
    landmark,
    confidence: Number(confidence.toFixed(2)),
    missing,
  };
}

export default { transcribeWithSarvam, parseTranscript };
