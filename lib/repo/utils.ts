import * as Crypto from 'expo-crypto';

// Strong UUID generation using expo-crypto or polyfill
export function uuid(): string {
  // Use expo-crypto if available and has randomUUID
  if (Crypto.randomUUID) {
    return Crypto.randomUUID();
  }
  
  // Fallback version 4 UUID
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
