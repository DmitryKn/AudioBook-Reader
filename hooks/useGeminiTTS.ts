import { useState, useEffect, useCallback, useRef } from 'react';
import { GoogleGenAI, GenerateContentResponse, GenerateContentConfig as GenAIContentConfig } from "@google/genai";
import { PlaybackState, SafetySetting } from '../types';
import { createWavBlobFromPcm } from '../utils/wavUtils';
import { parseAudioMimeType, AudioParameters } from '../utils/mimeUtils';

interface UseGeminiTTSProps {
  (
    ai: GoogleGenAI | null,
    audioRef: React.RefObject<HTMLAudioElement>,
    sampleRate: number,
    onPlaybackStateChange: (newState: PlaybackState) => void,
    onErrorCallback: (errorMessage: string | null) => void,
    safetySettings: SafetySetting[],
    temperature: number
  ): UseGeminiTTSReturn;
}

export interface UseGeminiTTSReturn {
  generateAndPlayAudio: (text: string, voiceId: string, voicePrompt: string, languageCode: string, playWhenReady: boolean) => Promise<string | null>;
  generateAudioForChunk: (text: string, voiceId: string, voicePrompt: string, languageCode: string) => Promise<Blob | null>;
  pauseAudio: () => void;
  resumeAudio: () => void;
  stopAudio: () => void;
  downloadAudio: (text: string, voiceId: string, voicePrompt: string, languageCode: string) => Promise<void>;
  isGenerating: boolean;
  playbackState: PlaybackState;
  error: string | null;
  canDownload: boolean;
  setCurrentText: (text: string) => void;
}

interface CustomGenerateContentConfig extends GenAIContentConfig {
  responseModalities?: ('AUDIO' | 'TEXT')[];
  speechConfig?: {
    languageCode?: string;
    voiceConfig: { prebuiltVoiceConfig: { voiceName: string } };
    audioConfig?: {
      audioEncoding: string;
      sampleRateHertz: number;
    }
  };
  temperature?: number;
  safetySettings?: SafetySetting[];
}

const TTS_MODEL_NAME = "gemini-2.5-flash-preview-tts";

const useGeminiTTS: UseGeminiTTSProps = (
  ai,
  audioRef,
  sampleRate,
  onPlaybackStateChange,
  onErrorCallback,
  safetySettings,
  temperature
) => {
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [playbackState, setPlaybackState] = useState<PlaybackState>(PlaybackState.IDLE);
  const [error, setError] = useState<string | null>(null);

  const [audioBlobUrl, setAudioBlobUrl] = useState<string | null>(null);
  const [currentAudioText, setCurrentAudioText] = useState<string | null>(null);
  const [currentAudioVoiceId, setCurrentAudioVoiceId] = useState<string | null>(null);
  const [currentAudioVoicePrompt, setCurrentAudioVoicePrompt] = useState<string | null>(null);
  const [currentAudioLanguageCode, setCurrentAudioLanguageCode] = useState<string | null>(null);

  const [textToPlay, setTextToPlay] = useState<string>("");

  const setErrorAndCallback = useCallback((message: string | null) => {
    setError(message);
    onErrorCallback(message);
  }, [onErrorCallback]);

  const setPlaybackStateAndCallback = useCallback((newState: PlaybackState) => {
    setPlaybackState(newState);
    onPlaybackStateChange(newState);
  }, [onPlaybackStateChange]);

  const handleAudioElementError = useCallback((event: Event) => {
    const audioEl = event.target as HTMLAudioElement;
    let errorMessage = "Audio element error.";
    if (audioEl && audioEl.error) {
      console.error(`GeminiTTS HTMLAudioElement error - Code: ${audioEl.error.code}, Message: ${audioEl.error.message}, Current Src: ${audioEl.currentSrc || 'N/A'}`);
      switch (audioEl.error.code) {
        case MediaError.MEDIA_ERR_ABORTED: errorMessage = "Audio playback aborted."; break;
        case MediaError.MEDIA_ERR_NETWORK: errorMessage = "Network error during audio playback."; break;
        case MediaError.MEDIA_ERR_DECODE: errorMessage = "Audio decoding error. The audio data might be corrupted or in an unsupported format."; break;
        case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED: errorMessage = "Audio source not supported or invalid format. This can happen if the MIME type and data don't match or the format is unusual."; break;
        default: errorMessage = `Unknown audio playback error (Code: ${audioEl.error.code}). Message: ${audioEl.error.message}`;
      }
    }
    setErrorAndCallback(errorMessage);
    setPlaybackStateAndCallback(PlaybackState.IDLE);
    setIsGenerating(false);
  }, [setErrorAndCallback, setPlaybackStateAndCallback]);

  useEffect(() => {
    const audioEl = audioRef.current;
    if (audioEl) {
        const handleErrorEvent = (event: Event) => handleAudioElementError(event);
        const handleEndedEvent = () => setPlaybackStateAndCallback(PlaybackState.ENDED);
        const handlePlayEvent = () => setPlaybackStateAndCallback(PlaybackState.PLAYING);
        const handlePauseEvent = () => {
            if (audioEl.currentTime > 0 && !audioEl.ended) {
                setPlaybackStateAndCallback(PlaybackState.PAUSED);
            } else if (audioEl.ended) {
                setPlaybackStateAndCallback(PlaybackState.ENDED);
            }
        };

        audioEl.addEventListener('error', handleErrorEvent);
        audioEl.addEventListener('ended', handleEndedEvent);
        audioEl.addEventListener('play', handlePlayEvent);
        audioEl.addEventListener('pause', handlePauseEvent);

        return () => {
            audioEl.removeEventListener('error', handleErrorEvent);
            audioEl.removeEventListener('ended', handleEndedEvent);
            audioEl.removeEventListener('play', handlePlayEvent);
            audioEl.removeEventListener('pause', handlePauseEvent);
        };
    }
  }, [audioRef, handleAudioElementError, setPlaybackStateAndCallback]);

  useEffect(() => {
    const urlToRevoke = audioBlobUrl;
    return () => {
      if (urlToRevoke) {
        URL.revokeObjectURL(urlToRevoke);
      }
    };
  }, [audioBlobUrl]);

  useEffect(() => {
    if (audioBlobUrl && (textToPlay !== currentAudioText)) {
      const audioEl = audioRef.current;
      if (audioEl && audioEl.src === audioBlobUrl) {
        audioEl.pause();
        audioEl.removeAttribute('src');
        audioEl.currentTime = 0;
      }
      setAudioBlobUrl(null);
      setCurrentAudioText(null);
      setCurrentAudioVoiceId(null);
      setCurrentAudioVoicePrompt(null);
      setCurrentAudioLanguageCode(null);
      if(playbackState !== PlaybackState.IDLE && playbackState !== PlaybackState.ENDED) {
        setPlaybackStateAndCallback(PlaybackState.IDLE);
      }
    }
  }, [textToPlay, audioBlobUrl, currentAudioText, audioRef, playbackState, setPlaybackStateAndCallback]);


  const commonAudioGenerationLogic = useCallback(async (
    text: string,
    voicePrompt: string,
    voiceId: string,
    languageCode: string
  ): Promise<{ base64Data: string; audioParams: AudioParameters } | null> => {
    if (!ai || !text.trim()) {
      const errorMsg = ai ? "No text to speak for audio generation." : "Gemini API not configured for audio generation.";
      throw new Error(errorMsg);
    }
    
    const fullTextContent = voicePrompt.trim() ? `${voicePrompt.trim()}: ${text}` : text;
    
    const requestConfig: CustomGenerateContentConfig = {
      responseModalities: ['AUDIO'],
      speechConfig: {
        languageCode: languageCode,
        voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceId } },
      },
      temperature: temperature,
      safetySettings: safetySettings,
    };

    const textSnippet = fullTextContent.substring(0, 100);
    console.log(`[GeminiTTS Hook STREAM GEN] Sending full text (first 100 chars): "${textSnippet}...". Length: ${fullTextContent.length}. Voice: ${voiceId}. Lang: ${languageCode}.`);

    // Use generateContentStream for robust handling of large audio responses
    const responseStream = await ai.models.generateContentStream({
        model: TTS_MODEL_NAME,
        contents: [{ parts: [{ text: fullTextContent }] }],
        config: requestConfig,
    });

    let accumulatedBase64Data = "";
    let audioParams: AudioParameters | null = null;
    let finalFinishReason: string | undefined;
    let finalSafetyRatings: any[] = [];
    let unexpectedText = "";

    for await (const chunk of responseStream) {
      const audioPart = chunk.candidates?.[0]?.content?.parts?.find(
        p => p.inlineData?.data && p.inlineData?.mimeType?.startsWith('audio/')
      );
      
      if (audioPart?.inlineData) {
        if (!audioParams) {
          audioParams = parseAudioMimeType(audioPart.inlineData.mimeType);
          console.log(`[GeminiTTS Hook STREAM GEN] Received first audio chunk. API MIME Type: ${audioPart.inlineData.mimeType}. Parsed params:`, audioParams);
        }
        accumulatedBase64Data += audioPart.inlineData.data;
      }
      
      const textPart = chunk.candidates?.[0]?.content?.parts?.find(p => p.text);
      if (textPart?.text) {
          console.warn("[GeminiTTS Hook STREAM GEN] Received unexpected text part in stream:", textPart.text);
          unexpectedText += textPart.text;
      }
      
      if (chunk.candidates?.[0]?.finishReason) {
          finalFinishReason = chunk.candidates[0].finishReason;
      }
      if (chunk.candidates?.[0]?.safetyRatings) {
          finalSafetyRatings = chunk.candidates[0].safetyRatings;
      }
    }
    
    console.log(`[GeminiTTS Hook STREAM GEN] Stream finished. Total base64 length: ${accumulatedBase64Data.length}. Reason: ${finalFinishReason}`);
    
    if (accumulatedBase64Data && audioParams) {
        return { base64Data: accumulatedBase64Data, audioParams };
    } else {
        const finishReason = finalFinishReason;
        const safetyRatings = finalSafetyRatings;
        let specificReason = "";

        if (finishReason && finishReason !== 'STOP') {
          switch (finishReason) {
            case 'SAFETY':
            case 'PROHIBITED_CONTENT':
              specificReason = "Audio generation stopped due to content safety policies. Try adjusting the 'Safety Settings' to be less restrictive (e.g., 'Block None').";
              break;
            case 'OTHER': specificReason = "The model declined to generate audio. This commonly occurs due to the specific input text, content policies, or a temporary service issue. Please review your input text or try again later."; break;
            case 'MAX_TOKENS': specificReason = "Input text is too long."; break;
            case 'RECITATION': specificReason = "Audio generation stopped due to recitation policy."; break;
            default: specificReason = `Audio generation stopped. Reason: ${finishReason}. If this is due to content, try adjusting Safety Settings.`;
          }
        } else {
          specificReason = "Stream finished but no audio data was received.";
        }
        if (safetyRatings && safetyRatings.length > 0) {
          specificReason += ` Safety Ratings: ${JSON.stringify(safetyRatings)}.`;
        }
        if (unexpectedText.trim()) {
          specificReason += ` Unexpected text response: "${unexpectedText.substring(0,100)}...".`;
        }
        throw new Error(`No audio data found. ${specificReason}`);
    }
  }, [ai, safetySettings, temperature]);


  const generateAndPlayAudio = useCallback(async (
    text: string,
    voiceId: string,
    voicePrompt: string,
    languageCode: string,
    playWhenReady: boolean
  ): Promise<string | null> => {
    if (isGenerating) {
        console.warn("[GeminiTTS Hook] Generation (play) already in progress. Ignoring new request.");
        return null;
    }

    setIsGenerating(true);
    setErrorAndCallback(null);
    if(playWhenReady) setPlaybackStateAndCallback(PlaybackState.LOADING_VOICES);

    const audioEl = audioRef.current;
    if (audioEl) {
      audioEl.pause();
      if (audioEl.src && audioEl.src.startsWith('blob:')) {
        try { URL.revokeObjectURL(audioEl.src); }
        catch (e) { console.warn("[GeminiTTS Hook] Could not revoke existing audioEl.src for play:", e); }
        audioEl.removeAttribute('src');
      }
      audioEl.currentTime = 0;
    }
    if (audioBlobUrl) { URL.revokeObjectURL(audioBlobUrl); }
    setAudioBlobUrl(null);
    setCurrentAudioText(null);
    setCurrentAudioVoiceId(null);
    setCurrentAudioVoicePrompt(null);
    setCurrentAudioLanguageCode(null);

    try {
      const audioResult = await commonAudioGenerationLogic(text, voicePrompt, voiceId, languageCode);
      if (audioResult && audioResult.base64Data) {
        console.log(`[GeminiTTS Hook Play] Creating WAV Blob from PCM data with params:`, audioResult.audioParams);
        const audioBlob = createWavBlobFromPcm(
            audioResult.base64Data, 
            audioResult.audioParams.sampleRate,
            audioResult.audioParams.channels,
            audioResult.audioParams.bitDepth
        );
        
        console.log(`[GeminiTTS Hook Play] Created Blob. Type: ${audioBlob.type}, Size: ${audioBlob.size}`);

        if (audioBlob.size === 0) {
            throw new Error(`Generated audio blob is empty (size 0 for type ${audioBlob.type}). Base64 conversion or WAV creation might have failed.`);
        }
        if (audioBlob.type.toLowerCase() === 'audio/wav' && audioBlob.size <= 44) { 
             throw new Error(`Generated WAV audio blob is too small (size ${audioBlob.size} bytes), likely containing no PCM data.`);
        }

        const newAudioUrl = URL.createObjectURL(audioBlob);

        setAudioBlobUrl(newAudioUrl);
        setCurrentAudioText(text);
        setCurrentAudioVoiceId(voiceId);
        setCurrentAudioVoicePrompt(voicePrompt);
        setCurrentAudioLanguageCode(languageCode);

        if (playWhenReady && audioEl) {
          audioEl.onloadeddata = () => {
            audioEl.play().catch(e => {
              console.error("Error playing Gemini audio (onloadeddata):", e);
              setErrorAndCallback(`Play error after loading audio: ${e instanceof Error ? e.message : String(e)}`);
              setPlaybackStateAndCallback(PlaybackState.IDLE);
            });
            audioEl.onloadeddata = null; 
          };
          audioEl.src = newAudioUrl;
          audioEl.load(); 
        } else if (!playWhenReady && playbackState === PlaybackState.LOADING_VOICES) {
            setPlaybackStateAndCallback(PlaybackState.IDLE);
        }
        setIsGenerating(false);
        return newAudioUrl;
      } else {
        throw new Error("Audio generation logic failed to return base64 data.");
      }
    } catch (err) {
      console.error("Error in generateAndPlayAudio (GeminiTTS Hook):", err);
      const message = err instanceof Error ? `Gemini TTS error: ${err.message}` : String(err);
      setErrorAndCallback(message);
      if (playbackState === PlaybackState.LOADING_VOICES && playWhenReady) {
           setPlaybackStateAndCallback(PlaybackState.IDLE);
      }
      setIsGenerating(false);
      return null;
    }
  }, [audioRef, setErrorAndCallback, setPlaybackStateAndCallback, audioBlobUrl, playbackState, commonAudioGenerationLogic, isGenerating]);

  const generateAudioForChunk = useCallback(async (
    text: string,
    voiceId: string,
    voicePrompt: string,
    languageCode: string
  ): Promise<Blob | null> => {
    try {
      console.log(`[GeminiTTS Hook CHUNK GEN] Requesting audio for chunk. Length: ${text.length}, Prompt: "${voicePrompt.substring(0,50)}..."`);
      const audioResult = await commonAudioGenerationLogic(text, voicePrompt, voiceId, languageCode);
      if (audioResult && audioResult.base64Data) {
        console.log(`[GeminiTTS Hook CHUNK GEN] Creating WAV Blob from PCM data with params:`, audioResult.audioParams);
        const audioBlob = createWavBlobFromPcm(
            audioResult.base64Data,
            audioResult.audioParams.sampleRate,
            audioResult.audioParams.channels,
            audioResult.audioParams.bitDepth
        );
        
        console.log(`[GeminiTTS Hook CHUNK GEN] Created Blob. Type: ${audioBlob.type}, Size: ${audioBlob.size}`);

         if (audioBlob.size === 0) {
            throw new Error(`Generated audio blob for chunk is empty (size 0 for type ${audioBlob.type}).`);
        }
        if (audioBlob.type.toLowerCase() === 'audio/wav' && audioBlob.size <= 44) {
             throw new Error(`Generated WAV audio blob for chunk is too small (size ${audioBlob.size} bytes).`);
        }
        return audioBlob;
      }
      return null;
    } catch (err) {
      console.error("Error in generateAudioForChunk (GeminiTTS Hook):", err);
      throw err; 
    }
  }, [commonAudioGenerationLogic]);


  const pauseAudio = useCallback(() => {
    audioRef.current?.pause();
  }, [audioRef]);

  const resumeAudio = useCallback(() => {
    if (audioRef.current && audioRef.current.src && audioRef.current.paused && audioRef.current.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) {
      audioRef.current.play().catch(e => {
        console.error("Error resuming Gemini audio:", e);
        setErrorAndCallback("Error resuming audio.");
      });
    } else if (audioRef.current && currentAudioText && currentAudioVoiceId && currentAudioVoicePrompt !== null && currentAudioLanguageCode !== null) {
      generateAndPlayAudio(currentAudioText, currentAudioVoiceId, currentAudioVoicePrompt, currentAudioLanguageCode, true);
    }
  }, [audioRef, currentAudioText, currentAudioVoiceId, currentAudioVoicePrompt, currentAudioLanguageCode, generateAndPlayAudio, setErrorAndCallback]);

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      if (audioRef.current.src) { 
        audioRef.current.currentTime = 0;
      }
    }
    if (playbackState !== PlaybackState.IDLE && playbackState !== PlaybackState.ENDED) {
        setPlaybackStateAndCallback(PlaybackState.IDLE);
    }
    if (isGenerating) { 
        setIsGenerating(false);
    }
  }, [audioRef, playbackState, isGenerating, setPlaybackStateAndCallback]);

  const downloadAudio = useCallback(async (text: string, voiceId: string, voicePrompt: string, languageCode: string) => {
    setErrorAndCallback(null);
    let urlToDownload = null;
    let createdBlobForDownload: Blob | null = null; 

    const paramsMatch = audioBlobUrl &&
                        text === currentAudioText &&
                        voiceId === currentAudioVoiceId &&
                        voicePrompt === currentAudioVoicePrompt &&
                        languageCode === currentAudioLanguageCode;

    if (paramsMatch) { 
       urlToDownload = audioBlobUrl;
    }


    if (!urlToDownload) { 
      const previousIsGeneratingState = isGenerating; 
      setIsGenerating(true); 

      try {
        const audioResult = await commonAudioGenerationLogic(text, voicePrompt, voiceId, languageCode);
        if (audioResult && audioResult.base64Data) {
            console.log(`[GeminiTTS Hook Download] Creating WAV Blob from PCM data with params:`, audioResult.audioParams);
            createdBlobForDownload = createWavBlobFromPcm(
                audioResult.base64Data, 
                audioResult.audioParams.sampleRate,
                audioResult.audioParams.channels,
                audioResult.audioParams.bitDepth
            );

            if (createdBlobForDownload.size > 0 && !(createdBlobForDownload.type.toLowerCase() === 'audio/wav' && createdBlobForDownload.size <=44) ) { 
                urlToDownload = URL.createObjectURL(createdBlobForDownload);
            } else {
                 throw new Error("Generated audio blob for download is empty or too small.");
            }
        } else {
            throw new Error("Failed to generate audio data for download.");
        }
      } catch (genError) {
         console.error("Error generating audio for download:", genError);
         const message = genError instanceof Error ? genError.message : String(genError);
         setErrorAndCallback(`Download error: ${message}`);
         setIsGenerating(previousIsGeneratingState); 
         if (createdBlobForDownload && urlToDownload) URL.revokeObjectURL(urlToDownload); 
         return;
      } finally {
        setIsGenerating(previousIsGeneratingState); 
      }
    }


    if (urlToDownload) {
      const link = document.createElement('a');
      link.href = urlToDownload;
      const extension = '.wav';
      const voiceNamePart = voiceId.replace(/[^a-z0-9]/gi, '_') || 'audio';
      link.download = `gemini_tts_${voiceNamePart}_${Date.now()}${extension}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      if (createdBlobForDownload && urlToDownload !== audioBlobUrl) {
        setTimeout(() => URL.revokeObjectURL(urlToDownload!), 100);
      }
    } else {
      if (!error) { 
        setErrorAndCallback("Failed to retrieve or generate audio for download.");
      }
    }
  }, [
      audioBlobUrl, currentAudioText, currentAudioVoiceId, currentAudioVoicePrompt, currentAudioLanguageCode,
      commonAudioGenerationLogic, setErrorAndCallback, error, isGenerating
  ]);

  const canDownload = !!ai && textToPlay.trim().length > 0;


  return {
    generateAndPlayAudio,
    generateAudioForChunk,
    pauseAudio,
    resumeAudio,
    stopAudio,
    downloadAudio,
    isGenerating,
    playbackState,
    error,
    canDownload,
    setCurrentText: setTextToPlay,
  };
};

export default useGeminiTTS;