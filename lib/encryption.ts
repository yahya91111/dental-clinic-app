// ===============================================================
// Encryption Utilities for Patient Data
// ===============================================================
// TEMPORARY: Using Base64 encoding for testing
// TODO: Implement proper encryption for production

//  IMPORTANT: This is NOT secure encryption - just Base64 encoding!
// For testing purposes only. Replace with proper encryption in production.
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'YOUR_ENCRYPTION_KEY_HERE';

// Base64 character set
const base64Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';

/**
 * Unicode-safe Base64 encoding
 * Converts Unicode string → UTF-8 → Base64
 * Supports Arabic, Emoji, and all Unicode characters
 */
function base64Encode(str: string): string {
  try {
    // Step 1: Convert Unicode string to UTF-8 encoded URI component
    const utf8 = encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1) => {
      return String.fromCharCode(parseInt(p1, 16));
    });

    // Step 2: Convert to Base64
    let output = '';
    let i = 0;

    while (i < utf8.length) {
      const chr1 = utf8.charCodeAt(i++);
      const chr2 = i < utf8.length ? utf8.charCodeAt(i++) : 0;
      const chr3 = i < utf8.length ? utf8.charCodeAt(i++) : 0;

      const enc1 = chr1 >> 2;
      const enc2 = ((chr1 & 3) << 4) | (chr2 >> 4);
      const enc3 = ((chr2 & 15) << 2) | (chr3 >> 6);
      const enc4 = chr3 & 63;

      output += base64Chars.charAt(enc1) + base64Chars.charAt(enc2);
      output += (chr2 !== 0) ? base64Chars.charAt(enc3) : '=';
      output += (chr3 !== 0) ? base64Chars.charAt(enc4) : '=';
    }

    return output;
  } catch (e) {
    console.error('Base64 encode error:', e);
    return str;
  }
}

/**
 * Unicode-safe Base64 decoding
 * Converts Base64 → UTF-8 → Unicode string
 * Supports Arabic, Emoji, and all Unicode characters
 */
function base64Decode(str: string): string {
  try {
    // Step 1: Decode Base64 to UTF-8
    let output = '';
    let i = 0;

    // Remove padding and whitespace
    str = str.replace(/[^A-Za-z0-9+/]/g, '');

    while (i < str.length) {
      const enc1 = base64Chars.indexOf(str.charAt(i++));
      const enc2 = base64Chars.indexOf(str.charAt(i++));
      const enc3 = base64Chars.indexOf(str.charAt(i++));
      const enc4 = base64Chars.indexOf(str.charAt(i++));

      const chr1 = (enc1 << 2) | (enc2 >> 4);
      const chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
      const chr3 = ((enc3 & 3) << 6) | enc4;

      output += String.fromCharCode(chr1);
      if (enc3 !== 64) output += String.fromCharCode(chr2);
      if (enc4 !== 64) output += String.fromCharCode(chr3);
    }

    // Step 2: Convert UTF-8 to Unicode
    try {
      return decodeURIComponent(output.split('').map(c => {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));
    } catch (uriError) {
      // If decodeURIComponent fails, the data might be encrypted with old method
      console.warn('⚠️ Unable to decode - data might be encrypted with old method');
      console.warn('⚠️ Please delete old data and re-create patients');
      return '[Encrypted - Old Data]'; // Return placeholder instead of crash
    }
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
