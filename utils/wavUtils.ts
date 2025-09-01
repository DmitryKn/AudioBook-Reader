// utils/wavUtils.ts

/**
 * Helper function to write a string to a DataView.
 * @param view The DataView to write to.
 * @param offset The offset at which to start writing.
 * @param string The string to write.
 */
function writeString(view: DataView, offset: number, string: string): void {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

/**
 * Creates a WAV audio Blob from raw PCM data (base64 encoded).
 * The PCM data is assumed to be signed 16-bit little-endian.
 * @param base64PcmData The base64 encoded string of raw PCM audio data.
 * @param sampleRate The sample rate of the audio (e.g., 24000 Hz).
 * @param channels The number of audio channels (e.g., 1 for mono, 2 for stereo).
 * @param bitDepth The bit depth of the audio (e.g., 16 for 16-bit audio).
 * @returns A Blob containing the WAV audio data.
 */
export function createWavBlobFromPcm(
  base64PcmData: string,
  sampleRate: number = 24000,
  channels: number = 1,
  bitDepth: number = 16
): Blob {
  console.log(`[createWavBlobFromPcm] Input base64 length: ${base64PcmData?.length || 'N/A'}. SampleRate: ${sampleRate}, Channels: ${channels}, BitDepth: ${bitDepth}`);
  
  if (!base64PcmData || base64PcmData.trim() === "") {
    console.error("[createWavBlobFromPcm] Received empty or whitespace-only base64 PCM data string.");
    return new Blob([], { type: 'audio/wav' });
  }

  let pcmDataBytes: Uint8Array;
  try {
    const byteCharacters = atob(base64PcmData);
    pcmDataBytes = new Uint8Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      pcmDataBytes[i] = byteCharacters.charCodeAt(i);
    }
    console.log(`[createWavBlobFromPcm] Decoded base64 to byte array. pcmDataBytes length: ${pcmDataBytes.length}`);
    if (pcmDataBytes.length === 0 && base64PcmData.length > 0) {
        console.warn("[createWavBlobFromPcm] 'atob' resulted in 0 length byte array from non-empty base64 string. Base64 (first 50 chars):", base64PcmData.substring(0,50) + "...");
    }
  } catch (e: any) {
    console.error("[createWavBlobFromPcm] Error during 'atob' decoding base64 PCM data:", e.message, "Base64 (first 50 chars):", base64PcmData.substring(0,50) + "...");
    return new Blob([], { type: 'audio/wav' }); // Return empty blob on error
  }

  // Trim trailing silence to fix issues where the model generates long empty audio sections.
  if (bitDepth === 16 && pcmDataBytes.length > 0) {
    const SILENCE_THRESHOLD = 5; // For 16-bit audio (-32768 to 32767). A very quiet threshold.
    const MIN_SILENCE_DURATION_MS = 2000; // Trim only if there's >2 seconds of silence.
    const PADDING_DURATION_MS = 500; // Leave 0.5s of silence at the end after trimming.
    const BYTES_PER_SAMPLE = 2;

    const samples = pcmDataBytes.length / BYTES_PER_SAMPLE;
    const minSilenceSamples = (MIN_SILENCE_DURATION_MS / 1000) * sampleRate;
    let lastNonSilentSample = -1;

    const dataView = new DataView(pcmDataBytes.buffer, pcmDataBytes.byteOffset, pcmDataBytes.byteLength);

    for (let i = samples - 1; i >= 0; i--) {
        const sampleValue = dataView.getInt16(i * BYTES_PER_SAMPLE, true); // true for little-endian
        if (Math.abs(sampleValue) > SILENCE_THRESHOLD) {
            lastNonSilentSample = i;
            break;
        }
    }

    // Check if trimming is needed and possible
    if (lastNonSilentSample > -1 && (samples - lastNonSilentSample) > minSilenceSamples) {
        const originalSize = pcmDataBytes.length;
        const paddingSamples = Math.floor((PADDING_DURATION_MS / 1000) * sampleRate);
        const newSampleCount = Math.min(samples, lastNonSilentSample + paddingSamples);
        const newByteLength = newSampleCount * BYTES_PER_SAMPLE;
        
        console.log(`[createWavBlobFromPcm] Detected long trailing silence. Trimming audio from ${originalSize} bytes to ${newByteLength} bytes.`);
        pcmDataBytes = pcmDataBytes.subarray(0, newByteLength);
    }
  }

  const bytesPerSample = bitDepth / 8;
  const blockAlign = channels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  let dataSize = pcmDataBytes.length;

  // Ensure data size is a multiple of the block alignment (sample frame size).
  // This is still important after trimming to prevent clicks.
  if (dataSize % blockAlign !== 0) {
    const originalSize = dataSize;
    dataSize = Math.floor(dataSize / blockAlign) * blockAlign;
    console.warn(`[createWavBlobFromPcm] PCM data size after potential trimming (${originalSize}) is not a multiple of blockAlign (${blockAlign}). Final truncation to ${dataSize} bytes.`);
    pcmDataBytes = pcmDataBytes.subarray(0, dataSize);
  }

  if (dataSize === 0) {
    console.warn("[createWavBlobFromPcm] pcmDataBytes length is 0 after decoding/trimming. Resulting WAV will be header-only.");
  }

  // WAV header size is 44 bytes
  const headerSize = 44;
  const buffer = new ArrayBuffer(headerSize + dataSize);
  const view = new DataView(buffer);

  // RIFF chunk descriptor
  writeString(view, 0, 'RIFF'); // ChunkID
  view.setUint32(4, headerSize + dataSize - 8, true); // ChunkSize (filesize - 8)
  writeString(view, 8, 'WAVE'); // Format

  // fmt sub-chunk
  writeString(view, 12, 'fmt '); // Subchunk1ID
  view.setUint32(16, 16, true);  // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true);   // AudioFormat (1 for PCM)
  view.setUint16(22, channels, true); // NumChannels
  view.setUint32(24, sampleRate, true); // SampleRate
  view.setUint32(28, byteRate, true); // ByteRate
  view.setUint16(32, blockAlign, true); // BlockAlign
  view.setUint16(34, bitDepth, true); // BitsPerSample

  // data sub-chunk
  writeString(view, 36, 'data'); // Subchunk2ID
  view.setUint32(40, dataSize, true); // Subchunk2Size (actual data size)

  // Write PCM data
  for (let i = 0; i < dataSize; i++) {
    view.setUint8(headerSize + i, pcmDataBytes[i]);
  }

  return new Blob([view], { type: 'audio/wav' });
}
