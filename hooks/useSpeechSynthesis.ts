
import { useState, useEffect, useCallback } from 'react';
import { PlaybackState } from '../types';

export interface UseSpeechSynthesisReturn {
  speak: (text: string, voice: SpeechSynthesisVoice | null, rate: number, pitch: number) => void;
  pause: () => void;
  resume: () => void;
  cancel: () => void;
  voices: SpeechSynthesisVoice[];
  playbackState: PlaybackState; // This state is specific to browser TTS
}

const useSpeechSynthesis = (): UseSpeechSynthesisReturn => {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [playbackState, setPlaybackState] = useState<PlaybackState>(PlaybackState.IDLE);
  const [currentUtterance, setCurrentUtterance] = useState<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      setPlaybackState(PlaybackState.UNSUPPORTED);
      return;
    }

    setPlaybackState(PlaybackState.LOADING_VOICES);

    const loadVoices = () => {
      const availableVoices = window.speechSynthesis.getVoices();
      if (availableVoices.length > 0) {
        setVoices(availableVoices);
        setPlaybackState(prev => (prev === PlaybackState.LOADING_VOICES ? PlaybackState.IDLE : prev));
      }
    };

    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;

    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && window.speechSynthesis && 
          (window.speechSynthesis.speaking || window.speechSynthesis.pending)) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const handleSpeak = useCallback((text: string, voice: SpeechSynthesisVoice | null, rate: number, pitch: number) => {
    if (playbackState === PlaybackState.UNSUPPORTED || !text.trim()) {
      return;
    }

    if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
      window.speechSynthesis.cancel(); 
    }
    
    setTimeout(() => {
        const utterance = new SpeechSynthesisUtterance(text);
        if (voice) {
        utterance.voice = voice;
        }
        utterance.rate = Math.max(0.1, Math.min(rate, 10)); 
        utterance.pitch = Math.max(0, Math.min(pitch, 2)); 

        utterance.onstart = () => {
        setPlaybackState(PlaybackState.PLAYING);
        };
        utterance.onpause = () => {
        setPlaybackState(PlaybackState.PAUSED);
        };
        utterance.onresume = () => {
        setPlaybackState(PlaybackState.PLAYING);
        };
        utterance.onend = () => {
        setPlaybackState(PlaybackState.ENDED);
        setCurrentUtterance(prevU => (prevU === utterance ? null : prevU));
        };
        utterance.onerror = (event: SpeechSynthesisErrorEvent) => {
        if (event.error === 'interrupted' || event.error === 'canceled') {
            console.info(`SpeechSynthesisUtterance deliberately ${event.error}.`);
        } else {
            console.error(`SpeechSynthesisUtterance.onerror - Error: ${event.error}, Type: ${event.type}, Utterance charIndex: ${event.charIndex}`);
        }
        setCurrentUtterance(prevU => {
            if (prevU === utterance) {
                setPlaybackState(PlaybackState.IDLE); 
                return null;
            }
            return prevU;
        });
        };
        
        setCurrentUtterance(utterance);
        window.speechSynthesis.speak(utterance);
    }, 50); 
  }, [playbackState]); 

  const handlePause = useCallback(() => {
    if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
      window.speechSynthesis.pause();
    }
  }, []);

  const handleResume = useCallback(() => {
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }
  }, []);

  const handleCancel = useCallback(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
        
        setCurrentUtterance(prevU => {
            if (prevU && !window.speechSynthesis.speaking && !window.speechSynthesis.pending) {
                setPlaybackState(PlaybackState.IDLE);
                return null;
            }
            return prevU; 
        });
    }
  }, []); 

  return {
    speak: handleSpeak,
    pause: handlePause,
    resume: handleResume,
    cancel: handleCancel,
    voices,
    playbackState,
  };
};

export default useSpeechSynthesis;
