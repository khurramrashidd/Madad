import { useState, useRef, useCallback, useEffect } from 'react';
import { api } from '../api/client.js';

/**
 * Voice-to-task.
 *
 * Two strategies, chosen at runtime from /api/voice/status:
 *   sarvam      — record audio, upload, Sarvam transcribes (better Hindi and
 *                 regional accuracy, needs an API key)
 *   web_speech  — the browser's own SpeechRecognition, no key, no upload
 *
 * Either way the transcript goes to /api/voice/parse, which extracts the
 * bounty, category and landmark and hands back a pre-filled form.
 */
export function useVoiceInput({ language = 'en-IN' } = {}) {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interim, setInterim] = useState('');
  const [parsed, setParsed] = useState(null);
  const [error, setError] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [strategy, setStrategy] = useState(null);

  const recognitionRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);

  const SpeechRecognition =
    typeof window !== 'undefined' &&
    (window.SpeechRecognition || window.webkitSpeechRecognition);

  // Ask the server which path to take.
  useEffect(() => {
    let alive = true;
    api.voice
      .status()
      .then((r) => alive && setStrategy(r.strategy))
      .catch(() => alive && setStrategy('web_speech'));
    return () => {
      alive = false;
    };
  }, []);

  const supported = Boolean(SpeechRecognition) || Boolean(navigator.mediaDevices?.getUserMedia);

  const parseTranscript = useCallback(async (text) => {
    if (!text?.trim()) return null;
    setProcessing(true);
    try {
      const res = await api.voice.parse(text);
      setParsed(res.parsed);
      return res.parsed;
    } catch (err) {
      setError(err.message || 'Could not understand that');
      return null;
    } finally {
      setProcessing(false);
    }
  }, []);

  const stopTracks = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  // ---- Browser SpeechRecognition ----
  const startWebSpeech = useCallback(() => {
    if (!SpeechRecognition) {
      setError('Voice input is not supported in this browser. Try Chrome.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = language;
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    let finalText = '';

    recognition.onstart = () => {
      setListening(true);
      setError(null);
      setTranscript('');
      setInterim('');
      setParsed(null);
    };

    recognition.onresult = (event) => {
      let interimText = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const chunk = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalText += chunk;
        else interimText += chunk;
      }
      setInterim(interimText);
      if (finalText) setTranscript(finalText);
    };

    recognition.onerror = (event) => {
      const messages = {
        'no-speech': 'I did not hear anything. Try again.',
        'audio-capture': 'No microphone found.',
        'not-allowed': 'Microphone permission was denied.',
        network: 'Speech recognition needs a network connection.',
      };
      setError(messages[event.error] || `Voice input failed: ${event.error}`);
      setListening(false);
    };

    recognition.onend = () => {
      setListening(false);
      setInterim('');
      if (finalText.trim()) parseTranscript(finalText.trim());
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [SpeechRecognition, language, parseTranscript]);

  // ---- Sarvam: record then upload ----
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const mime = MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : 'audio/mp4';
      const recorder = new MediaRecorder(stream, { mimeType: mime });

      recorder.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);

      recorder.onstop = async () => {
        stopTracks();
        setListening(false);

        const blob = new Blob(chunksRef.current, { type: mime });
        if (blob.size < 1000) {
          setError('That recording was too short.');
          return;
        }

        setProcessing(true);
        try {
          const form = new FormData();
          form.append('audio', blob, 'task.webm');
          form.append('language', language);

          const res = await api.voice.transcribe(form);
          setTranscript(res.transcript);
          setParsed(res.parsed);
        } catch (err) {
          // Sarvam unavailable → fall back to the browser recogniser.
          if (err.status === 503 && SpeechRecognition) {
            setError(null);
            setStrategy('web_speech');
            startWebSpeech();
          } else {
            setError(err.message || 'Could not transcribe that');
          }
        } finally {
          setProcessing(false);
        }
      };

      recorderRef.current = recorder;
      recorder.start();
      setListening(true);
      setError(null);
      setTranscript('');
      setParsed(null);

      // Hard stop at 20s so a forgotten recording can't run forever.
      setTimeout(() => {
        if (recorder.state === 'recording') recorder.stop();
      }, 20000);
    } catch {
      setError('Microphone permission was denied.');
      setListening(false);
    }
  }, [language, SpeechRecognition, startWebSpeech]);

  const start = useCallback(() => {
    setError(null);
    if (strategy === 'sarvam') startRecording();
    else startWebSpeech();
  }, [strategy, startRecording, startWebSpeech]);

  const stop = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        /* already stopped */
      }
    }
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    setListening(false);
  }, []);

  const reset = useCallback(() => {
    setTranscript('');
    setInterim('');
    setParsed(null);
    setError(null);
  }, []);

  useEffect(
    () => () => {
      try {
        recognitionRef.current?.abort();
      } catch {
        /* ignore */
      }
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
      stopTracks();
    },
    []
  );

  return {
    listening, transcript, interim, parsed, error, processing,
    strategy, supported, start, stop, reset, parseTranscript,
  };
}

export default useVoiceInput;
