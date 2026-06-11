import { useCallback, useEffect, useRef, useState } from 'react';

// Minimal typings for the Web Speech API (not in the standard DOM lib).
type SpeechRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

function getCtor(): (new () => SpeechRecognition) | undefined {
  if (typeof window === 'undefined') return undefined;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognition;
    webkitSpeechRecognition?: new () => SpeechRecognition;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

/**
 * Browser-native voice dictation (Web Speech API). Calls `onText` with each
 * finalized chunk so the caller can append it to an input. `supported` is false
 * where the API is unavailable (e.g. Firefox) — hide the button then.
 */
export function useDictation(onText: (text: string) => void) {
  const Ctor = getCtor();
  const supported = !!Ctor;
  const [listening, setListening] = useState(false);
  const recRef = useRef<SpeechRecognition | null>(null);
  const onTextRef = useRef(onText);
  onTextRef.current = onText;

  const stop = useCallback(() => recRef.current?.stop(), []);

  const toggle = useCallback(() => {
    if (!Ctor) return;
    if (recRef.current) {
      recRef.current.stop();
      return;
    }
    const rec = new Ctor();
    rec.lang = 'en-US';
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (e) => {
      let text = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i]!.isFinal) text += e.results[i]![0].transcript;
      }
      if (text.trim()) onTextRef.current(text.trim());
    };
    rec.onend = () => {
      setListening(false);
      recRef.current = null;
    };
    rec.onerror = () => {
      setListening(false);
      recRef.current = null;
    };
    recRef.current = rec;
    rec.start();
    setListening(true);
  }, [Ctor]);

  useEffect(() => () => recRef.current?.stop(), []);

  return { supported, listening, toggle, stop };
}
