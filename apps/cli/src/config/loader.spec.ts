import { ConfigLoader, DEFAULT_CONFIG } from './index';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('ConfigLoader', () => {
  let loader: ConfigLoader;
  let tempDir: string;

  beforeEach(() => {
    loader = new ConfigLoader();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deploy-check-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('load', () => {
    it('should return default config when no config file exists', async () => {
      const originalCwd = process.cwd();
      process.chdir(tempDir);
      
      try {
        const config = await loader.load();
        expect(config.coverageThreshold).toBe(DEFAULT_CONFIG.coverageThreshold);
        expect(config.outputFormat).toBe(DEFAULT_CONFIG.outputFormat);
        expect(config.baseRef).toBe(DEFAULT_CONFIG.baseRef);
        expect(config.failOn).toBe(DEFAULT_CONFIG.failOn);
      } finally {
        process.chdir(originalCwd);
      }
    });

    it('should load config from explicit JSON path', async () => {
      const configPath = path.join(tempDir, '.deploy-check.json');
      const userConfig = {
        coverageThreshold: 80,
        ignoredPaths: ['node_modules/**', 'dist/**'],
        outputFormat: 'json',
      };
      fs.writeFileSync(configPath, JSON.stringify(userConfig));

      const config = await loader.load(configPath);
      expect(config.coverageThreshold).toBe(80);
      expect(config.ignoredPaths).toEqual(['node_modules/**', 'dist/**']);
      expect(config.outputFormat).toBe('json');
      // Defaults should still be applied
      expect(config.baseRef).toBe(DEFAULT_CONFIG.baseRef);
    });

    it('should throw error for non-existent config path', async () => {
      const configPath = path.join(tempDir, 'nonexistent.json');
      await expect(loader.load(configPath)).rejects.toThrow('Configuration file not found');
    });
  });

  describe('validate', () => {
    it('should accept valid configuration', () => {
      const config = {
        coverageThreshold: 50,
        ignoredPaths: ['test/**'],
        outputFormat: 'markdown' as const,
        failOn: 'medium' as const,
      };
      expect(() => loader.validate(config)).not.toThrow();
    });

    it('should reject invalid coverageThreshold', () => {
      expect(() => loader.validate({ coverageThreshold: -1 })).toThrow('coverageThreshold must be a number between 0 and 100');
      expect(() => loader.validate({ coverageThreshold: 101 })).toThrow('coverageThreshold must be a number between 0 and 100');
    });

    it('should reject invalid ignoredPaths', () => {
      expect(() => loader.validate({ ignoredPaths: 'not-an-array' as any })).toThrow('ignoredPaths must be an array');
      expect(() => loader.validate({ ignoredPaths: [123 as any] })).toThrow('ignoredPaths must contain only strings');
    });

    it('should reject invalid outputFormat', () => {
      expect(() => loader.validate({ outputFormat: 'invalid' as any })).toThrow('outputFormat must be one of');
    });

    it('should reject invalid failOn', () => {
      expect(() => loader.validate({ failOn: 'invalid' as any })).toThrow('failOn must be one of');
    });
  });

  describe('getConfigPath', () => {
    it('should return null when no config exists', async () => {
      const originalCwd = process.cwd();
      process.chdir(tempDir);
      
      try {
        const configPath = await loader.getConfigPath();
        expect(configPath).toBeNull();
      } finally {
        process.chdir(originalCwd);
      }
    });

    it('should return explicit path if file exists', async () => {
      const configPath = path.join(tempDir, '.deploy-check.json');
      fs.writeFileSync(configPath, '{}');

      const result = await loader.getConfigPath(configPath);
      expect(result).toBe(configPath);
    });

    it('should return null for non-existent explicit path', async () => {
      const configPath = path.join(tempDir, 'nonexistent.json');
      const result = await loader.getConfigPath(configPath);
      expect(result).toBeNull();
    });
  });
});
