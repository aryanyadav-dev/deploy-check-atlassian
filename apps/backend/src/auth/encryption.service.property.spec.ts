import * as fc from 'fast-check';
import { EncryptionService } from './encryption.service';

/**
 * Property test for Token Encryption Round-Trip
 * **Feature: deployment-risk-analyzer, Property 8: Token Encryption Round-Trip**
 * **Validates: Requirements 8.5**
 *
 * For any OAuth token string, encrypting with KMS and decrypting should produce
 * the original token string.
 */

describe('Token Encryption Round-Trip Property', () => {
  let encryptionService: EncryptionService;

  beforeEach(() => {
    encryptionService = new EncryptionService();
  });

  /**
   * Property 8: Token Encryption Round-Trip
   * For any OAuth token string, encrypting and decrypting should produce
   * the original token string.
   */
  it('should preserve token through encryption/decryption round-trip', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 1000 }),
        (token) => {
          const encrypted = encryptionService.encrypt(token);
          const decrypted = encryptionService.decrypt(encrypted);

          expect(decrypted).toBe(token);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should handle OAuth-like token formats', () => {
    // Generator for realistic OAuth token formats
    const hexCharArb = fc.constantFrom(...'0123456789abcdef'.split(''));
    const hexStringArb = fc.array(hexCharArb, { minLength: 32, maxLength: 64 }).map(arr => arr.join(''));
    
    const oauthTokenArbitrary = fc.oneof(
      // JWT-like tokens (header.payload.signature)
      fc.tuple(
        fc.base64String({ minLength: 10, maxLength: 100 }),
        fc.base64String({ minLength: 10, maxLength: 200 }),
        fc.base64String({ minLength: 10, maxLength: 100 }),
      ).map(([h, p, s]) => `${h}.${p}.${s}`),
      // Simple bearer tokens (hex-like)
      hexStringArb,
      // UUID-based tokens
      fc.uuid(),
    );

    fc.assert(
      fc.property(oauthTokenArbitrary, (token) => {
        const encrypted = encryptionService.encrypt(token);
        const decrypted = encryptionService.decrypt(encrypted);

        expect(decrypted).toBe(token);
      }),
      { numRuns: 100 },
    );
  });

  it('should produce different ciphertext for same plaintext (due to random IV)', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 100 }),
        (token) => {
          const encrypted1 = encryptionService.encrypt(token);
          const encrypted2 = encryptionService.encrypt(token);

          // Ciphertexts should be different due to random IV
          expect(encrypted1).not.toBe(encrypted2);

          // But both should decrypt to the same value
          expect(encryptionService.decrypt(encrypted1)).toBe(token);
          expect(encryptionService.decrypt(encrypted2)).toBe(token);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should be idempotent - multiple round trips produce same result', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 500 }),
        (token) => {
          // First round trip
          const encrypted1 = encryptionService.encrypt(token);
          const decrypted1 = encryptionService.decrypt(encrypted1);

          // Second round trip
          const encrypted2 = encryptionService.encrypt(decrypted1);
          const decrypted2 = encryptionService.decrypt(encrypted2);

          expect(decrypted1).toBe(token);
          expect(decrypted2).toBe(token);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should handle special characters and unicode', () => {
    // Generator for strings with special characters
    const specialCharsArb = fc.string({ minLength: 1, maxLength: 500 }).map(s => 
      s + '!@#$%^&*()_+-=[]{}|;:,.<>?/~`' + '日本語' + 'émojis🎉'
    );

    fc.assert(
      fc.property(
        specialCharsArb,
        (token: string) => {
          const encrypted = encryptionService.encrypt(token);
          const decrypted = encryptionService.decrypt(encrypted);

          expect(decrypted).toBe(token);
        },
      ),
      { numRuns: 100 },
    );
  });
});
