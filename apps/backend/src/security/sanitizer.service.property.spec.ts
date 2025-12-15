import * as fc from 'fast-check';
import { SanitizerService } from './sanitizer.service';

/**
 * Property test for XSS Sanitization
 * **Feature: deployment-risk-analyzer, Property 22: XSS Sanitization**
 * **Validates: Requirements 11.3**
 *
 * For any user-generated content string containing HTML tags or JavaScript,
 * sanitization should remove or escape all potentially dangerous elements
 * while preserving safe text content.
 */

describe('XSS Sanitization Property', () => {
  let sanitizerService: SanitizerService;

  beforeEach(() => {
    sanitizerService = new SanitizerService();
  });

  /**
   * Property 22: XSS Sanitization
   * For any user-generated content string containing HTML tags or JavaScript,
   * sanitization should remove or escape all potentially dangerous elements
   * while preserving safe text content.
   */
  it('should escape all HTML special characters', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 1000 }),
        (input) => {
          const sanitized = sanitizerService.escapeHtml(input);

          // After escaping, the output should not contain unescaped special chars
          // (unless they were already escaped in the input)
          expect(sanitized).not.toMatch(/<(?!amp;|lt;|gt;|quot;|#x27;|#x2F;|#x60;|#x3D;)/);
          expect(sanitized).not.toMatch(/>(?!amp;|lt;|gt;|quot;|#x27;|#x2F;|#x60;|#x3D;)/);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should remove script tags from any input', () => {
    // Generator for strings with script tags
    const scriptTagArb = fc.tuple(
      fc.string({ minLength: 0, maxLength: 100 }),
      fc.string({ minLength: 0, maxLength: 100 }),
      fc.string({ minLength: 0, maxLength: 100 }),
    ).map(([before, content, after]) => 
      `${before}<script>${content}</script>${after}`
    );

    fc.assert(
      fc.property(scriptTagArb, (input) => {
        const sanitized = sanitizerService.removeDangerousPatterns(input);

        // Script tags should be removed
        expect(sanitized.toLowerCase()).not.toContain('<script');
        expect(sanitized.toLowerCase()).not.toContain('</script>');
      }),
      { numRuns: 100 },
    );
  });

  it('should remove javascript: protocol from any input', () => {
    const jsProtocolArb = fc.tuple(
      fc.string({ minLength: 0, maxLength: 100 }),
      fc.string({ minLength: 0, maxLength: 100 }),
    ).map(([before, after]) => `${before}javascript:alert(1)${after}`);

    fc.assert(
      fc.property(jsProtocolArb, (input) => {
        const sanitized = sanitizerService.removeDangerousPatterns(input);

        expect(sanitized.toLowerCase()).not.toContain('javascript:');
      }),
      { numRuns: 100 },
    );
  });

  it('should remove event handlers from any input', () => {
    const eventHandlers = ['onclick', 'onerror', 'onload', 'onmouseover', 'onfocus'];
    const eventHandlerArb = fc.tuple(
      fc.string({ minLength: 0, maxLength: 100 }),
      fc.constantFrom(...eventHandlers),
      fc.string({ minLength: 0, maxLength: 100 }),
    ).map(([before, handler, after]) => `${before}${handler}=alert(1)${after}`);

    fc.assert(
      fc.property(eventHandlerArb, (input) => {
        const sanitized = sanitizerService.removeDangerousPatterns(input);

        // Event handlers should be removed
        expect(sanitized).not.toMatch(/on\w+\s*=/i);
      }),
      { numRuns: 100 },
    );
  });

  it('should preserve safe text content after sanitization', () => {
    // Generator for safe alphanumeric strings
    const safeTextArb = fc.stringMatching(/^[a-zA-Z0-9\s]+$/);

    fc.assert(
      fc.property(safeTextArb, (input) => {
        const sanitized = sanitizerService.sanitize(input);

        // Safe text should be preserved (possibly with some escaping)
        // The sanitized output should contain the same alphanumeric characters
        const inputAlphanumeric = input.replace(/[^a-zA-Z0-9]/g, '');
        const sanitizedAlphanumeric = sanitized.replace(/[^a-zA-Z0-9]/g, '');

        expect(sanitizedAlphanumeric).toBe(inputAlphanumeric);
      }),
      { numRuns: 100 },
    );
  });

  it('should return empty string for null/undefined/non-string inputs', () => {
    expect(sanitizerService.sanitize(null as unknown as string)).toBe('');
    expect(sanitizerService.sanitize(undefined as unknown as string)).toBe('');
    expect(sanitizerService.sanitize(123 as unknown as string)).toBe('');
    expect(sanitizerService.sanitize({} as unknown as string)).toBe('');
  });

  it('should detect dangerous content correctly', () => {
    const dangerousInputs = [
      '<script>alert(1)</script>',
      'javascript:void(0)',
      '<img onerror=alert(1)>',
      '<a onclick=steal()>',
      'data:text/html,<script>',
    ];

    for (const input of dangerousInputs) {
      expect(sanitizerService.containsDangerousContent(input)).toBe(true);
    }
  });

  it('should not flag safe content as dangerous', () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[a-zA-Z0-9\s.,!?]+$/),
        (input) => {
          expect(sanitizerService.containsDangerousContent(input)).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should strip all HTML tags', () => {
    const htmlTagArb = fc.tuple(
      fc.string({ minLength: 0, maxLength: 50 }),
      fc.constantFrom('div', 'span', 'p', 'a', 'img', 'br'),
      fc.string({ minLength: 0, maxLength: 50 }),
      fc.string({ minLength: 0, maxLength: 50 }),
    ).map(([before, tag, content, after]) => 
      `${before}<${tag}>${content}</${tag}>${after}`
    );

    fc.assert(
      fc.property(htmlTagArb, (input) => {
        const stripped = sanitizerService.stripHtmlTags(input);

        expect(stripped).not.toMatch(/<[^>]*>/);
      }),
      { numRuns: 100 },
    );
  });

  it('should sanitize nested objects recursively', () => {
    const nestedObjectArb = fc.record({
      name: fc.string({ minLength: 1, maxLength: 50 }),
      description: fc.constant('<script>alert(1)</script>Safe text'),
      nested: fc.record({
        value: fc.constant('onclick=steal()'),
      }),
    });

    fc.assert(
      fc.property(nestedObjectArb, (obj) => {
        const sanitized = sanitizerService.sanitizeObject(obj);

        // Check that dangerous content is removed/escaped
        expect(sanitized.description).not.toContain('<script>');
        expect(sanitized.nested.value).not.toMatch(/onclick\s*=/i);
      }),
      { numRuns: 100 },
    );
  });
});
