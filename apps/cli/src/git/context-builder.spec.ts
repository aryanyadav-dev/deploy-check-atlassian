import { AnalysisContextBuilder } from './context-builder';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';

describe('AnalysisContextBuilder', () => {
  let tempDir: string;
  let builder: AnalysisContextBuilder;

  beforeAll(() => {
    // Create a temporary git repository for testing
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'context-builder-test-'));
    
    // Initialize git repo with main as default branch
    execSync('git init -b main', { cwd: tempDir });
    execSync('git config user.email "test@test.com"', { cwd: tempDir });
    execSync('git config user.name "Test User"', { cwd: tempDir });
    
    // Create initial files and commit
    fs.mkdirSync(path.join(tempDir, 'src'));
    fs.writeFileSync(path.join(tempDir, 'src/index.ts'), 'export const x = 1;');
    fs.writeFileSync(path.join(tempDir, 'README.md'), '# Test Project');
    execSync('git add .', { cwd: tempDir });
    execSync('git commit -m "Initial commit"', { cwd: tempDir });
    
    // Modify files for testing (working directory changes)
    fs.writeFileSync(path.join(tempDir, 'src/index.ts'), 'export const x = 2;\nexport const y = 3;');
    fs.writeFileSync(path.join(tempDir, 'src/new-file.ts'), 'export const z = 4;');
    
    builder = new AnalysisContextBuilder(tempDir);
  });

  afterAll(() => {
    // Clean up temp directory
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('build', () => {
    it('should build analysis context from working directory changes', async () => {
      const result = await builder.build({ base: 'HEAD' });
      
      expect(result.context).toBeDefined();
      expect(result.context.files).toBeInstanceOf(Array);
      expect(result.context.diff).toBeDefined();
      expect(result.repoInfo).toBeDefined();
      expect(result.diffResult).toBeDefined();
    });

    it('should include file changes with content', async () => {
      const result = await builder.build({ base: 'HEAD' });
      
      // Find the modified file
      const modifiedFile = result.context.files.find(f => f.path === 'src/index.ts');
      expect(modifiedFile).toBeDefined();
      expect(modifiedFile?.oldContent).toBe('export const x = 1;');
      expect(modifiedFile?.newContent).toContain('export const x = 2;');
    });

    it('should handle new files', async () => {
      // Stage the new file so it shows in diff
      execSync('git add src/new-file.ts', { cwd: tempDir });
      
      const result = await builder.build({ base: 'HEAD', staged: true });
      
      // Find the new file
      const newFile = result.context.files.find(f => f.path === 'src/new-file.ts');
      expect(newFile).toBeDefined();
      expect(newFile?.oldContent).toBeNull();
      expect(newFile?.newContent).toBe('export const z = 4;');
      
      // Unstage for other tests
      execSync('git reset HEAD src/new-file.ts', { cwd: tempDir });
    });

    it('should include hunks for each file', async () => {
      const result = await builder.build({ base: 'HEAD' });
      
      const modifiedFile = result.context.files.find(f => f.path === 'src/index.ts');
      expect(modifiedFile?.hunks).toBeInstanceOf(Array);
      expect(modifiedFile?.hunks.length).toBeGreaterThan(0);
    });

    it('should include raw diff in context', async () => {
      const result = await builder.build({ base: 'HEAD' });
      
      expect(result.context.diff).toContain('diff --git');
    });

    it('should include repo info', async () => {
      const result = await builder.build({ base: 'HEAD' });
      
      // Use realpath to handle macOS /var -> /private/var symlink
      expect(fs.realpathSync(result.repoInfo.root)).toBe(fs.realpathSync(tempDir));
      expect(result.repoInfo.currentBranch).toBe('main');
      expect(result.repoInfo.headCommit).toBeDefined();
    });

    it('should filter by specific paths', async () => {
      const result = await builder.build({ 
        base: 'HEAD',
        paths: ['src/index.ts']
      });
      
      expect(result.context.files.length).toBe(1);
      expect(result.context.files[0].path).toBe('src/index.ts');
    });

    it('should throw error for non-existent base ref', async () => {
      await expect(builder.build({ base: 'non-existent-branch' }))
        .rejects.toThrow("Base reference 'non-existent-branch' does not exist");
    });
  });

  describe('shouldIgnorePath', () => {
    it('should return false when no ignore patterns', () => {
      expect(builder.shouldIgnorePath('src/index.ts', undefined)).toBe(false);
      expect(builder.shouldIgnorePath('src/index.ts', [])).toBe(false);
    });

    it('should match exact paths', () => {
      const ignorePaths = ['node_modules', 'dist'];
      
      expect(builder.shouldIgnorePath('node_modules', ignorePaths)).toBe(true);
      expect(builder.shouldIgnorePath('dist', ignorePaths)).toBe(true);
      expect(builder.shouldIgnorePath('src', ignorePaths)).toBe(false);
    });

    it('should match path prefixes', () => {
      const ignorePaths = ['node_modules/'];
      
      expect(builder.shouldIgnorePath('node_modules/package/index.js', ignorePaths)).toBe(true);
      expect(builder.shouldIgnorePath('src/index.ts', ignorePaths)).toBe(false);
    });

    it('should match glob patterns with *', () => {
      const ignorePaths = ['*.test.ts', 'dist/*'];
      
      expect(builder.shouldIgnorePath('index.test.ts', ignorePaths)).toBe(true);
      expect(builder.shouldIgnorePath('dist/bundle.js', ignorePaths)).toBe(true);
      expect(builder.shouldIgnorePath('src/index.ts', ignorePaths)).toBe(false);
    });
  });

  describe('filterIgnoredFiles', () => {
    it('should return all files when no ignore patterns', () => {
      const files = [
        { path: 'src/index.ts', oldContent: null, newContent: '', hunks: [] },
        { path: 'test/index.test.ts', oldContent: null, newContent: '', hunks: [] },
      ];
      
      const filtered = builder.filterIgnoredFiles(files, undefined);
      expect(filtered).toHaveLength(2);
    });

    it('should filter out ignored files', () => {
      const files = [
        { path: 'src/index.ts', oldContent: null, newContent: '', hunks: [] },
        { path: 'test/index.test.ts', oldContent: null, newContent: '', hunks: [] },
        { path: 'node_modules/pkg/index.js', oldContent: null, newContent: '', hunks: [] },
      ];
      
      const filtered = builder.filterIgnoredFiles(files, ['node_modules/', '*.test.ts']);
      expect(filtered).toHaveLength(1);
      expect(filtered[0].path).toBe('src/index.ts');
    });
  });

  describe('getRepoRoot', () => {
    it('should return repository root path', () => {
      // Use realpath to handle macOS /var -> /private/var symlink
      expect(fs.realpathSync(builder.getRepoRoot())).toBe(fs.realpathSync(tempDir));
    });
  });

  describe('getRelativePath', () => {
    it('should return relative path from repo root', () => {
      // Use realpath to get the actual path that git sees
      const realTempDir = fs.realpathSync(tempDir);
      const absolutePath = path.join(realTempDir, 'src', 'index.ts');
      expect(builder.getRelativePath(absolutePath)).toBe('src/index.ts');
    });
  });
});

describe('AnalysisContextBuilder - not a git repo', () => {
  let tempDir: string;

  beforeAll(() => {
    // Create a temporary directory that is NOT a git repo
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'not-git-test-'));
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should throw error when not in a git repository', async () => {
    const builder = new AnalysisContextBuilder(tempDir);
    
    await expect(builder.build())
      .rejects.toThrow('Not a git repository');
  });
});
