import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

/**
 * Service for encrypting and decrypting sensitive data like OAuth tokens.
 * Uses AES-256-GCM for authenticated encryption.
 * In production, this would integrate with AWS KMS or similar.
 */
@Injectable()
export class EncryptionService {
  private readonly algorithm = 'aes-256-gcm';
  private readonly keyLength = 32; // 256 bits
  private readonly ivLength = 16; // 128 bits
  private readonly authTagLength = 16; // 128 bits

  private getEncryptionKey(): Buffer {
    const key = process.env.ENCRYPTION_KEY;
    if (!key) {
      // For development, use a default key (NOT for production!)
      return crypto.scryptSync('dev-secret-key', 'salt', this.keyLength);
    }
    // In production, this would be fetched from KMS
    return Buffer.from(key, 'hex');
  }

  /**
   * Encrypts a plaintext string using AES-256-GCM.
   * Returns a base64-encoded string containing IV + authTag + ciphertext.
   */
  encrypt(plaintext: string): string {
    const key = this.getEncryptionKey();
    const iv = crypto.randomBytes(this.ivLength);
    
    const cipher = crypto.createCipheriv(this.algorithm, key, iv);
    
    let encrypted = cipher.update(plaintext, 'utf8');
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    
    const authTag = cipher.getAuthTag();
    
    // Combine IV + authTag + ciphertext
    const combined = Buffer.concat([iv, authTag, encrypted]);
    
    return combined.toString('base64');
  }

  /**
   * Decrypts a base64-encoded encrypted string.
   * Expects format: IV (16 bytes) + authTag (16 bytes) + ciphertext
   */
  decrypt(encryptedData: string): string {
    const key = this.getEncryptionKey();
    const combined = Buffer.from(encryptedData, 'base64');
    
    // Extract IV, authTag, and ciphertext
    const iv = combined.subarray(0, this.ivLength);
    const authTag = combined.subarray(this.ivLength, this.ivLength + this.authTagLength);
    const ciphertext = combined.subarray(this.ivLength + this.authTagLength);
    
    const decipher = crypto.createDecipheriv(this.algorithm, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(ciphertext);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    
    return decrypted.toString('utf8');
  }
}
