import { GitFileReader } from './file-reader';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';

describe('GitFileReader', () => {
  let tempDir: string;
  let reader: GitFileReader;

  beforeAll(() => {
    // Create a temporary git repository for testing
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-reader-test-'));
    
    // Initialize git repo
    execSync('git init', { cwd: tempDir });
    execSync('git config user.email "test@test.com"', { cwd: tempDir });
    execSync('git config user.name "Test User"', { cwd: tempDir });
    
    // Create initial file and commit
    fs.writeFileSync(path.join(tempDir, 'test.txt'), 'initial content');
    execSync('git add test.txt', { cwd: tempDir });
    execSync('git commit -m "Initial commit"', { cwd: tempDir });
    
    // Modify file and commit again
    fs.writeFileSync(path.join(tempDir, 'test.txt'), 'modified content');
    execSync('git add test.txt', { cwd: tempDir });
    execSync('git commit -m "Second commit"', { cwd: tempDir });
    
    // Create working directory changes
    fs.writeFileSync(path.join(tempDir, 'test.txt'), 'working directory content');
    
    // Create a new file in working directory
    fs.writeFileSync(path.join(tempDir, 'new-file.txt'), 'new file content');
    
    reader = new GitFileReader(tempDir);
  });

  afterAll(() => {
    // Clean up temp directory
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('readFromWorkingDirectory', () => {
    it('should read file from working directory', () => {
      const content = reader.readFromWorkingDirectory('test.txt');
      expect(content).toBe('working directory content');
    });

    it('should return null for non-existent file', () => {
      const content = reader.readFromWorkingDirectory('non-existent.txt');
      expect(content).toBeNull();
    });

    it('should read new untracked file', () => {
      const content = reader.readFromWorkingDirectory('new-file.txt');
      expect(content).toBe('new file content');
    });
  });

  describe('readFromRef', () => {
    it('should read file from HEAD', () => {
      const content = reader.readFromRef('test.txt', 'HEAD');
      expect(content).toBe('modified content');
    });

    it('should read file from HEAD~1', () => {
      const content = reader.readFromRef('test.txt', 'HEAD~1');
      expect(content).toBe('initial content');
    });

    it('should return null for non-existent file at ref', () => {
      const content = reader.readFromRef('non-existent.txt', 'HEAD');
      expect(content).toBeNull();
    });

    it('should return null for file that did not exist at older ref', () => {
      // new-file.txt only exists in working directory, not in any commit
      const content = reader.readFromRef('new-file.txt', 'HEAD');
      expect(content).toBeNull();
    });
  });

  describe('read', () => {
    it('should read from working directory when no ref provided', () => {
      const content = reader.read('test.txt');
      expect(content).toBe('working directory content');
    });

    it('should read from ref when ref provided', () => {
      const content = reader.read('test.txt', { ref: 'HEAD' });
      expect(content).toBe('modified content');
    });
  });

  describe('readBothVersions', () => {
    it('should read old and new versions', () => {
      const { oldContent, newContent } = reader.readBothVersions('test.txt', 'HEAD~1');
      
      expect(oldContent).toBe('initial content');
      expect(newContent).toBe('working directory content');
    });

    it('should read between two refs', () => {
      const { oldContent, newContent } = reader.readBothVersions('test.txt', 'HEAD~1', 'HEAD');
      
      expect(oldContent).toBe('initial content');
      expect(newContent).toBe('modified content');
    });

    it('should handle file that does not exist at base ref', () => {
      const { oldContent, newContent } = reader.readBothVersions('new-file.txt', 'HEAD');
      
      expect(oldContent).toBeNull();
      expect(newContent).toBe('new file content');
    });
  });

  describe('existsAtRef', () => {
    it('should return true for existing file', () => {
      expect(reader.existsAtRef('test.txt', 'HEAD')).toBe(true);
    });

    it('should return false for non-existent file', () => {
      expect(reader.existsAtRef('non-existent.txt', 'HEAD')).toBe(false);
    });
  });

  describe('existsInWorkingDirectory', () => {
    it('should return true for existing file', () => {
      expect(reader.existsInWorkingDirectory('test.txt')).toBe(true);
    });

    it('should return false for non-existent file', () => {
      expect(reader.existsInWorkingDirectory('non-existent.txt')).toBe(false);
    });
  });

  describe('listFilesAtRef', () => {
    it('should list files at HEAD', () => {
      const files = reader.listFilesAtRef('HEAD');
      expect(files).toContain('test.txt');
    });
  });
});
