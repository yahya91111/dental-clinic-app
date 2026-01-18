// ===============================================================
// Encryption Utilities for Patient Data
// ===============================================================
// TEMPORARY: Using Base64 encoding for testing
// TODO: Implement proper encryption for production

//  IMPORTANT: This is NOT secure encryption - just Base64 encoding!
// For testing purposes only. Replace with proper encryption in production.
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'YOUR_ENCRYPTION_KEY_HERE';

// Polyfill for btoa/atob in React Native
const base64Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

// Unicode-safe Base64 encoding (supports Arabic text)
function base64Encode(str: string): string {
  try {
    // Convert Unicode string to UTF-8 bytes representation
    // This handles Arabic and other special characters correctly
    const utf8String = unescape(encodeURIComponent(str));

    let result = '';
    let i = 0;

    while (i < utf8String.length) {
      const char1 = utf8String.charCodeAt(i++);
      const char2 = i < utf8String.length ? utf8String.charCodeAt(i++) : 0;
      const char3 = i < utf8String.length ? utf8String.charCodeAt(i++) : 0;

      const enc1 = char1 >> 2;
      const enc2 = ((char1 & 3) << 4) | (char2 >> 4);
      const enc3 = ((char2 & 15) << 2) | (char3 >> 6);
      const enc4 = char3 & 63;

      result += base64Chars.charAt(enc1);
      result += base64Chars.charAt(enc2);
      result += i - 1 < utf8String.length ? base64Chars.charAt(enc3) : '=';
      result += i < utf8String.length ? base64Chars.charAt(enc4) : '=';
    }

    return result;
  } catch (e) {
    console.error('Base64 encode error:', e);
    return str;
  }
}

// Unicode-safe Base64 decoding (supports Arabic text)
function base64Decode(str: string): string {
  try {
    str = str.replace(/=+$/, '');
    let result = '';

    for (let i = 0; i < str.length; i += 4) {
      const enc1 = base64Chars.indexOf(str.charAt(i));
      const enc2 = base64Chars.indexOf(str.charAt(i + 1));
      const enc3 = base64Chars.indexOf(str.charAt(i + 2));
      const enc4 = base64Chars.indexOf(str.charAt(i + 3));

      const char1 = (enc1 << 2) | (enc2 >> 4);
      const char2 = ((enc2 & 15) << 4) | (enc3 >> 2);
      const char3 = ((enc3 & 3) << 6) | enc4;

      result += String.fromCharCode(char1);
      if (enc3 !== 64 && enc3 !== -1) result += String.fromCharCode(char2);
      if (enc4 !== 64 && enc4 !== -1) result += String.fromCharCode(char3);
    }

    // Convert UTF-8 bytes back to Unicode string
    return decodeURIComponent(escape(result));
  } catch (e) {
    console.error('Base64 decode error:', e);
    return str;
  }
}

/**
 * Encodes a string using Base64 (TEMPORARY - NOT SECURE!)
 * @param data - The plain text to encode
 * @returns Base64 encoded string
 */
export function encryptData(data: string): string {
  if (!data) return '';

  try {
    // Simple Base64 encoding for testing
    // This is NOT secure encryption!
    return base64Encode(data);
  } catch (error) {
    console.error('Encoding error:', error);
    // If encoding fails, just return the data as-is for now
    return data;
  }
}

/**
 * Decodes a Base64 encoded string (TEMPORARY - NOT SECURE!)
 * @param encryptedData - The base64 encoded string
 * @returns Decoded plain text
 */
export function decryptData(encryptedData: string): string {
  if (!encryptedData) return '';

  try {
    // Simple Base64 decoding for testing
    // This is NOT secure decryption!
    return base64Decode(encryptedData);
  } catch (error) {
    console.error('Decoding error:', error);
    // If decoding fails, return the data as-is
    return encryptedData;
  }
}

/**
 * Encrypts patient name (supports Arabic text!)
 * @param name - Patient's full name
 * @returns Encrypted name (Base64 with Unicode support)
 */
export function encryptPatientName(name: string): string {
  // Encrypt using Unicode-safe Base64
  return encryptData(name);
}

/**
 * Decrypts patient name (supports Arabic text!)
 * @param encryptedName - Encrypted patient name
 * @returns Decrypted patient name
 */
export function decryptPatientName(encryptedName: string): string {
  // Decrypt using Unicode-safe Base64
  const decrypted = decryptData(encryptedName);
  // Remove null bytes and trim whitespace
  return decrypted.replace(/\x00/g, '').replace(/\u0000/g, '').trim();
}

/**
 * Encrypts file number
 * @param fileNumber - Patient's file number
 * @returns Encrypted file number
 */
export function encryptFileNumber(fileNumber: string): string {
  return encryptData(fileNumber);
}

/**
 * Decrypts file number
 * @param encryptedFileNumber - Encrypted file number
 * @returns Decrypted file number
 */
export function decryptFileNumber(encryptedFileNumber: string): string {
  const decrypted = decryptData(encryptedFileNumber);
  // Remove null bytes and trim whitespace
  return decrypted.replace(/\x00/g, '').replace(/\u0000/g, '').trim();
}

/**
 * Validates encryption key is set
 * @returns true if key is set, false otherwise
 */
export function isEncryptionKeySet(): boolean {
  return ENCRYPTION_KEY !== 'YOUR_ENCRYPTION_KEY_HERE' && ENCRYPTION_KEY.length >= 32;
}

/**
 * Test encryption/decryption functionality
 * @returns true if encryption is working correctly
 */
export function testEncryption(): boolean {
  try {
    const testData = 'Test Patient Name 123';
    const encrypted = encryptData(testData);
    const decrypted = decryptData(encrypted);

    return decrypted === testData;
  } catch (error) {
    console.error('Encryption test failed:', error);
    return false;
  }
}

// ===============================================================
// Usage Examples
// ===============================================================
/*

// Example 1: Encrypt patient name and file number
const patientName = "أحمد محمد";
const fileNumber = "12345";

const encryptedName = encryptPatientName(patientName);
const encryptedFileNumber = encryptFileNumber(fileNumber);

console.log('Encrypted name:', encryptedName);
console.log('Encrypted file number:', encryptedFileNumber);

// Example 2: Decrypt data from database
const decryptedName = decryptPatientName(encryptedName);
const decryptedFileNumber = decryptFileNumber(encryptedFileNumber);

console.log('Decrypted name:', decryptedName);
console.log('Decrypted file number:', decryptedFileNumber);

// Example 3: Test encryption functionality
if (testEncryption()) {
  console.log('Encryption is working correctly!');
} else {
  console.error('Encryption test failed!');
}

// Example 4: Check if encryption key is set
if (!isEncryptionKeySet()) {
  console.warn(' Encryption key not set! Please add ENCRYPTION_KEY to .env file');
}

*/
