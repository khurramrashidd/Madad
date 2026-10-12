import express from 'express';
import { getVoiceStatus, transcribe, parse, audioUpload } from '../controllers/voiceController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.get('/status', getVoiceStatus);
router.post('/transcribe', protect, audioUpload, transcribe);
router.post('/parse', protect, parse);

export default router;
