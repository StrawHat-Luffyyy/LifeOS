import crypto from 'crypto';
import { config } from '../config/index.js';
import { AppError } from './errors.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits standard for AES-GCM

export interface EncryptedData {
  ciphertext: string;
  iv: string;
  authTag: string;
}

function getKeyBuffer(customKeyHex?: string): Buffer {
  const keyHex = customKeyHex ?? config.INTEGRATION_ENCRYPTION_KEY;
  if (!keyHex) {
    throw new AppError(
      'Integration encryption key is not configured. Set INTEGRATION_ENCRYPTION_KEY in .env',
      500,
      'ENCRYPTION_KEY_NOT_CONFIGURED',
      false,
    );
  }
  const keyBuffer = Buffer.from(keyHex, 'hex');
  if (keyBuffer.length !== 32) {
    throw new AppError(
      'Invalid encryption key length: must be exactly 32 bytes (64 hex characters)',
      500,
      'INVALID_ENCRYPTION_KEY',
      false,
    );
  }
  return keyBuffer;
}

/**
 * Encrypts a plaintext token using AES-256-GCM.
 * Sourced from the configured INTEGRATION_ENCRYPTION_KEY or a passed key.
 */
export function encryptToken(plaintext: string, customKeyHex?: string): EncryptedData {
  const key = getKeyBuffer(customKeyHex);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const ciphertextBuffer = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  return {
    ciphertext: ciphertextBuffer.toString('hex'),
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
  };
}

/**
 * Decrypts an AES-256-GCM encrypted token.
 * Throws if authentication tag verification fails (tampering/wrong key).
 */
export function decryptToken(
  ciphertext: string,
  iv: string,
  authTag: string,
  customKeyHex?: string,
): string {
  const key = getKeyBuffer(customKeyHex);
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(iv, 'hex'),
    { authTagLength: 16 },
  );
  decipher.setAuthTag(Buffer.from(authTag, 'hex'));

  const decryptedBuffer = Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'hex')),
    decipher.final(),
  ]);

  return decryptedBuffer.toString('utf8');
}
