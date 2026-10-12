import multer from 'multer';
import env from '../config/env.js';
import { ApiError, asyncHandler } from '../utils/ApiError.js';
import { transcribeWithSarvam, parseTranscript } from '../services/sarvam.js';

// Audio never touches disk — it goes to Sarvam and is dropped.
export const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^audio\//.test(file.mimetype)) return cb(null, true);
    cb(ApiError.badRequest('Only audio files are accepted'));
  },
}).single('audio');

/** GET /api/voice/status — lets the client pick its strategy at runtime. */
export const getVoiceStatus = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    sarvamEnabled: env.sarvam.enabled,
    strategy: env.sarvam.enabled ? 'sarvam' : 'web_speech',
    languages: env.sarvam.enabled
      ? ['en-IN', 'hi-IN', 'bn-IN', 'ta-IN', 'te-IN', 'mr-IN', 'gu-IN', 'kn-IN', 'ml-IN', 'pa-IN']
      : ['en-IN', 'hi-IN'],
  });
});

/**
 * POST /api/voice/transcribe
 * Audio in, structured task form out. Falls back with a clear error when no
 * Sarvam key is set, and the client then uses the browser recogniser instead.
 */
export const transcribe = asyncHandler(async (req, res) => {
  if (!req.file) throw ApiError.badRequest('No audio received');

  if (!env.sarvam.enabled) {
    throw new ApiError(
      503,
      'Server-side transcription is not configured. The app will use your browser instead.'
    );
  }

  const language = req.body.language || 'en-IN';
  let transcript;
  try {
    transcript = await transcribeWithSarvam(req.file.buffer, language);
  } catch (err) {
    console.error('[voice] Sarvam failed:', err.message);
    throw new ApiError(502, 'Transcription service is unavailable. Try typing instead.');
  }

  res.json({ success: true, transcript, parsed: parseTranscript(transcript), source: 'sarvam' });
});

/**
 * POST /api/voice/parse
 * Parse-only. The browser did the listening; we just turn words into fields.
 */
export const parse = asyncHandler(async (req, res) => {
  const transcript = String(req.body.transcript || '').trim();
  if (!transcript) throw ApiError.badRequest('No transcript provided');
  if (transcript.length > 1000) throw ApiError.badRequest('Transcript is too long');

  res.json({ success: true, transcript, parsed: parseTranscript(transcript), source: 'web_speech' });
});

export default { getVoiceStatus, transcribe, parse, audioUpload };
