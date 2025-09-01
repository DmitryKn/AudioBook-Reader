

import React from 'react';
import { PlaybackState, TTSEngine, GeminiTTSVoice, SafetySetting, HarmCategory, HarmBlockThreshold } from '../types';

interface ControlsProps {
  playbackState: PlaybackState;
  browserVoices: SpeechSynthesisVoice[];
  selectedBrowserVoiceName: string;
  browserRate: number; 
  pitch: number;
  onPlayPause: () => void;
  onStop: () => void;
  onBrowserVoiceChange: (voiceName: string) => void;
  onBrowserRateChange: (rate: number) => void; 
  onPitchChange: (pitch: number) => void;
  onDownloadAudio: () => void;
  onClearAndReset: () => void; 
  isTextEmpty: boolean;
  isGeneratingAudio: boolean;
  isGeminiConfigured: boolean;
  generalInputDisabled: boolean;

  ttsEngine: TTSEngine;
  onTtsEngineChange: (engine: TTSEngine) => void;
  geminiTTSVoices: GeminiTTSVoice[];
  selectedGeminiVoiceId: string;
  onGeminiVoiceChange: (voiceId: string) => void;
  geminiLanguages: { code: string; name: string }[];
  selectedGeminiLanguageCode: string;
  onGeminiLanguageChange: (code: string) => void;
  geminiTemperature: number;
  onGeminiTemperatureChange: (temp: number) => void;
  geminiVoicePrompt: string; 
  onGeminiVoicePromptChange: (prompt: string) => void; 
  activeDefaultGeminiVoicePrompt: string;
  onResetGeminiVoicePrompt: () => void; 
  onSetCurrentPromptAsDefault: () => void;
  canDownloadGeminiAudio: boolean;
  safetySettings: SafetySetting[];
  onSafetySettingChange: (category: HarmCategory, threshold: HarmBlockThreshold) => void;
}

const PlayIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" {...props}>
    <path fillRule="evenodd" d="M4.5 5.653c0-1.427 1.529-2.33 2.779-1.643l11.54 6.347c1.295.712 1.295 2.573 0 3.286L7.28 19.99c-1.25.687-2.779-.217-2.779-1.643V5.653Z" clipRule="evenodd" />
  </svg>
);

const PauseIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" {...props}>
    <path fillRule="evenodd" d="M6.75 5.25a.75.75 0 0 1 .75.75V18a.75.75 0 0 1-1.5 0V6a.75.75 0 0 1 .75-.75Zm9 0a.75.75 0 0 1 .75.75V18a.75.75 0 0 1-1.5 0V6a.75.75 0 0 1 .75-.75Z" clipRule="evenodd" />
  </svg>
);

const StopIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" {...props}>
    <path fillRule="evenodd" d="M4.5 7.5a3 3 0 0 1 3-3h9a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3h-9a3 3 0 0 1-3-3v-9Z" clipRule="evenodd" />
  </svg>
);

const DownloadIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" {...props}>
    <path fillRule="evenodd" d="M12 2.25a.75.75 0 0 1 .75.75v11.69l3.22-3.22a.75.75 0 1 1 1.06 1.06l-4.5 4.5a.75.75 0 0 1-1.06 0l-4.5-4.5a.75.75 0 1 1 1.06-1.06l3.22 3.22V3a.75.75 0 0 1 .75-.75Zm-9 13.5a.75.75 0 0 1 .75.75v2.25a1.5 1.5 0 0 0 1.5 1.5h13.5a1.5 1.5 0 0 0 1.5-1.5V16.5a.75.75 0 0 1 1.5 0v2.25a3 3 0 0 1-3 3H5.25a3 3 0 0 1-3-3V16.5a.75.75 0 0 1 .75-.75Z" clipRule="evenodd" />
  </svg>
);

const TrashIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" {...props}>
    <path fillRule="evenodd" d="M16.5 4.478v.227a48.816 48.816 0 0 1 3.878.512.75.75 0 1 1-.256 1.478l-.209-.035-1.005 13.006a.75.75 0 0 1-.742.729h-9.798a.75.75 0 0 1-.742-.73L5.088 6.66l-.209.035a.75.75 0 0 1-.256-1.478A48.567 48.567 0 0 1 7.5 4.705v-.227c0-1.564 1.213-2.9 2.816-2.9h1.368c1.603 0 2.816 1.336 2.816 2.9ZM5.25 6.75A.75.75 0 0 1 6 7.5h12a.75.75 0 0 1 .75.75v.008l-.816 10.592a2.25 2.25 0 0 1-2.23 2.15h-6.408a2.25 2.25 0 0 1-2.23-2.15L5.25 8.258V6.75Z" clipRule="evenodd" />
  </svg>
);

const ResetIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
  </svg>
);

const SaveIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
  </svg>
);

// Helper to format HarmCategory enum for display
const formatHarmCategory = (category: HarmCategory): string => {
  return category
    .replace('HARM_CATEGORY_', '')
    .replace(/_/g, ' ')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

const Controls: React.FC<ControlsProps> = ({
  playbackState,
  browserVoices,
  selectedBrowserVoiceName,
  browserRate,
  pitch,
  onPlayPause,
  onStop,
  onBrowserVoiceChange,
  onBrowserRateChange,
  onPitchChange,
  onDownloadAudio,
  onClearAndReset,
  isTextEmpty,
  isGeneratingAudio,
  isGeminiConfigured,
  generalInputDisabled,
  ttsEngine,
  onTtsEngineChange,
  geminiTTSVoices,
  selectedGeminiVoiceId,
  onGeminiVoiceChange,
  geminiLanguages,
  selectedGeminiLanguageCode,
  onGeminiLanguageChange,
  geminiTemperature,
  onGeminiTemperatureChange,
  geminiVoicePrompt,
  onGeminiVoicePromptChange,
  activeDefaultGeminiVoicePrompt,
  onResetGeminiVoicePrompt,
  onSetCurrentPromptAsDefault,
  canDownloadGeminiAudio,
  safetySettings,
  onSafetySettingChange,
}) => {
  const isPlaying = playbackState === PlaybackState.PLAYING;
  const isPaused = playbackState === PlaybackState.PAUSED;
  const isLoading = (ttsEngine === TTSEngine.BROWSER && playbackState === PlaybackState.LOADING_VOICES && browserVoices.length === 0) || 
                    (ttsEngine === TTSEngine.GEMINI && isGeneratingAudio);
  const isUnsupported = ttsEngine === TTSEngine.BROWSER && playbackState === PlaybackState.UNSUPPORTED;
  const isAnyGeminiOperation = isGeneratingAudio;

  const playPauseButtonDisabled = isTextEmpty || isLoading || isUnsupported || isAnyGeminiOperation;
  const stopButtonDisabled = (playbackState === PlaybackState.IDLE && !isAnyGeminiOperation && !isLoading ) || playbackState === PlaybackState.ENDED || isLoading || isUnsupported;
  
  const settingsDisabled = isLoading || isUnsupported || generalInputDisabled || isAnyGeminiOperation;
  const downloadButtonActive = ttsEngine === TTSEngine.BROWSER ? !isTextEmpty : canDownloadGeminiAudio;
  const downloadButtonDisabled = settingsDisabled || !downloadButtonActive;
  const clearResetButtonDisabled = generalInputDisabled;


  let playPauseLabel = 'Play';
  let PlayPauseIconToRender = PlayIcon;

  if (isGeneratingAudio && ttsEngine === TTSEngine.GEMINI) {
    playPauseLabel = 'Generating Audio...';
  } else if (isPlaying) {
    playPauseLabel = 'Pause';
    PlayPauseIconToRender = PauseIcon;
  } else if (isPaused) {
    playPauseLabel = 'Resume';
  }
  
  const handleTtsEngineChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onTtsEngineChange(event.target.value as TTSEngine);
  };

  return (
    <div className="p-4 bg-white shadow-md rounded-lg space-y-6">
      <div className="flex items-center justify-start space-x-3 flex-wrap gap-y-3">
        <button
          type="button"
          onClick={onPlayPause}
          disabled={playPauseButtonDisabled}
          aria-label={playPauseLabel}
          className={`px-6 py-3 text-base font-medium rounded-md shadow-sm flex items-center justify-center space-x-2
            ${playPauseButtonDisabled 
              ? 'bg-slate-300 text-slate-500 cursor-not-allowed' 
              : isPlaying || isPaused 
                ? 'bg-amber-500 hover:bg-amber-600 text-white'
                : 'bg-indigo-600 hover:bg-indigo-700 text-white'} 
            focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition duration-150 ease-in-out`}
        >
          <PlayPauseIconToRender className="w-5 h-5"/>
          <span>{playPauseLabel}</span>
        </button>
        <button
          type="button"
          onClick={onStop}
          disabled={stopButtonDisabled}
          aria-label="Stop playback"
          className={`px-6 py-3 text-base font-medium rounded-md shadow-sm flex items-center justify-center space-x-2
            ${stopButtonDisabled 
              ? 'bg-slate-300 text-slate-500 cursor-not-allowed' 
              : 'bg-red-500 hover:bg-red-600 text-white'} 
            focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition duration-150 ease-in-out`}
        >
          <StopIcon className="w-5 h-5"/>
          <span>Stop</span>
        </button>
        <button
          type="button"
          onClick={onDownloadAudio}
          disabled={downloadButtonDisabled}
          aria-label={ttsEngine === TTSEngine.GEMINI && canDownloadGeminiAudio ? "Download Audio (WAV)" : "Download Info"}
          className={`px-6 py-3 text-base font-medium rounded-md shadow-sm flex items-center justify-center space-x-2
            ${downloadButtonDisabled
              ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
              : 'bg-green-500 hover:bg-green-600 text-white'}
            focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition duration-150 ease-in-out`}
        >
          <DownloadIcon className="w-5 h-5" />
          <span>{ttsEngine === TTSEngine.GEMINI && canDownloadGeminiAudio ? 'Download Audio (WAV)' : 'Download Info'}</span>
        </button>
        <button
          type="button" 
          onClick={onClearAndReset}
          disabled={clearResetButtonDisabled}
          aria-label="Clear text and reset all"
          className={`px-6 py-3 text-base font-medium rounded-md shadow-sm flex items-center justify-center space-x-2
            ${clearResetButtonDisabled
              ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
              : 'bg-slate-500 hover:bg-slate-600 text-white'}
            focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-500 transition duration-150 ease-in-out`}
        >
          <TrashIcon className="w-5 h-5" />
          <span>Clear & Reset</span>
        </button>
      </div>

      <div className="space-y-2 border-t border-slate-200 pt-4">
        <label className="block text-sm font-medium text-slate-700">TTS Engine:</label>
        <div className="flex items-center space-x-4">
           <label className="flex items-center">
            <input 
              type="radio" 
              name="ttsEngine" 
              value={TTSEngine.GEMINI}
              checked={ttsEngine === TTSEngine.GEMINI}
              onChange={handleTtsEngineChange}
              disabled={settingsDisabled || !isGeminiConfigured}
              className="form-radio h-4 w-4 text-indigo-600 transition duration-150 ease-in-out disabled:opacity-50"
            />
            <span className="ml-2 text-sm text-slate-700">Gemini TTS</span>
          </label>
          <label className="flex items-center">
            <input 
              type="radio" 
              name="ttsEngine" 
              value={TTSEngine.BROWSER} 
              checked={ttsEngine === TTSEngine.BROWSER}
              onChange={handleTtsEngineChange}
              disabled={settingsDisabled}
              className="form-radio h-4 w-4 text-indigo-600 transition duration-150 ease-in-out disabled:opacity-50" 
            />
            <span className="ml-2 text-sm text-slate-700">Browser TTS</span>
          </label>
        </div>
         {!isGeminiConfigured && (
            <p className="text-xs text-amber-700 mt-1">
              Gemini API not configured. Gemini TTS unavailable.
            </p>
        )}
      </div>
      
      {ttsEngine === TTSEngine.GEMINI && isGeminiConfigured && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="geminiVoice" className="block text-sm font-medium text-slate-700">
                Gemini TTS Voice:
              </label>
              <select
                id="geminiVoice"
                value={selectedGeminiVoiceId}
                onChange={(e) => onGeminiVoiceChange(e.target.value)}
                disabled={settingsDisabled || geminiTTSVoices.length === 0}
                className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-slate-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md shadow-sm disabled:bg-slate-200 disabled:cursor-not-allowed text-slate-800 bg-white"
              >
                {geminiTTSVoices.length === 0 && <option value="">No Gemini voices listed</option>}
                {geminiTTSVoices.map((voice) => (
                  <option key={voice.id} value={voice.id}>
                    {voice.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="geminiLanguage" className="block text-sm font-medium text-slate-700">
                Language:
              </label>
              <select
                id="geminiLanguage"
                value={selectedGeminiLanguageCode}
                onChange={(e) => onGeminiLanguageChange(e.target.value)}
                disabled={settingsDisabled || geminiLanguages.length === 0}
                className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-slate-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md shadow-sm disabled:bg-slate-200 disabled:cursor-not-allowed text-slate-800 bg-white"
              >
                {geminiLanguages.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2 mt-4">
            <label htmlFor="geminiTemperature" className="block text-sm font-medium text-slate-700">
              Temperature (Creativity): <span className="text-indigo-600 font-semibold">{geminiTemperature.toFixed(1)}</span>
            </label>
            <input
              type="range"
              id="geminiTemperature"
              min="0"
              max="2.0"
              step="0.1"
              value={geminiTemperature}
              onChange={(e) => onGeminiTemperatureChange(parseFloat(e.target.value))}
              disabled={settingsDisabled}
              className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600 disabled:bg-slate-300 disabled:cursor-not-allowed disabled:accent-slate-400"
            />
            <p className="text-xs text-slate-500 mt-1">
              Controls the randomness of the voice delivery. Higher values are more creative. (Range: 0.0 - 2.0)
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between items-center mb-1">
              <label htmlFor="geminiVoicePrompt" className="block text-sm font-medium text-slate-700">
                Voice Style Prompt (Optional):
              </label>
              <div className="flex items-center space-x-2">
                 <button
                    type="button"
                    onClick={onSetCurrentPromptAsDefault}
                    disabled={settingsDisabled || geminiVoicePrompt === activeDefaultGeminiVoicePrompt}
                    className="text-xs text-indigo-600 hover:text-indigo-800 disabled:text-slate-400 disabled:cursor-not-allowed flex items-center space-x-1 p-0.5 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    title="Set current prompt as default"
                    aria-label="Set current voice style prompt as default"
                  >
                    <SaveIcon className="w-3 h-3" />
                    <span>Set Default</span>
                  </button>
                  <button
                    type="button"
                    onClick={onResetGeminiVoicePrompt}
                    disabled={settingsDisabled || geminiVoicePrompt === activeDefaultGeminiVoicePrompt}
                    className="text-xs text-indigo-600 hover:text-indigo-800 disabled:text-slate-400 disabled:cursor-not-allowed flex items-center space-x-1 p-0.5 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    title="Reset prompt to default"
                    aria-label="Reset voice style prompt to default"
                  >
                    <ResetIcon className="w-3 h-3" />
                    <span>Reset</span>
                  </button>
              </div>
            </div>
            <textarea
              id="geminiVoicePrompt"
              value={geminiVoicePrompt}
              onChange={(e) => onGeminiVoicePromptChange(e.target.value)}
              placeholder="e.g., Speak in a calm, soothing voice"
              className="block w-full h-20 p-3 border border-slate-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white text-slate-800 disabled:bg-slate-200 disabled:cursor-not-allowed"
              disabled={settingsDisabled}
              rows={2}
            />
             <p className="text-xs text-slate-500 mt-1">
              Natural language instructions for voice style, tone, or pace.
            </p>
          </div>

          <details className="space-y-2 border-t border-slate-200 pt-4">
            <summary className="cursor-pointer text-sm font-medium text-slate-700 hover:text-indigo-600 list-inside">
              Safety Settings (Advanced)
            </summary>
            <div className="p-4 bg-slate-50 rounded-md space-y-4 mt-2">
              <p className="text-xs text-slate-600">
                These settings control the content safety filters. The default is set to "Block None" to allow a wide range of content, like in fantasy books. You can make them more restrictive if needed.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {safetySettings.map(setting => (
                  <div key={setting.category}>
                    <label htmlFor={`safety-${setting.category}`} className="block text-sm font-medium text-slate-700">
                      {formatHarmCategory(setting.category)}
                    </label>
                    <select
                      id={`safety-${setting.category}`}
                      value={setting.threshold}
                      onChange={(e) => onSafetySettingChange(setting.category, e.target.value as HarmBlockThreshold)}
                      disabled={settingsDisabled}
                      className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-slate-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md shadow-sm disabled:bg-slate-200 disabled:cursor-not-allowed text-slate-800 bg-white"
                    >
                      <option value={HarmBlockThreshold.BLOCK_LOW_AND_ABOVE}>Block Low &amp; Above</option>
                      <option value={HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE}>Block Medium &amp; Above</option>
                      <option value={HarmBlockThreshold.BLOCK_ONLY_HIGH}>Block High Only</option>
                      <option value={HarmBlockThreshold.BLOCK_NONE}>Block None</option>
                    </select>
                  </div>
                ))}
              </div>
            </div>
          </details>
        </>
      )}

      {ttsEngine === TTSEngine.BROWSER && (
        <>
          <div className="space-y-2">
            <label htmlFor="voice" className="block text-sm font-medium text-slate-700">
              Browser Voice (English/Russian):
            </label>
            <select
              id="voice"
              value={selectedBrowserVoiceName}
              onChange={(e) => onBrowserVoiceChange(e.target.value)}
              disabled={settingsDisabled || browserVoices.length === 0}
              className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-slate-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md shadow-sm disabled:bg-slate-200 disabled:cursor-not-allowed text-slate-800 bg-white"
            >
              {isLoading && <option value="">Loading voices...</option>}
              {!isLoading && browserVoices.length === 0 && playbackState !== PlaybackState.UNSUPPORTED && <option value="">No English/Russian voices available</option>}
              {browserVoices.map((voice) => (
                <option key={voice.name} value={voice.name}>
                  {voice.name} ({voice.lang})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label htmlFor="browserRate" className="block text-sm font-medium text-slate-700">
              Browser Rate: <span className="text-indigo-600 font-semibold">{browserRate.toFixed(1)}x</span>
            </label>
            <input
              type="range"
              id="browserRate"
              min="0.5"
              max="2"
              step="0.1"
              value={browserRate}
              onChange={(e) => onBrowserRateChange(parseFloat(e.target.value))}
              disabled={settingsDisabled}
              className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600 disabled:bg-slate-300 disabled:cursor-not-allowed disabled:accent-slate-400"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="pitch" className="block text-sm font-medium text-slate-700">
              Pitch: <span className="text-indigo-600 font-semibold">{pitch.toFixed(1)}</span>
            </label>
            <input
              type="range"
              id="pitch"
              min="0"
              max="2"
              step="0.1"
              value={pitch}
              onChange={(e) => onPitchChange(parseFloat(e.target.value))}
              disabled={settingsDisabled}
              className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600 disabled:bg-slate-300 disabled:cursor-not-allowed disabled:accent-slate-400"
            />
          </div>
        </>
      )}
      
       {isUnsupported && ttsEngine === TTSEngine.BROWSER && (
        <p className="text-sm text-red-600 bg-red-100 p-3 rounded-md mt-4">
          Browser Speech synthesis is not supported by your browser. Try Gemini TTS.
        </p>
      )}
    </div>
  );
};

export default Controls;
