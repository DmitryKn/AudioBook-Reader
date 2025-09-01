
export enum PlaybackState {
  IDLE = 'idle',
  PLAYING = 'playing',
  PAUSED = 'paused',
  ENDED = 'ended',
  LOADING_VOICES = 'loading_voices', // For browser voices
  UNSUPPORTED = 'unsupported', // Browser TTS unsupported
}

export enum TTSEngine {
  BROWSER = 'browser',
  GEMINI = 'gemini',
}

export interface GeminiTTSVoice {
  id: string; // Voice ID for the API
  name: string; // Display name
}

// Enums and types for Gemini Safety Settings
export enum HarmCategory {
  HARM_CATEGORY_HARASSMENT = "HARM_CATEGORY_HARASSMENT",
  HARM_CATEGORY_HATE_SPEECH = "HARM_CATEGORY_HATE_SPEECH",
  HARM_CATEGORY_SEXUALLY_EXPLICIT = "HARM_CATEGORY_SEXUALLY_EXPLICIT",
  HARM_CATEGORY_DANGEROUS_CONTENT = "HARM_CATEGORY_DANGEROUS_CONTENT",
}

export enum HarmBlockThreshold {
  BLOCK_NONE = "BLOCK_NONE",
  BLOCK_ONLY_HIGH = "BLOCK_ONLY_HIGH",
  BLOCK_MEDIUM_AND_ABOVE = "BLOCK_MEDIUM_AND_ABOVE",
  BLOCK_LOW_AND_ABOVE = "BLOCK_LOW_AND_ABOVE",
}

export interface SafetySetting {
  category: HarmCategory;
  threshold: HarmBlockThreshold;
}


// SpeechSynthesisVoice is a built-in type, so no need to redefine VoiceOption explicitly
// if we are just using the SpeechSynthesisVoice properties directly.
// We can use SpeechSynthesisVoice[] for lists of voices.

export interface ExtractedChapter {
  title?: string;
  content: string; // Full text content of the chapter
  // paragraphs?: string[]; // Optional: for future finer-grained splitting of large chapters
}

export interface AudiobookChunk {
  id: string; // e.g., generated with crypto.randomUUID()
  index: number; // 0-based index
  text: string;
  fileName: string; // e.g., "MyBook_Part_001.wav"
  chapterTitle?: string; // Optional: title of the chapter this chunk belongs to
  status: 'pending' | 'generating' | 'success' | 'error';
  audioBlob?: Blob;
  audioBlobUrl?: string; // For individual download links
  errorDetails?: string;
}