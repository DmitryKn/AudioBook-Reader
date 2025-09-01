

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import BookInput from './components/BookInput';
import Controls from './components/Controls';
import AudiobookGenerator from './components/AudiobookGenerator'; // New component
import useSpeechSynthesis from './hooks/useSpeechSynthesis';
import useGeminiTTS from './hooks/useGeminiTTS';
import { PlaybackState, TTSEngine, GeminiTTSVoice, AudiobookChunk, ExtractedChapter, SafetySetting, HarmCategory, HarmBlockThreshold } from './types';
import { GoogleGenAI } from "@google/genai";
import { extractChaptersFromFb2, createAudiobookChunks, CreateChunksProgress, MAX_TTS_TOKENS } from './utils/audiobookUtils'; // Updated utils
import { transliterate } from './utils/transliterate';

// Declare JSZip for TypeScript since it's loaded from CDN
declare var JSZip: any;

// Ensure API_KEY is handled by the environment as per guidelines
const API_KEY = process.env.API_KEY;

// Valid voice names for Gemini TTS.
const GEMINI_TTS_VOICES: GeminiTTSVoice[] = [
  { id: 'puck', name: 'Puck (M)'},
  { id: 'charon', name: 'Charon (M)'},
  { id: 'algenib', name: 'Algenib (M)'},
  { id: 'enceladus', name: 'Enceladus (M)'},
  { id: 'kore', name: 'Kore (F)'},
  { id: 'achernar', name: 'Achernar  (F)'},
  { id: 'gacrux', name: 'Gacrux  (F)'},
  { id: 'zephyr', name: 'Zephyr  (F)'},
];

const GEMINI_LANGUAGES = [
  { code: 'ru-RU', name: 'Russian' },
  { code: 'en-US', name: 'English (US)' },
];

export const GEMINI_AUDIO_SAMPLE_RATE = 24000;

// Application's hardcoded default prompt
const APP_DEFAULT_GEMINI_VOICE_PROMPT = "Read with a thoughtful tone that matches the atmosphere of the adventure. Make the dialogue dramatic and emotional with small pauses:";
const USER_DEFAULT_GEMINI_PROMPT_KEY = 'userDefaultGeminiVoicePrompt';
const DEFAULT_GEMINI_TEMPERATURE = 1.0;

// Default safety settings - set to be permissive for fantasy books etc.
const initialSafetySettings: SafetySetting[] = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];


const App: React.FC = () => {
  const [bookText, setBookText] = useState<string>('');
  const [selectedBrowserVoiceName, setSelectedBrowserVoiceName] = useState<string>('');
  const [browserRate, setBrowserRate] = useState<number>(1);
  const [pitch, setPitch] = useState<number>(1);
  const [isParsingFb2, setIsParsingFb2] = useState<boolean>(false); 
  const [fb2ParseError, setFb2ParseError] = useState<string | null>(null); 
  const [fb2FileName, setFb2FileName] = useState<string>('Audiobook'); 
  const [isFb2FileUploaded, setIsFb2FileUploaded] = useState<boolean>(false); 

  const {
    speak: speakBrowser,
    pause: pauseBrowser,
    resume: resumeBrowser,
    cancel: cancelBrowser,
    voices: browserVoices,
    playbackState: browserPlaybackState
  } = useSpeechSynthesis();

  const [ttsEngine, setTtsEngine] = useState<TTSEngine>(API_KEY ? TTSEngine.GEMINI : TTSEngine.BROWSER);
  const defaultGeminiVoice = GEMINI_TTS_VOICES.find(v => v.id === 'puck') || GEMINI_TTS_VOICES[0];
  const [selectedGeminiVoiceId, setSelectedGeminiVoiceId] = useState<string>(defaultGeminiVoice?.id || '');
  const [geminiLanguageCode, setGeminiLanguageCode] = useState<string>('ru-RU');
  const [geminiTemperature, setGeminiTemperature] = useState<number>(DEFAULT_GEMINI_TEMPERATURE);
  
  // State for the active default prompt (from localStorage or app default)
  const [activeDefaultGeminiVoicePrompt, setActiveDefaultGeminiVoicePrompt] = useState<string>(APP_DEFAULT_GEMINI_VOICE_PROMPT);
  // State for the current text in the prompt textarea
  const [geminiVoicePrompt, setGeminiVoicePrompt] = useState<string>(activeDefaultGeminiVoicePrompt); 

  const [safetySettings, setSafetySettings] = useState<SafetySetting[]>(initialSafetySettings);

  const audioRef = useRef<HTMLAudioElement>(null);
  const [overallPlaybackState, setOverallPlaybackState] = useState<PlaybackState>(PlaybackState.IDLE);
  const [activeError, setActiveError] = useState<string | null>(null);

  const [currentTokenCount, setCurrentTokenCount] = useState<number>(0);
  const [isCountingTokens, setIsCountingTokens] = useState<boolean>(false);
  const [tokenCountError, setTokenCountError] = useState<string | null>(null);
  const debounceTimeoutRef = useRef<number | null>(null);

  const [audiobookChunks, setAudiobookChunks] = useState<AudiobookChunk[]>([]);
  const [isGeneratingAudiobook, setIsGeneratingAudiobook] = useState<boolean>(false);
  const [currentAudiobookTaskMessage, setCurrentAudiobookTaskMessage] = useState<string>('');
  const [currentAudiobookProgress, setCurrentAudiobookProgress] = useState<number>(0); 
  const audiobookProcessingCancelledRef = useRef<boolean>(false);

  // Effect to load user's default prompt from localStorage on mount
  useEffect(() => {
    const savedUserDefault = localStorage.getItem(USER_DEFAULT_GEMINI_PROMPT_KEY);
    if (savedUserDefault) {
      setActiveDefaultGeminiVoicePrompt(savedUserDefault);
      setGeminiVoicePrompt(savedUserDefault); // Initialize textarea with user's default
    } else {
      setActiveDefaultGeminiVoicePrompt(APP_DEFAULT_GEMINI_VOICE_PROMPT);
      setGeminiVoicePrompt(APP_DEFAULT_GEMINI_VOICE_PROMPT); // Initialize with app default
    }
  }, []);


  const ai = useMemo(() => {
    if (!API_KEY) {
      console.warn("API_KEY for Gemini is not set. Gemini TTS and token counting will not be available.");
      return null;
    }
    return new GoogleGenAI({ apiKey: API_KEY });
  }, []);

  const {
    generateAndPlayAudio: generateAndPlayGemini,
    generateAudioForChunk, 
    pauseAudio: pauseGemini,
    resumeAudio: resumeGemini,
    stopAudio: stopGemini,
    downloadAudio: downloadGeminiAudioFile,
    isGenerating: isGeminiGeneratingForSinglePlay, 
    playbackState: _geminiPlaybackState_from_hook, 
    error: _geminiError_from_hook, 
    canDownload: canDownloadGeminiAudio,
    setCurrentText: setGeminiTextToPlay, 
  } = useGeminiTTS(
    ai, 
    audioRef, 
    GEMINI_AUDIO_SAMPLE_RATE,
    (newState) => { 
        if (ttsEngine === TTSEngine.GEMINI && !isGeneratingAudiobook) { 
            setOverallPlaybackState(newState);
        }
    },
    (newError) => { 
        if (ttsEngine === TTSEngine.GEMINI && !isGeneratingAudiobook) { 
            setActiveError(newError);
        }
    },
    safetySettings,
    geminiTemperature
  );

  useEffect(() => {
    setGeminiTextToPlay(bookText);
  }, [bookText, setGeminiTextToPlay]);

  useEffect(() => {
    if (!ai || !bookText.trim()) { 
      setCurrentTokenCount(0); setIsCountingTokens(false); setTokenCountError(null);
      if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);
      return;
    }
    
    setIsCountingTokens(true); setTokenCountError(null);
    if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);

    debounceTimeoutRef.current = window.setTimeout(async () => {
      try {
        const fullTextToCount = geminiVoicePrompt.trim() ? `${geminiVoicePrompt.trim()}: ${bookText}` : bookText;
        const response = await ai.models.countTokens({
          model: 'gemini-2.5-flash', 
          contents: [{ parts: [{ text: fullTextToCount }] }],
        });
        setCurrentTokenCount(response.totalTokens);
      } catch (error) {
        console.error("Error counting tokens for BookInput:", error);
        setTokenCountError("Failed to count tokens for display."); setCurrentTokenCount(0);
      } finally {
        setIsCountingTokens(false);
      }
    }, 500);
    return () => { if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current); };
  }, [bookText, ai, geminiVoicePrompt]);

  const filteredBrowserVoices = useMemo(() => browserVoices.filter(voice => voice.lang.toLowerCase().startsWith('en') || voice.lang.toLowerCase().startsWith('ru')), [browserVoices]);

  useEffect(() => {
    if (filteredBrowserVoices.length > 0) { 
      const currentSelectedVoiceIsValid = filteredBrowserVoices.some(v => v.name === selectedBrowserVoiceName);
      if (!selectedBrowserVoiceName || !currentSelectedVoiceIsValid) {
        const browserLang = navigator.language.toLowerCase().split('-')[0];
        const defaultVoice =
          filteredBrowserVoices.find(voice => voice.default && (voice.lang.toLowerCase().startsWith('en') || voice.lang.toLowerCase().startsWith('ru'))) ||
          ( (browserLang === 'en' || browserLang === 'ru') ? filteredBrowserVoices.find(voice => voice.lang.toLowerCase().startsWith(browserLang)) : undefined) ||
          filteredBrowserVoices.find(voice => voice.lang.toLowerCase().startsWith('en')) ||
          filteredBrowserVoices[0];
        if (defaultVoice) setSelectedBrowserVoiceName(defaultVoice.name);
        else setSelectedBrowserVoiceName('');
      }
    } else {
      setSelectedBrowserVoiceName('');
    }
  }, [filteredBrowserVoices, selectedBrowserVoiceName]); 

  useEffect(() => {
    if (ttsEngine === TTSEngine.BROWSER) {
      setOverallPlaybackState(browserPlaybackState);
    }
  }, [browserPlaybackState, ttsEngine]);

  const handlePlayPause = useCallback(async () => {
    setActiveError(null);
    if (isGeneratingAudiobook) {
        setActiveError("Audiobook generation is in progress. Please wait or cancel.");
        return;
    }
    if (!bookText.trim()) {
      setActiveError("Text is empty. Cannot play."); return;
    }

    if (ttsEngine === TTSEngine.GEMINI && currentTokenCount > MAX_TTS_TOKENS) {
      setActiveError(`Text is too long for direct playback (${currentTokenCount}/${MAX_TTS_TOKENS} tokens). Please use the "Generate Audiobook" feature below to process long content in parts.`); 
      return;
    }
    
    if (ttsEngine === TTSEngine.BROWSER) {
      const currentBrowserVoice = filteredBrowserVoices.find(v => v.name === selectedBrowserVoiceName) || null;
      if (browserPlaybackState === PlaybackState.PLAYING) pauseBrowser();
      else if (browserPlaybackState === PlaybackState.PAUSED) resumeBrowser();
      else speakBrowser(bookText, currentBrowserVoice, browserRate, pitch);
    } else if (ttsEngine === TTSEngine.GEMINI) {
      if (overallPlaybackState === PlaybackState.PLAYING) pauseGemini();
      else if (overallPlaybackState === PlaybackState.PAUSED) resumeGemini();
      else await generateAndPlayGemini(bookText, selectedGeminiVoiceId, geminiVoicePrompt, geminiLanguageCode, true);
    }
  }, [
    bookText, selectedBrowserVoiceName, filteredBrowserVoices, browserRate, pitch, browserPlaybackState,
    speakBrowser, pauseBrowser, resumeBrowser, ttsEngine, overallPlaybackState,
    selectedGeminiVoiceId, geminiVoicePrompt, geminiLanguageCode, generateAndPlayGemini, pauseGemini, resumeGemini, 
    currentTokenCount, isGeneratingAudiobook
  ]);

  const handleStop = useCallback(() => {
    if (isGeneratingAudiobook) { return; }
    if (ttsEngine === TTSEngine.BROWSER) cancelBrowser();
    else if (ttsEngine === TTSEngine.GEMINI) stopGemini();
    setActiveError(null);
  }, [cancelBrowser, stopGemini, ttsEngine, isGeneratingAudiobook]);

  const handleTtsEngineChange = (engine: TTSEngine) => {
    if (isGeneratingAudiobook) { return; } 
    handleStop(); 
    setTtsEngine(engine);
    setActiveError(null); 
  };
  
  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setAudiobookChunks([]);
    setIsGeneratingAudiobook(false);
    setCurrentAudiobookTaskMessage('');
    setCurrentAudiobookProgress(0);
    audiobookProcessingCancelledRef.current = false;
    setIsFb2FileUploaded(false);

    setIsParsingFb2(true); setFb2ParseError(null); setBookText('');
    
    const baseName = file.name.replace(/\.(fb2|zip|txt|docx|doc)$/i, '');
    const transliteratedName = transliterate(baseName);
    setFb2FileName(transliteratedName.replace(/[^a-zA-Z0-9_-]/g, '_') || 'Audiobook');

    try {
        const content = await file.arrayBuffer();
        let extractedTextContent = "";
        const isFb2 = file.name.endsWith(".fb2") || file.name.endsWith(".fb2.zip");

        if (isFb2) {
            let fb2ContentBuffer: ArrayBuffer;
            if (file.name.endsWith(".fb2.zip")) {
                if (typeof JSZip === 'undefined') throw new Error("JSZip library not loaded.");
                const zip = await JSZip.loadAsync(content);
                const fb2FileInZip = Object.keys(zip.files).find(fileName => fileName.endsWith(".fb2") && !zip.files[fileName].dir);
                if (fb2FileInZip) {
                    fb2ContentBuffer = await zip.file(fb2FileInZip)!.async("arraybuffer");
                } else {
                    throw new Error("No .fb2 file found in zip.");
                }
            } else { // is .fb2
                fb2ContentBuffer = content;
            }
            
            // New robust parsing logic
            const firstChunkStr = new TextDecoder('utf-8').decode(fb2ContentBuffer.slice(0, 1024));
            const encodingMatch = firstChunkStr.match(/encoding=["'](.*?)["']/i);
            const declaredEncoding = encodingMatch ? encodingMatch[1].toLowerCase() : null;

            const encodingsToTry = [...new Set([declaredEncoding, 'windows-1251', 'utf-8', 'koi8-r', 'iso-8859-5'].filter(Boolean))] as string[];

            let successfullyParsed = false;
            for (const encoding of encodingsToTry) {
                console.log(`[File Handler] Attempting to parse FB2 with encoding: ${encoding}`);
                try {
                    const decodedXml = new TextDecoder(encoding).decode(fb2ContentBuffer);
                    const chapters = extractChaptersFromFb2(decodedXml);
                    if (chapters.length > 0 && chapters[0].content.trim()) {
                        extractedTextContent = chapters[0].content;
                        successfullyParsed = true;
                        console.log(`[File Handler] Successfully parsed with encoding: ${encoding}`);
                        break; // Success!
                    }
                } catch (e) {
                    console.warn(`[File Handler] Failed to parse with encoding ${encoding}.`, e);
                }
            }

            if (!successfullyParsed) {
                throw new Error("Could not parse the FB2 file. It may be corrupted or use an unsupported text encoding.");
            }
            setIsFb2FileUploaded(true);
        } else if (file.name.endsWith(".txt")) {
            extractedTextContent = new TextDecoder().decode(content);
        } else if (file.name.endsWith(".docx")) {
            if (typeof JSZip === 'undefined') throw new Error("JSZip library not loaded for DOCX.");
            const zip = await JSZip.loadAsync(content);
            const docXmlFile = zip.file("word/document.xml");
            if (docXmlFile) {
                const docXmlString = await docXmlFile.async("string");
                const parser = new DOMParser();
                const xmlDoc = parser.parseFromString(docXmlString, "application/xml");
                
                let paragraphsText = "";
                const pElements = xmlDoc.getElementsByTagNameNS("*", "p");
                for (let i = 0; i < pElements.length; i++) {
                    const tElements = pElements[i].getElementsByTagNameNS("*", "t");
                    let currentParaText = "";
                    for (let j = 0; j < tElements.length; j++) {
                        currentParaText += tElements[j].textContent;
                    }
                    if (currentParaText.trim()) {
                        paragraphsText += currentParaText.trim() + "\n\n";
                    }
                }
                extractedTextContent = paragraphsText.trim();
                if (!extractedTextContent) console.warn("No text content extracted from DOCX file, though file was parsed.");
            } else {
                throw new Error("Invalid DOCX file structure (missing word/document.xml).");
            }
        } else if (file.name.endsWith(".doc")) {
            throw new Error("Unsupported file type: .doc files are not directly supported by this application due to their complex binary format. Please convert to .txt or .docx and try again.");
        } else {
            throw new Error("Unsupported file type. Please upload .fb2, .fb2.zip, .txt, or .docx.");
        }
        
        setBookText(extractedTextContent);

    } catch (error) {
        console.error("Error processing file:", error);
        setFb2ParseError(error instanceof Error ? `File error: ${error.message}` : "Unknown file processing error.");
        setBookText('');
        setIsFb2FileUploaded(false);
    } finally {
        setIsParsingFb2(false);
        if (event.target) event.target.value = '';
    }
  };


  const handleDownloadRequest = async () => {
    if (isGeneratingAudiobook) { setActiveError("Audiobook generation in progress."); return; }
    if (ttsEngine === TTSEngine.BROWSER) {
        alert("Audio Download Information (Browser TTS):\n\nDirectly saving audio from browser's TTS is not supported. Try Gemini TTS for downloadable audio, or use the 'Generate Audiobook' feature.");
    } else if (ttsEngine === TTSEngine.GEMINI) {
        if (!bookText.trim() || !ai) { setActiveError("Cannot download: Text is empty or Gemini API not configured."); return; }
        if (currentTokenCount > MAX_TTS_TOKENS) { 
          setActiveError(`Text exceeds token limit of ${MAX_TTS_TOKENS} for single download. Please use the "Generate Audiobook" feature to download in parts.`); 
          return; 
        }
        await downloadGeminiAudioFile(bookText, selectedGeminiVoiceId, geminiVoicePrompt, geminiLanguageCode);
    }
  };

  const handleStartAudiobookGeneration = useCallback(async () => {
    if (!ai) { setActiveError("Gemini API not configured. Cannot generate audiobook."); return; }
    if (!bookText.trim()) { setActiveError("Book text is empty. Cannot generate audiobook."); return; }
    if (isGeneratingAudiobook) return;

    setIsGeneratingAudiobook(true);
    setAudiobookChunks([]);
    setActiveError(null);
    setCurrentAudiobookProgress(0); 
    audiobookProcessingCancelledRef.current = false;
    
    try {
        setCurrentAudiobookTaskMessage("Preparing text...");
        if (!bookText.trim()) {
            throw new Error("No text content available to generate audiobook.");
        }
        // The logic is now the same for all text sources because `bookText` is always clean text.
        const inputForChunking: ExtractedChapter[] = [{ title: fb2FileName || "Book Content", content: bookText }];

        const handleChunkCreationProgress = (progress: CreateChunksProgress) => {
            switch (progress.type) {
                case 'preprocessing':
                    setCurrentAudiobookTaskMessage(progress.message);
                    setCurrentAudiobookProgress(5); 
                    break;
                case 'aggregation_heuristic': // Corrected from 'aggregation'
                    const totalItems = progress.totalItems || 0;
                    const processedItems = progress.processedItems || 0;
                    const percent = totalItems > 0 ? Math.round((processedItems / totalItems) * 100) : 5; 
                    setCurrentAudiobookTaskMessage(
                        `Creating text chunks: ${percent}% done (Processing segment ${processedItems}/${totalItems}. Found ${progress.currentChunkCount || 0} chunks)...`
                    );
                    setCurrentAudiobookProgress(percent);
                    break;
                case 'done':
                    setCurrentAudiobookTaskMessage(progress.message);
                    setCurrentAudiobookProgress(100); 
                    break;
                case 'error':
                    setCurrentAudiobookTaskMessage(`Chunk Creation Error: ${progress.message}`);
                    setActiveError(`Chunk Creation Error: ${progress.message}`);
                    break;
                case 'charsplit_initial':
                case 'charsplit_fine':
                case 'validation':
                    setCurrentAudiobookTaskMessage(progress.message);
                    if (progress.totalItems && progress.processedItems) {
                        const validationPercent = Math.round((progress.processedItems / progress.totalItems) * 100);
                        if (progress.type === 'validation') {
                        setCurrentAudiobookProgress(Math.max(currentAudiobookProgress, 80 + (validationPercent * 0.2))); 
                        }
                    }
                    break;
                default:
                    console.warn("Unhandled progress type in App.tsx:", progress.type, progress.message);
                    setCurrentAudiobookTaskMessage(progress.message);
                    break;
            }
        };
      
      const newBookTitle = fb2FileName || "Audiobook"; 
      
      const chunks = await createAudiobookChunks(inputForChunking, ai, newBookTitle, handleChunkCreationProgress, geminiVoicePrompt); 

      if (chunks.length === 0) {
        if (!activeError) {
             throw new Error("Could not create any text chunks from the input. The content might be empty or unprocessable.");
        } else {
            setIsGeneratingAudiobook(false);
            return;
        }
      }
      setAudiobookChunks(chunks);
      setCurrentAudiobookProgress(0); 
      
      for (let i = 0; i < chunks.length; i++) {
        if (audiobookProcessingCancelledRef.current) {
          setCurrentAudiobookTaskMessage("Audiobook generation cancelled.");
          break;
        }
        
        const currentChunk = chunks[i];
        setAudiobookChunks(prev => prev.map(c => c.id === currentChunk.id ? { ...c, status: 'generating' } : c));
        
        const progress = Math.round(((i + 1) / chunks.length) * 100);
        setCurrentAudiobookProgress(progress);
        setCurrentAudiobookTaskMessage(`Generating audio for Part ${i + 1} of ${chunks.length} (${currentChunk.fileName})...`);

        if (currentChunk.fileName.endsWith('_OVERSIZED.wav')) {
          console.warn(`Skipping API call for oversized chunk: ${currentChunk.fileName}`);
          setAudiobookChunks(prev => prev.map(c =>
            c.id === currentChunk.id ? { 
                ...c, 
                status: 'error', 
                errorDetails: `Text segment is too large (exceeds ${MAX_TTS_TOKENS} tokens) and cannot be processed into audio.` 
            } : c
          ));
          setCurrentAudiobookTaskMessage(`Skipped oversized Part ${i + 1} of ${chunks.length} (${currentChunk.fileName}).`);
          continue; 
        }
         if (currentChunk.status === 'error' && currentChunk.fileName.endsWith('_TOKEN_ERR.wav')) { 
            console.warn(`Skipping API call for chunk with prior token counting error: ${currentChunk.fileName}`);
            setCurrentAudiobookTaskMessage(`Skipped Part ${i + 1} (token counting error) of ${chunks.length} (${currentChunk.fileName}).`);
            continue;
        }
        
        const MAX_RETRIES = 2; // Initial attempt + 2 retries
        const RETRY_DELAY_MS = 1500;
        let success = false;
        let lastError: any = null;

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            if (audiobookProcessingCancelledRef.current) break;
            
            try {
                if (attempt > 0) {
                    setCurrentAudiobookTaskMessage(`Retrying Part ${i + 1} (Attempt ${attempt + 1}/${MAX_RETRIES + 1})...`);
                    await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * attempt)); // Increased delay for subsequent retries
                }
                
                const audioBlob = await generateAudioForChunk(currentChunk.text, selectedGeminiVoiceId, geminiVoicePrompt, geminiLanguageCode);
                if (audioBlob) {
                    const blobUrl = URL.createObjectURL(audioBlob);
                    setAudiobookChunks(prev => prev.map(c =>
                        c.id === currentChunk.id ? { ...c, status: 'success', audioBlob, audioBlobUrl: blobUrl } : c
                    ));
                    success = true;
                    break; // Exit retry loop on success
                } else {
                    throw new Error("Model returned no audio data for this chunk.");
                }
            } catch (chunkError: any) {
                lastError = chunkError;
                console.error(`Error generating audio for chunk ${currentChunk.fileName} (Attempt ${attempt + 1}):`, chunkError);
            }
        }

        if (!success) {
            const errorMessage = lastError?.message || (typeof lastError === 'string' ? lastError : 'Unknown chunk error after retries');
            setAudiobookChunks(prev => prev.map(c =>
                c.id === currentChunk.id ? { ...c, status: 'error', errorDetails: errorMessage } : c
            ));
        }
      }
      if (!audiobookProcessingCancelledRef.current) {
        setCurrentAudiobookTaskMessage("Audiobook generation complete.");
        if (chunks.length > 0) setCurrentAudiobookProgress(100);
      }
    } catch (error: any) {
      console.error("Error in audiobook generation process:", error);
      setActiveError(`Audiobook Generation Error: ${error.message}`);
      setCurrentAudiobookTaskMessage(`Error: ${error.message}`);
      setCurrentAudiobookProgress(0); 
    } finally {
      setIsGeneratingAudiobook(false);
      const taskMsgLower = currentAudiobookTaskMessage.toLowerCase();
      if (taskMsgLower.includes("generating") || taskMsgLower.includes("preparing") || taskMsgLower.includes("creating") || taskMsgLower.includes("skipped") || taskMsgLower.includes("analyzing") || taskMsgLower.includes("preprocessing")) {
        setCurrentAudiobookTaskMessage(audiobookProcessingCancelledRef.current ? "Audiobook generation cancelled." : "Audiobook generation finished (check parts for errors).");
      }
      if (!isGeneratingAudiobook && !audiobookProcessingCancelledRef.current && audiobookChunks.length === 0 && !activeError) { 
        setCurrentAudiobookProgress(0);
      }
    }
  }, [ai, bookText, fb2FileName, generateAudioForChunk, selectedGeminiVoiceId, geminiVoicePrompt, geminiLanguageCode, isGeneratingAudiobook, activeError, currentAudiobookProgress, safetySettings]);


  const handleDownloadSingleChunk = useCallback((chunkId: string) => {
    const chunk = audiobookChunks.find(c => c.id === chunkId);
    if (chunk && chunk.audioBlobUrl && chunk.status === 'success') {
      const link = document.createElement('a');
      link.href = chunk.audioBlobUrl;
      link.download = chunk.fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      setActiveError("Could not download this chunk. Audio not available or generation failed.");
    }
  }, [audiobookChunks]);

  const handleDownloadAllChunks = useCallback(async () => {
    if (typeof JSZip === 'undefined') {
      setActiveError("JSZip library not loaded. Cannot create ZIP file.");
      return;
    }
    const successfulChunks = audiobookChunks.filter(c => c.status === 'success' && c.audioBlob);
    if (successfulChunks.length === 0) {
      setActiveError("No successfully generated audio parts to download.");
      return;
    }
    setCurrentAudiobookTaskMessage("Preparing ZIP file...");
    setCurrentAudiobookProgress(0); 
    try {
      const zip = new JSZip();
      for (const chunk of successfulChunks) {
        if (chunk.audioBlob) { 
           zip.file(chunk.fileName, chunk.audioBlob);
        }
      }
      const zipBlob = await zip.generateAsync({ type: "blob" }, (metadata: { percent: number }) => {
        setCurrentAudiobookProgress(Math.round(metadata.percent)); 
      });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(zipBlob);
      link.download = `${fb2FileName || 'Audiobook'}_All_Parts.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href); 
      setCurrentAudiobookTaskMessage("ZIP file download initiated.");
      setCurrentAudiobookProgress(100); 
    } catch (error: any) {
      console.error("Error creating ZIP file:", error);
      setActiveError(`Failed to create ZIP: ${error.message}`);
      setCurrentAudiobookTaskMessage(`Error creating ZIP: ${error.message}`);
      setCurrentAudiobookProgress(0);
    } finally {
        setTimeout(() => {
            if (!isGeneratingAudiobook && (currentAudiobookTaskMessage.includes("ZIP") || currentAudiobookTaskMessage.includes("zip"))) {
                 setCurrentAudiobookTaskMessage("");
                 setCurrentAudiobookProgress(0);
            }
        }, 3000);
    }
  }, [audiobookChunks, fb2FileName, isGeneratingAudiobook, currentAudiobookTaskMessage]);
  
  const handleCancelAudiobookGeneration = useCallback(() => {
    audiobookProcessingCancelledRef.current = true;
    setIsGeneratingAudiobook(false); 
    setCurrentAudiobookTaskMessage("Cancelling audiobook generation...");
  }, []);

  const handleResetGeminiVoicePrompt = useCallback(() => {
    setGeminiVoicePrompt(activeDefaultGeminiVoicePrompt); // Reset to active default
    setActiveError(null);
  }, [activeDefaultGeminiVoicePrompt]);

  const handleSetCurrentPromptAsDefault = useCallback(() => {
    localStorage.setItem(USER_DEFAULT_GEMINI_PROMPT_KEY, geminiVoicePrompt);
    setActiveDefaultGeminiVoicePrompt(geminiVoicePrompt);
    setActiveError(null);
    // Optionally, add a small success message/toast here
  }, [geminiVoicePrompt]);

  const handleSafetySettingChange = (category: HarmCategory, threshold: HarmBlockThreshold) => {
      setSafetySettings(prev =>
        prev.map(setting =>
          setting.category === category ? { ...setting, threshold } : setting
        )
      );
      setActiveError(null);
  };

  const handleClearAndReset = useCallback(() => {
    handleStop(); 

    if (isGeneratingAudiobook) {
      handleCancelAudiobookGeneration();
    }

    setBookText('');
    setFb2FileName('Audiobook');
    setIsFb2FileUploaded(false);
    setActiveError(null);
    setFb2ParseError(null);
    setGeminiVoicePrompt(activeDefaultGeminiVoicePrompt); // Reset to active default
    setGeminiTemperature(DEFAULT_GEMINI_TEMPERATURE); // Reset Gemini temperature
    setSafetySettings(initialSafetySettings); // Reset safety settings
    
    setAudiobookChunks([]);
    setCurrentAudiobookTaskMessage('');
    setCurrentAudiobookProgress(0);
    audiobookProcessingCancelledRef.current = false;
  }, [handleStop, isGeneratingAudiobook, handleCancelAudiobookGeneration, activeDefaultGeminiVoicePrompt]);


  const isTextEmpty = bookText.trim().length === 0;
  const currentEngineIsGenerating = (ttsEngine === TTSEngine.GEMINI && (isGeminiGeneratingForSinglePlay || isGeneratingAudiobook)) ||
                                   (ttsEngine === TTSEngine.BROWSER && browserPlaybackState === PlaybackState.LOADING_VOICES);

  const generalInputDisabled = (overallPlaybackState === PlaybackState.PLAYING || overallPlaybackState === PlaybackState.PAUSED || isParsingFb2 || currentEngineIsGenerating || isGeneratingAudiobook);


  return (
    <div className="min-h-screen bg-slate-100 flex flex-col items-center py-8 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-3xl space-y-8">
        <header className="text-center">
          <h1 className="text-4xl font-extrabold text-slate-800 tracking-tight">
            Audio<span className="text-indigo-600">Book</span> Reader
          </h1>
          <p className="mt-2 text-lg text-slate-600">
            Listen to your favorite texts. Upload FB2, TXT, DOCX, paste text, use Browser or Gemini TTS.
          </p>
          {!API_KEY && (
            <p className="mt-2 text-sm text-amber-700 bg-amber-100 p-2 rounded-md">
              Gemini API key not configured. Gemini TTS and token counting will be unavailable.
            </p>
          )}
        </header>

        <main className="bg-white shadow-xl rounded-xl p-6 md:p-8 space-y-6">
          <BookInput
            text={bookText}
            onTextChange={(newText) => {
                setBookText(newText);
                setActiveError(null); 
                setAudiobookChunks([]); 
                setCurrentAudiobookProgress(0); 
                setIsFb2FileUploaded(false); 
            }}
            disabled={generalInputDisabled || isParsingFb2 || isGeneratingAudiobook}
            onFileChange={handleFileChange}
            isParsing={isParsingFb2}
            parseError={fb2ParseError}
            currentTokenCount={currentTokenCount}
            maxTokens={MAX_TTS_TOKENS} 
            isCountingTokens={isCountingTokens}
            tokenCountError={tokenCountError}
          />
          {activeError && <p className="text-sm text-red-600 bg-red-100 p-2 rounded-md" role="alert">Audio Error: {activeError}</p>}
          <Controls
            playbackState={overallPlaybackState}
            browserVoices={filteredBrowserVoices}
            selectedBrowserVoiceName={selectedBrowserVoiceName}
            browserRate={browserRate}
            pitch={pitch}
            onPlayPause={handlePlayPause}
            onStop={handleStop}
            onBrowserVoiceChange={setSelectedBrowserVoiceName}
            onBrowserRateChange={setBrowserRate}
            onPitchChange={setPitch}
            onDownloadAudio={handleDownloadRequest}
            onClearAndReset={handleClearAndReset} 
            isTextEmpty={isTextEmpty}
            isGeneratingAudio={currentEngineIsGenerating} 
            isGeminiConfigured={!!ai}
            generalInputDisabled={generalInputDisabled}
            ttsEngine={ttsEngine}
            onTtsEngineChange={handleTtsEngineChange}
            geminiTTSVoices={GEMINI_TTS_VOICES}
            selectedGeminiVoiceId={selectedGeminiVoiceId}
            onGeminiVoiceChange={(voiceId) => {
                setSelectedGeminiVoiceId(voiceId);
                setActiveError(null);
            }}
            geminiLanguages={GEMINI_LANGUAGES}
            selectedGeminiLanguageCode={geminiLanguageCode}
            onGeminiLanguageChange={setGeminiLanguageCode}
            geminiTemperature={geminiTemperature}
            onGeminiTemperatureChange={setGeminiTemperature}
            geminiVoicePrompt={geminiVoicePrompt}
            onGeminiVoicePromptChange={(prompt) => {
                setGeminiVoicePrompt(prompt);
                setActiveError(null);
            }}
            activeDefaultGeminiVoicePrompt={activeDefaultGeminiVoicePrompt}
            onResetGeminiVoicePrompt={handleResetGeminiVoicePrompt}
            onSetCurrentPromptAsDefault={handleSetCurrentPromptAsDefault}
            canDownloadGeminiAudio={ttsEngine === TTSEngine.GEMINI && canDownloadGeminiAudio && !isGeneratingAudiobook}
            safetySettings={safetySettings}
            onSafetySettingChange={handleSafetySettingChange}
          />
          <AudiobookGenerator
            audiobookChunks={audiobookChunks}
            isProcessingAudiobook={isGeneratingAudiobook}
            currentTaskMessage={currentAudiobookTaskMessage}
            progressPercent={currentAudiobookProgress} 
            onStartAudiobookGeneration={handleStartAudiobookGeneration}
            onDownloadSingleChunk={handleDownloadSingleChunk}
            onDownloadAllChunks={handleDownloadAllChunks}
            onCancelAudiobookGeneration={handleCancelAudiobookGeneration}
            isTextEmpty={isTextEmpty}
            isGeminiConfigured={!!ai}
            maxTokensExceeded={currentTokenCount > MAX_TTS_TOKENS && !isTextEmpty && !isFb2FileUploaded} 
          />
        </main>

        <audio ref={audioRef} preload="metadata" aria-label="Audio player for TTS output" />

        <footer className="text-center text-sm text-slate-500 mt-12">
          <p>&copy; {new Date().getFullYear()} AudioBook Reader. Powered by Browser TTS & Gemini.</p>
          <p className="text-xs mt-1">Note: Gemini TTS audio is generated targeting {GEMINI_AUDIO_SAMPLE_RATE/1000}kHz, 16-bit mono PCM, then packaged as WAV.</p>
          {ttsEngine === TTSEngine.GEMINI && (
            <p className="text-xs mt-1 text-amber-700">
              Gemini TTS settings (voice, style prompt, temperature) will be applied for playback and audiobook generation.
            </p>
          )}
        </footer>
      </div>
    </div>
  );
};

export default App;