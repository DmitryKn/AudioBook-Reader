import React, { useState, useEffect, useRef } from 'react';

interface BookInputProps {
  text: string; // This will be used as initialText or for external updates
  onTextChange: (text: string) => void; // Callback to update App's bookText
  disabled?: boolean;
  onFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  isParsing: boolean;
  parseError: string | null;
  currentTokenCount: number;
  maxTokens: number;
  isCountingTokens: boolean;
  tokenCountError: string | null;
}

const BookInput: React.FC<BookInputProps> = ({ 
  text: initialText, 
  onTextChange: onAppTextChange, 
  disabled, 
  onFileChange, 
  isParsing, 
  parseError,
  currentTokenCount,
  maxTokens,
  isCountingTokens,
  tokenCountError
}) => {
  const [localText, setLocalText] = useState<string>(initialText);
  const debounceTimeoutRef = useRef<number | null>(null);

  // Effect to update localText when the initialText prop changes
  // This handles cases like file uploads or programmatic resets.
  useEffect(() => {
    // Only update localText if initialText is different, to avoid resetting
    // during user typing if the parent somehow re-renders with the same text.
    if (initialText !== localText) {
        setLocalText(initialText);
    }
    // Note: We don't want to add localText to dependencies here,
    // as it would create a loop. This effect is specifically for initialText prop changes.
  }, [initialText]);


  const handleLocalTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value;
    setLocalText(newText); // Update local state immediately for responsiveness

    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    debounceTimeoutRef.current = window.setTimeout(() => {
      onAppTextChange(newText); // Call the App's handler after debounce
    }, 300); // 300ms debounce period
  };

  // Cleanup timeout on component unmount
  useEffect(() => {
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div className="w-full space-y-4">
      <div>
        <label htmlFor="bookText" className="block text-sm font-medium text-slate-700 mb-1">
          Paste your book text here:
        </label>
        <textarea
          id="bookText"
          value={localText} // Use localText for the textarea value
          onChange={handleLocalTextChange} // Use the new local handler
          placeholder="Start typing or paste your book content..."
          className="w-full h-64 p-3 border border-slate-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 transition duration-150 ease-in-out sm:text-sm bg-white text-slate-800 disabled:bg-slate-200 disabled:cursor-not-allowed"
          disabled={disabled || isParsing}
        />
        {/* Token Counter Display */}
        <div className="mt-1 text-xs">
          {isCountingTokens && <span className="text-slate-500">Counting tokens...</span>}
          {tokenCountError && <span className="text-red-600">{tokenCountError}</span>}
          {/* 
            The token display will now also be "debounced" visually because currentTokenCount 
            is derived from the App's bookText state, which is updated with a debounce.
            This is an acceptable trade-off for performance.
            We use initialText here for the condition of emptiness if localText might be lagging
            behind a programmatic clear, but typically text.trim().length > 0 from App props is fine.
          */}
          {!isCountingTokens && !tokenCountError && initialText.trim().length > 0 && (
            <span className={currentTokenCount > maxTokens ? 'text-red-600 font-semibold' : 'text-slate-500'}>
              {currentTokenCount}/{maxTokens} tokens
            </span>
          )}
           {!isCountingTokens && !tokenCountError && initialText.trim().length === 0 && (
             <span className="text-slate-500">0/{maxTokens} tokens</span>
           )}
        </div>
      </div>
      <div className="space-y-2">
        <label htmlFor="fileUpload" className="block text-sm font-medium text-slate-700">
          Or upload an FB2, TXT, DOCX, or DOC file (.fb2, .fb2.zip, .txt, .docx, .doc):
        </label>
        <input
          type="file"
          id="fileUpload"
          accept=".fb2,.fb2.zip,.txt,.docx,.doc"
          onChange={onFileChange}
          disabled={disabled || isParsing}
          className="block w-full text-sm text-slate-500
            file:mr-4 file:py-2 file:px-4
            file:rounded-md file:border-0
            file:text-sm file:font-semibold
            file:bg-indigo-50 file:text-indigo-700
            hover:file:bg-indigo-100
            disabled:opacity-50 disabled:cursor-not-allowed"
        />
        {isParsing && <p className="text-sm text-indigo-600">Parsing file...</p>}
        {parseError && <p className="text-sm text-red-600 bg-red-100 p-2 rounded-md">{parseError}</p>}
      </div>
    </div>
  );
};

export default BookInput;