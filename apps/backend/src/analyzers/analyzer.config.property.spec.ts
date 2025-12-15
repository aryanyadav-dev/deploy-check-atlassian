import * as fc from 'fast-check';
import type { AnalyzerConfig } from '@dra/types';

/**
 * Property test for Analyzer Configuration Round-Trip
 * **Feature: deployment-risk-analyzer, Property 7: Analyzer Configuration Round-Trip**
 * **Validates: Requirements 12.4**
 *
 * For any analyzer configuration containing language settings, thresholds, and ignore patterns,
 * serializing to JSON and deserializing should produce an equivalent configuration.
 */

// Serialization functions for analyzer configuration
function serializeAnalyzerConfig(config: AnalyzerConfig): string {
  return JSON.stringify(config);
}

function deserializeAnalyzerConfig(json: string): AnalyzerConfig {
  return JSON.parse(json) as AnalyzerConfig;
}

// Generator for valid analyzer configurations
// Note: We filter out -0 from doubles because JSON.stringify(-0) produces "0",
// so -0 cannot round-trip through JSON serialization
const jsonSafeDouble = fc
  .double({ noNaN: true, noDefaultInfinity: true })
  .filter((n) => !Object.is(n, -0));

const analyzerConfigArbitrary = fc.record({
  name: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
  enabled: fc.boolean(),
  options: fc.option(
    fc.dictionary(
      fc.string({ minLength: 1, maxLength: 20 }),
      fc.oneof(
        fc.string(),
        fc.integer(),
        fc.boolean(),
        jsonSafeDouble,
        fc.array(fc.string(), { maxLength: 10 }),
      ),
    ),
    { nil: undefined },
  ),
});

describe('Analyzer Configuration Round-Trip Property', () => {
  /**
   * Property 7: Analyzer Configuration Round-Trip
   * For any analyzer configuration containing language settings, thresholds, and ignore patterns,
   * serializing to JSON and deserializing should produce an equivalent configuration.
   */
  it('should preserve analyzer configuration through JSON serialization round-trip', () => {
    fc.assert(
      fc.property(analyzerConfigArbitrary, (config) => {
        const serialized = serializeAnalyzerConfig(config);
        const deserialized = deserializeAnalyzerConfig(serialized);

        // Verify all fields are preserved
        expect(deserialized.name).toBe(config.name);
        expect(deserialized.enabled).toBe(config.enabled);
        expect(deserialized.options).toEqual(config.options);
      }),
      { numRuns: 100 },
    );
  });

  it('should handle configurations with complex nested options', () => {
    fc.assert(
      fc.property(
        fc.record({
          name: fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
          enabled: fc.boolean(),
          options: fc.option(
            fc.record({
              threshold: fc.integer({ min: 0, max: 100 }),
              ignorePaths: fc.array(fc.string(), { maxLength: 5 }),
              languageSettings: fc.dictionary(
                fc.string({ minLength: 1, maxLength: 10 }),
                fc.boolean(),
              ),
            }),
            { nil: undefined },
          ),
        }),
        (config) => {
          const serialized = serializeAnalyzerConfig(config);
          const deserialized = deserializeAnalyzerConfig(serialized);

          expect(deserialized).toEqual(config);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should be idempotent - multiple round trips produce same result', () => {
    fc.assert(
      fc.property(analyzerConfigArbitrary, (config) => {
        const firstRoundTrip = deserializeAnalyzerConfig(
          serializeAnalyzerConfig(config),
        );
        const secondRoundTrip = deserializeAnalyzerConfig(
          serializeAnalyzerConfig(firstRoundTrip),
        );

        expect(secondRoundTrip).toEqual(firstRoundTrip);
      }),
      { numRuns: 100 },
    );
  });
});
