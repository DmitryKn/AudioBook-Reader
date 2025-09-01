// utils/mimeUtils.ts

export interface AudioParameters {
  sampleRate: number;
  bitDepth: number;
  channels: number;
}

/**
 * Parses bits per sample and rate from an audio MIME type string.
 * Assumes bits per sample is encoded like "L16" and rate as "rate=xxxxx".
 * @param mimeType The audio MIME type string (e.g., "audio/L16;rate=24000").
 * @returns An object with "sampleRate", "bitDepth", and "channels".
 */
export function parseAudioMimeType(mimeType: string): AudioParameters {
  // Defaults based on Gemini TTS documentation for LINEAR16
  const defaults: AudioParameters = {
    sampleRate: 24000,
    bitDepth: 16,
    channels: 1, // Gemini TTS for LINEAR16 is mono
  };

  if (!mimeType) {
    return defaults;
  }

  let parsedRate = defaults.sampleRate;
  let parsedBitDepth = defaults.bitDepth;

  const parts = mimeType.toLowerCase().split(';');

  // Main type part, e.g., "audio/l16"
  const mainType = parts[0];
  const bitDepthMatch = mainType.match(/l(\d+)/);
  if (bitDepthMatch && bitDepthMatch[1]) {
    try {
      parsedBitDepth = parseInt(bitDepthMatch[1], 10);
    } catch (e) {
      console.warn(`[mimeUtils] Could not parse bit depth from "${mainType}". Using default ${defaults.bitDepth}.`);
    }
  }

  // Parameter parts, e.g., "rate=24000"
  for (let i = 1; i < parts.length; i++) {
    const param = parts[i].trim();
    if (param.startsWith("rate=")) {
      try {
        const rateStr = param.split("=", 2)[1];
        if (rateStr) {
          parsedRate = parseInt(rateStr, 10);
        }
      } catch (e) {
        console.warn(`[mimeUtils] Could not parse rate from "${param}". Using default ${defaults.sampleRate}.`);
      }
    }
    // Could add channel parsing here if the API ever supports it, e.g., "channels=2"
  }
  
  console.log(`[mimeUtils] Parsed "${mimeType}" to: SR=${parsedRate}, Depth=${parsedBitDepth}, Ch=${defaults.channels}`);
  return {
    sampleRate: parsedRate,
    bitDepth: parsedBitDepth,
    channels: defaults.channels,
  };
}
