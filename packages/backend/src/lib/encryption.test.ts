import { describe, it, expect } from 'vitest';
import { encryptToken, decryptToken } from './encryption.js';

describe('Encryption Utility (AES-256-GCM)', () => {
  const testKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const alternateKey = 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210';
  const sampleToken = 'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890';

  it('encrypts and decrypts a token successfully (roundtrip)', () => {
    const encrypted = encryptToken(sampleToken, testKey);
    expect(encrypted.ciphertext).toBeDefined();
    expect(encrypted.iv).toBeDefined();
    expect(encrypted.authTag).toBeDefined();

    const decrypted = decryptToken(encrypted.ciphertext, encrypted.iv, encrypted.authTag, testKey);
    expect(decrypted).toBe(sampleToken);
  });

  it('ensures ciphertext does not match plaintext', () => {
    const encrypted = encryptToken(sampleToken, testKey);
    expect(encrypted.ciphertext).not.toContain(sampleToken);
    expect(encrypted.ciphertext).not.toBe(sampleToken);
  });

  it('generates distinct IV and ciphertext for identical inputs (semantic security)', () => {
    const enc1 = encryptToken(sampleToken, testKey);
    const enc2 = encryptToken(sampleToken, testKey);

    expect(enc1.iv).not.toBe(enc2.iv);
    expect(enc1.ciphertext).not.toBe(enc2.ciphertext);

    // But both decrypt to the same plaintext
    expect(decryptToken(enc1.ciphertext, enc1.iv, enc1.authTag, testKey)).toBe(sampleToken);
    expect(decryptToken(enc2.ciphertext, enc2.iv, enc2.authTag, testKey)).toBe(sampleToken);
  });

  it('fails to decrypt if wrong key is provided', () => {
    const encrypted = encryptToken(sampleToken, testKey);
    expect(() => {
      decryptToken(encrypted.ciphertext, encrypted.iv, encrypted.authTag, alternateKey);
    }).toThrow();
  });

  it('fails to decrypt if ciphertext is tampered with', () => {
    const encrypted = encryptToken(sampleToken, testKey);
    const cipherBuf = Buffer.from(encrypted.ciphertext, 'hex');
    cipherBuf[0] = (cipherBuf[0] ?? 0) ^ 0xff;
    const tamperedCiphertext = cipherBuf.toString('hex');
    expect(() => {
      decryptToken(tamperedCiphertext, encrypted.iv, encrypted.authTag, testKey);
    }).toThrow();
  });

  it('fails to decrypt if authTag is tampered with', () => {
    const encrypted = encryptToken(sampleToken, testKey);
    const tagBuf = Buffer.from(encrypted.authTag, 'hex');
    tagBuf[0] = (tagBuf[0] ?? 0) ^ 0xff;
    const tamperedTag = tagBuf.toString('hex');
    expect(() => {
      decryptToken(encrypted.ciphertext, encrypted.iv, tamperedTag, testKey);
    }).toThrow();
  });

  it('throws when an invalid key length is supplied', () => {
    expect(() => {
      encryptToken(sampleToken, 'shortkey');
    }).toThrow(/Invalid encryption key length/);
  });
});
