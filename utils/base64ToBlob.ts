// utils/base64ToBlob.ts

export const base64ToBlob = (base64: string, type: string = 'application/octet-stream'): Blob => {
  try {
    const byteCharacters = atob(base64); // This is the most likely point of failure for bad base64
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type });
  } catch (error: any) { // Catch specifically for atob issues
    console.error(`Error in base64ToBlob during atob for type ${type}: ${error.message}. Base64 (first 50 chars): ${base64.substring(0,50)}...`);
    // Return an empty blob of the specified type on error, so size check will catch it
    return new Blob([], { type });
  }
};