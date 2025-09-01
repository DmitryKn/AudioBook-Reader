import { GoogleGenAI } from "@google/genai";
import { AudiobookChunk, ExtractedChapter } from '../types';
import { transliterate } from './transliterate';

// --- CHUNKING STRATEGY PARAMETERS ---
// These values can be adjusted to experiment with different chunking strategies.

/**
 * The hard upper limit for tokens in a single TTS request. This aligns with the model's maximum.
 */
export const MAX_TTS_TOKENS = 8000;

/** 
 * The ideal target number of tokens for each audio chunk. 
 * Smaller chunks generate faster but create more files.
 * Larger chunks are more efficient but can be slow to generate.
 */
const IDEAL_TOKENS_PER_CHUNK = 2000;

/**
 * The ideal target number of characters for the initial heuristic aggregation of paragraphs.
 * This is a fast way to group text before doing a precise token count.
 * (Heuristic: ~3 characters per token on average).
 */
const IDEAL_CHARS_PER_CHUNK_TARGET = 6000;

/**
 * The upper bound for an "ideal" chunk. If a heuristically-created chunk has more tokens
 * than this, it will be forcefully re-split into smaller pieces. This is a percentage of IDEAL_TOKENS_PER_CHUNK.
 * e.g., 1.5 means chunks up to 3000 tokens (1.5 * 2000) are acceptable before re-splitting.
 */
const IDEAL_CHUNK_SIZE_MULTIPLIER = 1.5;

/** 
 * When a chunk is too large and needs to be forcefully split by character count, this determines
 * how much smaller the sub-pieces should be compared to the ideal character target.
 * e.g., 2 means the recursive splitter will target pieces half the size of the ideal chunk.
 */
const FINE_GRAINED_SPLIT_DIVISOR = 2;
// --- END OF CHUNKING PARAMETERS ---


const GEMINI_TOKEN_MODEL = 'gemini-2.5-flash';


export function extractChaptersFromFb2(xmlString: string): ExtractedChapter[] {
  if (typeof xmlString !== 'string' || (xmlString.trim().length > 0 && !xmlString.trim().startsWith('<'))) {
    console.warn('extractChaptersFromFb2 received non-XML string, returning empty.');
    return [];
  }

  try {
    // Attempt 1: The standard DOMParser way
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, "text/xml");
    const errorNode = xmlDoc.querySelector("parsererror");

    if (!errorNode) {
      let mainBody: Element | null = null;
      const bodies = xmlDoc.querySelectorAll("body");
      mainBody = Array.from(bodies).find(b => !b.getAttribute('name')?.includes('notes')) || bodies[0];

      if (mainBody) {
        const paragraphs = Array.from(mainBody.querySelectorAll('p'));
        const content = paragraphs
          .map(p => p.textContent?.trim() || '')
          .filter(text => text.length > 0)
          .join('\n\n');

        if (content) {
          console.log("[extractChaptersFromFb2] Successfully parsed with DOMParser.");
          const bookTitleElement = xmlDoc.querySelector("description > title-info > book-title");
          const bookTitle = bookTitleElement?.textContent?.trim() || "Full Book Content";
          return [{ title: bookTitle, content }];
        }
      }
    }
    
    // If DOMParser failed or found no content, fall back to regex.
    console.warn("DOMParser failed or found no content. Falling back to regex-based extraction.");

    // Attempt 2: Regex-based extraction
    let bodyContent = '';
    // Regex to find the main body (without a 'name' attribute)
    const mainBodyMatch = xmlString.match(/<body(?![^>]*name=)[^>]*>([\s\S]*?)<\/body>/i);
    if (mainBodyMatch && mainBodyMatch[1]) {
        bodyContent = mainBodyMatch[1];
    } else {
        // Fallback to finding the very first body tag if the specific one isn't found
        const anyBodyMatch = xmlString.match(/<body>([\s\S]*?)<\/body>/i);
        if (anyBodyMatch && anyBodyMatch[1]) {
            bodyContent = anyBodyMatch[1];
        } else {
             throw new Error("Could not find a <body> tag using regex.");
        }
    }

    const pMatches = [...bodyContent.matchAll(/<p>([\s\S]*?)<\/p>/gi)];
    const paragraphsContent = pMatches.map(match => {
      // For each paragraph, strip inner tags and clean up
      return match[1]
        .replace(/<[^>]+>/g, ' ') // Strip tags like <emphasis>
        .replace(/&nbsp;/g, ' ')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/\s{2,}/g, ' ') // Collapse multiple whitespace chars
        .trim();
    }).filter(Boolean); // Filter out any paragraphs that became empty after cleaning

    const fullBookContent = paragraphsContent.join('\n\n');

    if (!fullBookContent) {
      throw new Error("Regex extraction failed to find any valid paragraph content in the body.");
    }

    const titleMatch = xmlString.match(/<book-title>([\s\S]*?)<\/book-title>/i);
    const bookTitle = titleMatch && titleMatch[1] ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : "Full Book Content";
    
    console.log("[extractChaptersFromFb2] Successfully extracted content with regex fallback.");
    return [{ title: bookTitle, content: fullBookContent }];

  } catch (error) {
    console.error("Error during FB2 chapter extraction (after trying all methods):", error);
    // Re-throw to be handled by the encoding loop in App.tsx
    throw error;
  }
}


export function splitTextIntoParagraphs(text: string): string[] {
  return text.split(/\n\n+/).map(p => p.trim()).filter(p => p.length > 0);
}


// Synchronous, heuristic text splitter. Does not call any API.
function forceSplitTextRecursive_SYNC(
  text: string,
  targetCharLength: number, 
  onProgress?: (message: string, depth: number) => void,
  depth: number = 0,
  currentCallId: string = "initial"
): string[] {
  if (!text.trim()) return [];
  if (depth > 15) { 
    onProgress?.(`[${currentCallId}] Max recursion depth (${depth}) reached. Returning segment as is (length: ${text.length}).`, depth);
    return [text];
  }

  if (text.length <= targetCharLength * 1.5 && depth > 0) { 
    onProgress?.(`[${currentCallId}] Segment length ${text.length} is within 1.5x target ${targetCharLength}. No further sync split.`, depth);
    return [text];
  }

  onProgress?.(`[${currentCallId}] Segment length ${text.length} > target ${targetCharLength}. Attempting sync split.`, depth);
  const results: string[] = [];

  const paragraphs = text.split(/\n\n+/);
  if (paragraphs.length > 1) {
    onProgress?.(`[${currentCallId}] Attempting split by ${paragraphs.length} paragraphs.`, depth);
    for (let i = 0; i < paragraphs.length; i++) {
      const para = paragraphs[i].trim();
      if (para) {
        results.push(...forceSplitTextRecursive_SYNC(para, targetCharLength, onProgress, depth + 1, `${currentCallId}-p${i}`));
      }
    }
    return results.filter(s => s.length > 0);
  }

  const sentences = text.split(/(?<=[.?!])\s+(?=[A-ZА-ЯЁ0-9"“«‘“„\[\(])|(?<=\n)\s*(?=[A-ZА-ЯЁ0-9"“«‘“„\[\(])/g).map(s => s.trim()).filter(s => s.length > 0);
  if (sentences.length > 1) {
    onProgress?.(`[${currentCallId}] Attempting split by ${sentences.length} sentences.`, depth);
    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i].trim();
      if (sentence) {
        results.push(...forceSplitTextRecursive_SYNC(sentence, targetCharLength, onProgress, depth + 1, `${currentCallId}-s${i}`));
      }
    }
    return results.filter(s => s.length > 0);
  }
  
  onProgress?.(`[${currentCallId}] Attempting character-based fallback split. Text length: ${text.length}`, depth);
  let currentPos = 0;
  while(currentPos < text.length) {
    let splitPoint = Math.min(currentPos + targetCharLength, text.length);
    if (splitPoint < text.length) { 
        let foundSpace = false;
        for (let i = splitPoint; i > currentPos; i--) {
            if (/\s/.test(text[i])) {
                splitPoint = i + 1; 
                foundSpace = true;
                break;
            }
        }
        if (!foundSpace && splitPoint - currentPos < targetCharLength / 2 && currentPos + targetCharLength < text.length) {
             splitPoint = currentPos + targetCharLength;
        }
    }
    const part = text.substring(currentPos, splitPoint).trim();
    if (part) results.push(part);
    currentPos = splitPoint;
  }
  
  if (results.length === 0 && text.length > 0) results.push(text); 
  onProgress?.(`[${currentCallId}] Processed character-based split. Resulting segments: ${results.length}`, depth);
  return results.filter(s => s.length > 0);
}

// New efficient paragraph aggregator. Does NOT call any API.
function aggregateParagraphsIntoChunks(
    paragraphs: string[], 
    charTarget: number, 
    onProgress?: (progress: CreateChunksProgress) => void
): string[] {
    const chunks: string[] = [];
    if (!paragraphs || paragraphs.length === 0) {
        return chunks;
    }

    let currentChunk = "";
    onProgress?.({
        type: 'aggregation_heuristic',
        message: `Aggregating ${paragraphs.length} paragraphs into chunks...`,
        totalItems: paragraphs.length,
        processedItems: 0,
        currentChunkCount: 0
    });

    for (let i = 0; i < paragraphs.length; i++) {
        const paragraph = paragraphs[i];
        
        if (currentChunk.length === 0 && paragraph.length >= charTarget) {
            chunks.push(paragraph);
            onProgress?.({
                type: 'aggregation_heuristic',
                message: `Aggregating paragraphs... (found oversized paragraph at index ${i})`,
                totalItems: paragraphs.length,
                processedItems: i + 1,
                currentChunkCount: chunks.length
            });
            continue; 
        }

        const separator = currentChunk.length > 0 ? "\n\n" : "";
        if (currentChunk.length + separator.length + paragraph.length > charTarget && currentChunk.length > 0) {
            chunks.push(currentChunk);
            currentChunk = paragraph; 
        } else {
            currentChunk += separator + paragraph;
        }

        if (i % 50 === 0 || i === paragraphs.length - 1) { // Update progress periodically
             onProgress?.({
                type: 'aggregation_heuristic',
                message: `Aggregating paragraphs...`,
                totalItems: paragraphs.length,
                processedItems: i + 1,
                currentChunkCount: chunks.length
            });
        }
    }

    if (currentChunk.length > 0) {
        chunks.push(currentChunk);
    }

    onProgress?.({
        type: 'aggregation_heuristic',
        message: `Finished aggregating. Created ${chunks.length} candidate chunks.`,
        totalItems: paragraphs.length,
        processedItems: paragraphs.length,
        currentChunkCount: chunks.length
    });

    return chunks;
}


export interface CreateChunksProgress {
    type: 'preprocessing' | 'charsplit_initial' | 'charsplit_fine' | 'aggregation_heuristic' | 'validation' | 'error' | 'done';
    message: string;
    processedItems?: number;
    totalItems?: number;
    currentChunkCount?: number;
}

export async function createAudiobookChunks(
  input: ExtractedChapter[] | string[],
  ai: GoogleGenAI | null,
  bookFileNameBase: string = "Audiobook",
  onProgress?: (progress: CreateChunksProgress) => void,
  voicePrompt: string = ""
): Promise<AudiobookChunk[]> {
  if (!ai) {
    onProgress?.({ type: 'error', message: "Gemini API not initialized." });
    throw new Error("Gemini API not initialized for token counting and chunking.");
  }
  
  // Calculate dynamic thresholds based on the constants defined at the top of the file.
  const IDEAL_CHUNK_TOKEN_UPPER_BOUND = Math.floor(IDEAL_TOKENS_PER_CHUNK * IDEAL_CHUNK_SIZE_MULTIPLIER);
  const FINE_GRAINED_RECURSIVE_CHAR_TARGET = Math.floor(IDEAL_CHARS_PER_CHUNK_TARGET / FINE_GRAINED_SPLIT_DIVISOR);

  console.log(`[audiobookUtils] CreateChunks: Hard token limit: ${MAX_TTS_TOKENS}, Ideal token target: ${IDEAL_TOKENS_PER_CHUNK}, Ideal char target: ${IDEAL_CHARS_PER_CHUNK_TARGET}`);

  let fullTextContent: string;
  let mainTitleForChunks: string;

  if (input.length > 0 && typeof (input[0] as ExtractedChapter)?.content === 'string') {
    const chapterInput = input as ExtractedChapter[];
    fullTextContent = chapterInput[0]?.content || "";
    mainTitleForChunks = chapterInput[0]?.title || bookFileNameBase || "BookContent";
  } else if (input.length > 0 && typeof input[0] === 'string') {
    fullTextContent = (input as string[]).join('\n\n');
    mainTitleForChunks = bookFileNameBase || "PastedText";
  } else {
    onProgress?.({ type: 'error', message: "Input for chunking is empty." });
    return [];
  }

  fullTextContent = fullTextContent.trim();
  if (!fullTextContent) {
    onProgress?.({ type: 'done', message: "No content to process." });
    return [];
  }
  
  onProgress?.({ type: 'preprocessing', message: "Splitting text into paragraphs..." });
  const allParagraphs = splitTextIntoParagraphs(fullTextContent);

  onProgress?.({ type: 'aggregation_heuristic', message: `Aggregating ${allParagraphs.length} paragraphs into large chunks based on a character heuristic...` });
  const candidateChunkTexts = aggregateParagraphsIntoChunks(allParagraphs, IDEAL_CHARS_PER_CHUNK_TARGET, onProgress);

  if (candidateChunkTexts.length === 0 && fullTextContent.length > 0) {
     onProgress?.({ type: 'error', message: "Paragraph aggregation resulted in no segments." });
     return [{
        id: crypto.randomUUID(), index: 0, text: "Error: Could not aggregate paragraphs into chunks.",
        fileName: `${bookFileNameBase}_Part_001_AGGREGATE_ERR.wav`, status: 'error',
        errorDetails: "Paragraph aggregation yielded no segments from non-empty input."
     }];
  }
  
  onProgress?.({ type: 'validation', message: `Validating ${candidateChunkTexts.length} candidate chunks by token count...` });
  console.log(`[audiobookUtils] Paragraph aggregation created ${candidateChunkTexts.length} candidate chunks. Now validating tokens.`);

  const finalAudiobookChunks: AudiobookChunk[] = [];
  let chunkIndex = 0;
  
  const transliteratedTitle = transliterate(mainTitleForChunks);
  const sanitizedFileNameBase = (transliteratedTitle.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 50)) || "AudiobookPart";


  const countTokensForText = async (textToCount: string, contextMsg: string): Promise<number> => {
    const MAX_RETRIES = 2;
    const RETRY_DELAY_MS = 1000;
    let lastError: any = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
            if (attempt > 0) {
                console.log(`[TokenCount RETRY] Retrying token count for "${contextMsg}" (Attempt ${attempt + 1})...`);
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * attempt));
            }
            
            // As per documentation, combine prompt and text for accurate counting.
            const fullTextToCount = voicePrompt.trim() ? `${voicePrompt.trim()}: ${textToCount}` : textToCount;

            const tokenCountRequest = {
                model: GEMINI_TOKEN_MODEL,
                contents: [{ parts: [{ text: fullTextToCount }] }],
            };
            const tokenCountResponse = await ai.models.countTokens(tokenCountRequest);
            console.log(`[TokenCount SUCCESS] ${contextMsg}: ${tokenCountResponse.totalTokens} tokens for text length ${fullTextToCount.length}.`);
            return tokenCountResponse.totalTokens;
        } catch (tokenError: any) {
            lastError = tokenError;
            const isServerError = tokenError?.toString().includes('500') || tokenError?.toString().includes('Internal error');
            
            if (isServerError && attempt < MAX_RETRIES) {
                console.warn(`[TokenCount WARN] Attempt ${attempt + 1} failed with a server error for "${contextMsg}". Retrying...`, tokenError);
                continue; 
            } else {
                console.error(`[TokenCount ERROR] ${contextMsg} (Attempt ${attempt + 1}): ${tokenError}. Text (first 100): "${textToCount.substring(0,100).replace(/\n/g, '\\n')}..."`);
                throw tokenError;
            }
        }
    }
    console.error(`[TokenCount FATAL] Failed to count tokens for "${contextMsg}" after all retries.`);
    throw lastError;
  };

  for (let i = 0; i < candidateChunkTexts.length; i++) {
    const candidateText = candidateChunkTexts[i];
    onProgress?.({ type: 'validation', message: `Validating candidate chunk ${i + 1}/${candidateChunkTexts.length}...`, processedItems: i, totalItems: candidateChunkTexts.length, currentChunkCount: finalAudiobookChunks.length });
    
    let tokenCount;
    try {
      tokenCount = await countTokensForText(candidateText, `Candidate chunk ${i + 1}`);
    } catch (error) {
       console.error(`Error counting tokens for candidate chunk ${i + 1}. Skipping.`, error);
       finalAudiobookChunks.push({
          id: crypto.randomUUID(), index: chunkIndex++, text: `Error: Token counting failed. Snippet: ${candidateText.substring(0,100)}...`,
          chapterTitle: mainTitleForChunks,
          fileName: `${sanitizedFileNameBase}_Part_${String(chunkIndex).padStart(3, '0')}_TOKEN_ERR.wav`,
          status: 'error', errorDetails: `Token counting failed for this candidate chunk: ${error instanceof Error ? error.message : String(error)}`
      });
      continue;
    }

    if (tokenCount <= IDEAL_CHUNK_TOKEN_UPPER_BOUND) {
      // This chunk is within the ideal size range. Add it.
      finalAudiobookChunks.push({
        id: crypto.randomUUID(), index: chunkIndex++, text: candidateText, chapterTitle: mainTitleForChunks,
        fileName: `${sanitizedFileNameBase}_Part_${String(chunkIndex).padStart(3, '0')}.wav`,
        status: 'pending', tokenCount: tokenCount
      });
    } else {
      // This chunk is too large. Re-split it.
      onProgress?.({ type: 'validation', message: `Candidate ${i + 1} is too large by tokens (${tokenCount}). Re-splitting...`, processedItems: i, totalItems: candidateChunkTexts.length, currentChunkCount: finalAudiobookChunks.length });
      console.warn(`Candidate chunk ${i+1} (tokens: ${tokenCount}) is OVER IDEAL LIMIT (${IDEAL_CHUNK_TOKEN_UPPER_BOUND}). Re-splitting this candidate.`);
      
      const subSegmentsToValidate = forceSplitTextRecursive_SYNC(candidateText, FINE_GRAINED_RECURSIVE_CHAR_TARGET, (msg,d)=>{ if(d<1) onProgress?.({ type: 'validation', message: `Re-splitting sub-segment: ${msg}`}) }, 0, `oversizedCand${i+1}`);
      
      for (const subSegmentText of subSegmentsToValidate) {
        if (!subSegmentText.trim()) continue;
        let subTokenCount;
        try {
          subTokenCount = await countTokensForText(subSegmentText, `Re-split sub-segment of candidate ${i + 1}`);
        } catch (subError) {
          console.error(`Error counting tokens for re-split sub-segment. Skipping.`, subError);
          finalAudiobookChunks.push({
            id: crypto.randomUUID(), index: chunkIndex++, text: `Error: Token counting failed. Snippet: ${subSegmentText.substring(0,100)}...`,
            chapterTitle: mainTitleForChunks,
            fileName: `${sanitizedFileNameBase}_Part_${String(chunkIndex).padStart(3, '0')}_SUB_TOKEN_ERR.wav`,
            status: 'error', errorDetails: `Token counting failed for this re-split sub-segment: ${subError instanceof Error ? subError.message : String(subError)}`
          });
          continue;
        }

        if (subTokenCount <= MAX_TTS_TOKENS) {
          finalAudiobookChunks.push({
            id: crypto.randomUUID(), index: chunkIndex++, text: subSegmentText, chapterTitle: mainTitleForChunks,
            fileName: `${sanitizedFileNameBase}_Part_${String(chunkIndex).padStart(3, '0')}.wav`,
            status: 'pending', tokenCount: subTokenCount
          });
        } else {
          console.error(`Re-split sub-segment is STILL OVERSIZED (tokens: ${subTokenCount}). Marking as oversized. Text: "${subSegmentText.substring(0,100)}..."`);
          finalAudiobookChunks.push({
            id: crypto.randomUUID(), index: chunkIndex++, text: subSegmentText, chapterTitle: mainTitleForChunks,
            fileName: `${sanitizedFileNameBase}_Part_${String(chunkIndex).padStart(3, '0')}_OVERSIZED.wav`,
            status: 'pending', tokenCount: subTokenCount 
          });
        }
      }
    }
  }
  
  onProgress?.({ type: 'done', message: `Chunking complete. Generated ${finalAudiobookChunks.length} final chunks.`});
  console.log(`[audiobookUtils] Finished validation. Generated ${finalAudiobookChunks.length} final chunks.`);
  return finalAudiobookChunks;
}

declare module '../types' {
    interface AudiobookChunk {
        tokenCount?: number;
    }
}