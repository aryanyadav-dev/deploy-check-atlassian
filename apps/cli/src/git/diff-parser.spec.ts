import { parseGitDiff, getAddedLines, getRemovedLines, getAddedLineNumbers } from './diff-parser';
import type { DiffHunk } from '@dra/types';

describe('diff-parser', () => {
  describe('parseGitDiff', () => {
    it('should parse empty diff', () => {
      const result = parseGitDiff('', 'main', 'HEAD');
      
      expect(result.base).toBe('main');
      expect(result.head).toBe('HEAD');
      expect(result.files).toHaveLength(0);
      expect(result.rawDiff).toBe('');
    });

    it('should parse single file modification', () => {
      const diffOutput = `diff --git a/src/index.ts b/src/index.ts
index abc123..def456 100644
--- a/src/index.ts
+++ b/src/index.ts
@@ -1,3 +1,4 @@
 const x = 1;
+const y = 2;
 const z = 3;
`;
      
      const result = parseGitDiff(diffOutput, 'main', 'HEAD');
      
      expect(result.files).toHaveLength(1);
      expect(result.files[0].path).toBe('src/index.ts');
      expect(result.files[0].status).toBe('modified');
      expect(result.files[0].isBinary).toBe(false);
      expect(result.files[0].hunks).toHaveLength(1);
    });

    it('should parse new file', () => {
      const diffOutput = `diff --git a/src/new-file.ts b/src/new-file.ts
new file mode 100644
index 0000000..abc123
--- /dev/null
+++ b/src/new-file.ts
@@ -0,0 +1,3 @@
+const x = 1;
+const y = 2;
+const z = 3;
`;
      
      const result = parseGitDiff(diffOutput, 'main', 'HEAD');
      
      expect(result.files).toHaveLength(1);
      expect(result.files[0].path).toBe('src/new-file.ts');
      expect(result.files[0].status).toBe('added');
    });

    it('should parse deleted file', () => {
      const diffOutput = `diff --git a/src/old-file.ts b/src/old-file.ts
deleted file mode 100644
index abc123..0000000
--- a/src/old-file.ts
+++ /dev/null
@@ -1,3 +0,0 @@
-const x = 1;
-const y = 2;
-const z = 3;
`;
      
      const result = parseGitDiff(diffOutput, 'main', 'HEAD');
      
      expect(result.files).toHaveLength(1);
      expect(result.files[0].path).toBe('src/old-file.ts');
      expect(result.files[0].status).toBe('deleted');
    });

    it('should parse renamed file', () => {
      const diffOutput = `diff --git a/src/old-name.ts b/src/new-name.ts
similarity index 95%
rename from src/old-name.ts
rename to src/new-name.ts
index abc123..def456 100644
--- a/src/old-name.ts
+++ b/src/new-name.ts
@@ -1,3 +1,3 @@
 const x = 1;
-const y = 2;
+const y = 3;
 const z = 3;
`;
      
      const result = parseGitDiff(diffOutput, 'main', 'HEAD');
      
      expect(result.files).toHaveLength(1);
      expect(result.files[0].path).toBe('src/new-name.ts');
      expect(result.files[0].oldPath).toBe('src/old-name.ts');
      expect(result.files[0].status).toBe('renamed');
    });

    it('should parse binary file', () => {
      const diffOutput = `diff --git a/image.png b/image.png
new file mode 100644
index 0000000..abc123
Binary files /dev/null and b/image.png differ
`;
      
      const result = parseGitDiff(diffOutput, 'main', 'HEAD');
      
      expect(result.files).toHaveLength(1);
      expect(result.files[0].path).toBe('image.png');
      expect(result.files[0].isBinary).toBe(true);
      expect(result.files[0].hunks).toHaveLength(0);
    });

    it('should parse multiple files', () => {
      const diffOutput = `diff --git a/src/file1.ts b/src/file1.ts
index abc123..def456 100644
--- a/src/file1.ts
+++ b/src/file1.ts
@@ -1,2 +1,3 @@
 const x = 1;
+const y = 2;
diff --git a/src/file2.ts b/src/file2.ts
new file mode 100644
index 0000000..abc123
--- /dev/null
+++ b/src/file2.ts
@@ -0,0 +1,2 @@
+const a = 1;
+const b = 2;
`;
      
      const result = parseGitDiff(diffOutput, 'main', 'HEAD');
      
      expect(result.files).toHaveLength(2);
      expect(result.files[0].path).toBe('src/file1.ts');
      expect(result.files[1].path).toBe('src/file2.ts');
    });

    it('should parse multiple hunks in single file', () => {
      const diffOutput = `diff --git a/src/index.ts b/src/index.ts
index abc123..def456 100644
--- a/src/index.ts
+++ b/src/index.ts
@@ -1,3 +1,4 @@
 const x = 1;
+const y = 2;
 const z = 3;
@@ -10,3 +11,4 @@
 function foo() {
+  return 42;
 }
`;
      
      const result = parseGitDiff(diffOutput, 'main', 'HEAD');
      
      expect(result.files).toHaveLength(1);
      expect(result.files[0].hunks).toHaveLength(2);
      expect(result.files[0].hunks[0].oldStart).toBe(1);
      expect(result.files[0].hunks[0].newStart).toBe(1);
      expect(result.files[0].hunks[1].oldStart).toBe(10);
      expect(result.files[0].hunks[1].newStart).toBe(11);
    });

    it('should parse hunk with single line (no comma in header)', () => {
      const diffOutput = `diff --git a/src/index.ts b/src/index.ts
index abc123..def456 100644
--- a/src/index.ts
+++ b/src/index.ts
@@ -1 +1,2 @@
 const x = 1;
+const y = 2;
`;
      
      const result = parseGitDiff(diffOutput, 'main', 'HEAD');
      
      expect(result.files[0].hunks[0].oldLines).toBe(1);
      expect(result.files[0].hunks[0].newLines).toBe(2);
    });
  });

  describe('getAddedLines', () => {
    it('should extract added lines from hunk', () => {
      const hunk: DiffHunk = {
        oldStart: 1,
        oldLines: 2,
        newStart: 1,
        newLines: 3,
        content: `@@ -1,2 +1,3 @@
 const x = 1;
+const y = 2;
 const z = 3;`,
      };
      
      const added = getAddedLines(hunk);
      
      expect(added).toEqual(['const y = 2;']);
    });

    it('should handle multiple added lines', () => {
      const hunk: DiffHunk = {
        oldStart: 1,
        oldLines: 1,
        newStart: 1,
        newLines: 3,
        content: `@@ -1,1 +1,3 @@
+const a = 1;
 const x = 1;
+const b = 2;`,
      };
      
      const added = getAddedLines(hunk);
      
      expect(added).toEqual(['const a = 1;', 'const b = 2;']);
    });
  });

  describe('getRemovedLines', () => {
    it('should extract removed lines from hunk', () => {
      const hunk: DiffHunk = {
        oldStart: 1,
        oldLines: 3,
        newStart: 1,
        newLines: 2,
        content: `@@ -1,3 +1,2 @@
 const x = 1;
-const y = 2;
 const z = 3;`,
      };
      
      const removed = getRemovedLines(hunk);
      
      expect(removed).toEqual(['const y = 2;']);
    });
  });

  describe('getAddedLineNumbers', () => {
    it('should return line numbers of added lines', () => {
      const hunk: DiffHunk = {
        oldStart: 1,
        oldLines: 2,
        newStart: 1,
        newLines: 4,
        content: `@@ -1,2 +1,4 @@
 const x = 1;
+const a = 2;
+const b = 3;
 const z = 4;`,
      };
      
      const lineNumbers = getAddedLineNumbers(hunk);
      
      expect(lineNumbers).toEqual([2, 3]);
    });

    it('should handle additions at start', () => {
      const hunk: DiffHunk = {
        oldStart: 1,
        oldLines: 1,
        newStart: 1,
        newLines: 2,
        content: `@@ -1,1 +1,2 @@
+const new = 1;
 const old = 2;`,
      };
      
      const lineNumbers = getAddedLineNumbers(hunk);
      
      expect(lineNumbers).toEqual([1]);
    });
  });
});
