import { AnalyzerRegistry } from './analyzer.registry';
import type { Analyzer, AnalysisContext, Finding } from '@dra/types';

// Mock analyzer for testing
class MockAnalyzer implements Analyzer {
  constructor(
    public readonly name: string,
    public readonly supportedExtensions: string[],
  ) {}

  async analyze(_context: AnalysisContext): Promise<Finding[]> {
    return [];
  }
}

describe('AnalyzerRegistry', () => {
  let registry: AnalyzerRegistry;

  beforeEach(() => {
    registry = new AnalyzerRegistry();
  });

  describe('register', () => {
    it('should register an analyzer', () => {
      const analyzer = new MockAnalyzer('test-analyzer', ['.ts', '.js']);
      registry.register(analyzer);

      expect(registry.hasAnalyzer('test-analyzer')).toBe(true);
      expect(registry.getAnalyzer('test-analyzer')).toBe(analyzer);
    });

    it('should overwrite existing analyzer with same name', () => {
      const analyzer1 = new MockAnalyzer('test-analyzer', ['.ts']);
      const analyzer2 = new MockAnalyzer('test-analyzer', ['.js']);

      registry.register(analyzer1);
      registry.register(analyzer2);

      expect(registry.getAnalyzer('test-analyzer')).toBe(analyzer2);
    });
  });

  describe('getAnalyzer', () => {
    it('should return undefined for non-existent analyzer', () => {
      expect(registry.getAnalyzer('non-existent')).toBeUndefined();
    });

    it('should return the registered analyzer', () => {
      const analyzer = new MockAnalyzer('my-analyzer', ['.py']);
      registry.register(analyzer);

      expect(registry.getAnalyzer('my-analyzer')).toBe(analyzer);
    });
  });

  describe('getAnalyzersForFile', () => {
    beforeEach(() => {
      registry.register(new MockAnalyzer('typescript', ['.ts', '.tsx']));
      registry.register(new MockAnalyzer('javascript', ['.js', '.jsx']));
      registry.register(new MockAnalyzer('sql', ['.sql']));
    });

    it('should return analyzers matching file extension', () => {
      const analyzers = registry.getAnalyzersForFile('src/index.ts');
      expect(analyzers).toHaveLength(1);
      expect(analyzers[0].name).toBe('typescript');
    });

    it('should return empty array for unsupported extension', () => {
      const analyzers = registry.getAnalyzersForFile('README.md');
      expect(analyzers).toHaveLength(0);
    });

    it('should handle files without extension', () => {
      const analyzers = registry.getAnalyzersForFile('Dockerfile');
      expect(analyzers).toHaveLength(0);
    });

    it('should be case-insensitive for extensions', () => {
      const analyzers = registry.getAnalyzersForFile('src/Component.TS');
      expect(analyzers).toHaveLength(1);
      expect(analyzers[0].name).toBe('typescript');
    });

    it('should return multiple analyzers if they share extensions', () => {
      registry.register(new MockAnalyzer('linter', ['.ts', '.js']));
      const analyzers = registry.getAnalyzersForFile('src/index.ts');
      expect(analyzers).toHaveLength(2);
    });
  });

  describe('getAllAnalyzers', () => {
    it('should return empty array when no analyzers registered', () => {
      expect(registry.getAllAnalyzers()).toHaveLength(0);
    });

    it('should return all registered analyzers', () => {
      registry.register(new MockAnalyzer('a', ['.ts']));
      registry.register(new MockAnalyzer('b', ['.js']));
      registry.register(new MockAnalyzer('c', ['.py']));

      const all = registry.getAllAnalyzers();
      expect(all).toHaveLength(3);
      expect(all.map((a) => a.name).sort()).toEqual(['a', 'b', 'c']);
    });
  });

  describe('unregister', () => {
    it('should remove a registered analyzer', () => {
      registry.register(new MockAnalyzer('test', ['.ts']));
      expect(registry.hasAnalyzer('test')).toBe(true);

      const removed = registry.unregister('test');
      expect(removed).toBe(true);
      expect(registry.hasAnalyzer('test')).toBe(false);
    });

    it('should return false for non-existent analyzer', () => {
      const removed = registry.unregister('non-existent');
      expect(removed).toBe(false);
    });
  });

  describe('clear', () => {
    it('should remove all analyzers', () => {
      registry.register(new MockAnalyzer('a', ['.ts']));
      registry.register(new MockAnalyzer('b', ['.js']));

      registry.clear();

      expect(registry.getAllAnalyzers()).toHaveLength(0);
    });
  });
});
