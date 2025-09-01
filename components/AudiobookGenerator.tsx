
import React from 'react';
import { AudiobookChunk } from '../types';

interface AudiobookGeneratorProps {
  audiobookChunks: AudiobookChunk[];
  isProcessingAudiobook: boolean;
  currentTaskMessage: string;
  progressPercent: number; // New prop for progress (0-100)
  onStartAudiobookGeneration: () => void;
  onDownloadSingleChunk: (chunkId: string) => void;
  onDownloadAllChunks: () => void;
  onCancelAudiobookGeneration?: () => void; // Optional for future
  isTextEmpty: boolean;
  isGeminiConfigured: boolean;
  maxTokensExceeded: boolean;
}

const DownloadIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" {...props}>
    <path fillRule="evenodd" d="M10 12.5a.5.5 0 01.5.5v1.793l1.146-1.147a.5.5 0 01.708.708l-2 2a.5.5 0 01-.708 0l-2-2a.5.5 0 11.708-.708L9.5 14.793V13a.5.5 0 01.5-.5zM5.5 5.75A.75.75 0 016.25 5h7.5a.75.75 0 01.75.75v2a.75.75 0 01-1.5 0V6.5H6.25v1.25a.75.75 0 01-1.5 0v-2z" clipRule="evenodd" />
    <path d="M2 10a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 10zM3.055 17.28a.75.75 0 00.9 1.18l1.95-1.462A.25.25 0 016 16.75V11.5a.75.75 0 00-1.5 0v4.86L3.055 17.28zM16.945 17.28a.75.75 0 01-.9 1.18l-1.95-1.462a.25.25 0 00-.195-.036V11.5a.75.75 0 011.5 0v4.86l1.445-1.084a.75.75 0 01.955 1.18zM6.5 18.25a.75.75 0 000-1.5H4a.75.75 0 000 1.5h2.5zM13.5 18.25a.75.75 0 000-1.5H16a.75.75 0 000 1.5h-2.5z" />
  </svg>
);


const AudiobookGenerator: React.FC<AudiobookGeneratorProps> = ({
  audiobookChunks,
  isProcessingAudiobook,
  currentTaskMessage,
  progressPercent, // New prop
  onStartAudiobookGeneration,
  onDownloadSingleChunk,
  onDownloadAllChunks,
  onCancelAudiobookGeneration,
  isTextEmpty,
  isGeminiConfigured,
  maxTokensExceeded,
}) => {

  const canStartGeneration = !isProcessingAudiobook && !isTextEmpty && isGeminiConfigured;
  
  let startButtonText = "Generate Audiobook from Current Text";

  const successfulChunks = audiobookChunks.filter(c => c.status === 'success');
  const canDownloadAll = !isProcessingAudiobook && successfulChunks.length > 0;

  return (
    <div className="mt-6 p-4 bg-slate-50 shadow-md rounded-lg space-y-4">
      <h3 className="text-lg font-semibold text-slate-700">Audiobook Generation</h3>
      
      {!isProcessingAudiobook && (
         <button
            onClick={onStartAudiobookGeneration}
            disabled={!canStartGeneration}
            className={`w-full px-6 py-3 text-base font-medium rounded-md shadow-sm flex items-center justify-center space-x-2
                ${!canStartGeneration
                ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                : 'bg-teal-600 hover:bg-teal-700 text-white'}
                focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500 transition duration-150 ease-in-out`}
            aria-label={startButtonText}
            >
            <span>{startButtonText}</span>
        </button>
      )}
       {!isGeminiConfigured && !isTextEmpty && (
         <p className="text-xs text-red-700 mt-1">
            Gemini API is not configured. Audiobook generation unavailable.
        </p>
       )}
       {isTextEmpty && isGeminiConfigured && (
         <p className="text-xs text-amber-700 mt-1">
            Please enter or upload text to generate an audiobook.
        </p>
       )}
       {maxTokensExceeded && !isTextEmpty && !isProcessingAudiobook && isGeminiConfigured && (
         <p className="text-xs text-amber-700 mt-1">
            The current text is long. Use "Generate Audiobook" above to process it in parts.
        </p>
       )}


      {isProcessingAudiobook && (
        <div className="text-center p-3 bg-indigo-50 rounded-md">
          <p className="text-indigo-700 font-medium">{currentTaskMessage}</p>
          
          {/* Progress Bar Start */}
          <div className="w-full bg-slate-200 rounded-full h-2.5 mt-3 mb-1 dark:bg-slate-700">
            <div
              className="bg-indigo-600 h-2.5 rounded-full transition-all duration-300 ease-out"
              style={{ width: `${progressPercent}%` }}
              role="progressbar"
              aria-valuenow={progressPercent}
              aria-valuemin={0}
              aria-valuemax={100}
            ></div>
          </div>
          <p className="text-xs text-indigo-500">{progressPercent}% complete</p>
          {/* Progress Bar End */}

          {onCancelAudiobookGeneration && (
            <button 
              onClick={onCancelAudiobookGeneration}
              className="mt-3 px-4 py-1 text-sm bg-red-500 hover:bg-red-600 text-white rounded-md shadow-sm"
            >
              Cancel Generation
            </button>
          )}
        </div>
      )}

      {audiobookChunks.length > 0 && (
        <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
          <h4 className="text-md font-medium text-slate-600 mt-2">
            Audiobook Parts ({successfulChunks.length} / {audiobookChunks.length} completed):
          </h4>
          {audiobookChunks.map((chunk) => (
            <div key={chunk.id} className="p-3 border border-slate-200 rounded-md bg-white">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-slate-800">{chunk.fileName}</span>
                <span className={`px-2 py-0.5 text-xs font-semibold rounded-full
                  ${chunk.status === 'pending' ? 'bg-slate-200 text-slate-700' : ''}
                  ${chunk.status === 'generating' ? 'bg-sky-200 text-sky-800 animate-pulse' : ''}
                  ${chunk.status === 'success' ? 'bg-green-200 text-green-800' : ''}
                  ${chunk.status === 'error' ? 'bg-red-200 text-red-800' : ''}
                `}>
                  {chunk.status.charAt(0).toUpperCase() + chunk.status.slice(1)}
                </span>
              </div>
              {chunk.status === 'success' && chunk.audioBlobUrl && (
                <button
                  onClick={() => onDownloadSingleChunk(chunk.id)}
                  className="mt-2 px-3 py-1 text-xs bg-emerald-500 hover:bg-emerald-600 text-white rounded-md shadow-sm flex items-center space-x-1"
                  aria-label={`Download ${chunk.fileName}`}
                >
                  <DownloadIcon className="w-4 h-4" />
                  <span>Download Part</span>
                </button>
              )}
              {chunk.status === 'error' && chunk.errorDetails && (
                <p className="mt-1 text-xs text-red-700">{chunk.errorDetails}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {audiobookChunks.length > 0 && !isProcessingAudiobook && (
        <button
          onClick={onDownloadAllChunks}
          disabled={!canDownloadAll}
          className={`w-full px-6 py-3 text-base font-medium rounded-md shadow-sm flex items-center justify-center space-x-2
            ${!canDownloadAll
              ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
              : 'bg-lime-600 hover:bg-lime-700 text-white'}
            focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-lime-500 transition duration-150 ease-in-out`}
        >
          <DownloadIcon className="w-5 h-5" />
          <span>Download All Completed Parts as ZIP</span>
        </button>
      )}
    </div>
  );
};

export default AudiobookGenerator;
