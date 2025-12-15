import { Injectable } from '@nestjs/common';

/**
 * Service for sanitizing user-generated content to prevent XSS attacks.
 * Escapes HTML entities and removes potentially dangerous elements.
 */
@Injectable()
export class SanitizerService {
  /**
   * HTML entities to escape
   */
  private readonly htmlEntities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;',
    '`': '&#x60;',
    '=': '&#x3D;',
  };

  /**
   * Patterns that indicate potentially dangerous content
   */
  private readonly dangerousPatterns: RegExp[] = [
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    /javascript:/gi,
    /on\w+\s*=/gi, // onclick=, onerror=, etc.
    /data:/gi,
    /vbscript:/gi,
    /expression\s*\(/gi,
  ];

  /**
   * Escapes HTML entities in a string to prevent XSS.
   * @param input - The string to sanitize
   * @returns The sanitized string with HTML entities escaped
   */
  escapeHtml(input: string): string {
    if (!input || typeof input !== 'string') {
      return '';
    }

    return input.replace(/[&<>"'`=/]/g, (char) => this.htmlEntities[char] || char);
  }

  /**
   * Removes potentially dangerous HTML/JavaScript patterns from a string.
   * @param input - The string to sanitize
   * @returns The sanitized string with dangerous patterns removed
   */
  removeDangerousPatterns(input: string): string {
    if (!input || typeof input !== 'string') {
      return '';
    }

    let result = input;
    for (const pattern of this.dangerousPatterns) {
      result = result.replace(pattern, '');
    }
    return result;
  }

  /**
   * Fully sanitizes user content by escaping HTML and removing dangerous patterns.
   * @param input - The string to sanitize
   * @returns The fully sanitized string
   */
  sanitize(input: string): string {
    if (!input || typeof input !== 'string') {
      return '';
    }

    // First remove dangerous patterns, then escape remaining HTML
    const withoutDangerous = this.removeDangerousPatterns(input);
    return this.escapeHtml(withoutDangerous);
  }

  /**
   * Sanitizes an object's string properties recursively.
   * @param obj - The object to sanitize
   * @returns A new object with sanitized string values
   */
  sanitizeObject<T extends Record<string, unknown>>(obj: T): T {
    if (!obj || typeof obj !== 'object') {
      return obj;
    }

    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        result[key] = this.sanitize(value);
      } else if (Array.isArray(value)) {
        result[key] = value.map((item) =>
          typeof item === 'string'
            ? this.sanitize(item)
            : typeof item === 'object' && item !== null
              ? this.sanitizeObject(item as Record<string, unknown>)
              : item,
        );
      } else if (typeof value === 'object' && value !== null) {
        result[key] = this.sanitizeObject(value as Record<string, unknown>);
      } else {
        result[key] = value;
      }
    }

    return result as T;
  }

  /**
   * Checks if a string contains potentially dangerous content.
   * @param input - The string to check
   * @returns true if dangerous content is detected
   */
  containsDangerousContent(input: string): boolean {
    if (!input || typeof input !== 'string') {
      return false;
    }

    // Create fresh regex patterns to avoid lastIndex issues with global flag
    const patterns = [
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/i,
      /javascript:/i,
      /on\w+\s*=/i,
      /data:/i,
      /vbscript:/i,
      /expression\s*\(/i,
    ];

    return patterns.some((pattern) => pattern.test(input));
  }

  /**
   * Extracts safe text content from a string, removing all HTML tags.
   * @param input - The string to process
   * @returns Plain text with all HTML tags removed
   */
  stripHtmlTags(input: string): string {
    if (!input || typeof input !== 'string') {
      return '';
    }

    return input.replace(/<[^>]*>/g, '');
  }
}
