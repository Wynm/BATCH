import fs from 'node:fs';
import path from 'node:path';
import { resolveSafeWorkspacePath } from '../security/safePath.mjs';

const IGNORE_DIRS = new Set([
  '.git',
  'node_modules',
  '.next',
  '.venv',
  'venv',
  'dist',
  'build',
  'target',
  'data',
  '__pycache__',
  '.cache',
]);

const EXT_LANG = {
  '.js': 'JavaScript',
  '.mjs': 'JavaScript (ESM)',
  '.cjs': 'JavaScript (CJS)',
  '.ts': 'TypeScript',
  '.tsx': 'TypeScript React',
  '.jsx': 'JavaScript React',
  '.py': 'Python',
  '.rs': 'Rust',
  '.go': 'Go',
  '.java': 'Java',
  '.yml': 'YAML',
  '.yaml': 'YAML',
  '.json': 'JSON',
  '.md': 'Markdown',
  '.html': 'HTML',
  '.css': 'CSS',
  '.sh': 'Shell',
  '.sql': 'SQL',
};

export function inspectWorkspace(workspaceRoot, subPath = '.', maxFiles = 300) {
  const { realRoot, resolved } = resolveSafeWorkspacePath(workspaceRoot, subPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Target path does not exist: ${subPath}`);
  }

  const stat = fs.statSync(resolved);
  if (stat.isFile()) {
    const content = fs.readFileSync(resolved, 'utf8');
    return {
      type: 'file',
      relativePath: path.relative(realRoot, resolved) || path.basename(resolved),
      sizeBytes: stat.size,
      lineCount: content.split(/\r?\n/).length,
      preview: content.slice(0, 8000),
    };
  }

  const files = [];
  const languageCounts = {};
  const manifests = [];
  let truncated = false;

  const walk = (dir) => {
    if (files.length >= maxFiles) {
      truncated = true;
      return;
    }
    const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (files.length >= maxFiles) {
        truncated = true;
        return;
      }
      if (IGNORE_DIRS.has(entry.name)) continue;
      const fullPath = path.join(dir, entry.name);
      const relPath = path.relative(realRoot, fullPath);

      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        const fstat = fs.statSync(fullPath);
        const ext = path.extname(entry.name).toLowerCase();
        const lang = EXT_LANG[ext] || (entry.name === 'Dockerfile' ? 'Docker' : 'Other');
        languageCounts[lang] = (languageCounts[lang] || 0) + 1;

        if (
          ['package.json', 'Cargo.toml', 'pyproject.toml', 'go.mod', 'Dockerfile', 'docker-compose.yml', '.gitlab-ci.yml', 'bitbucket-pipelines.yml'].includes(entry.name) ||
          relPath.startsWith('.github' + path.sep + 'workflows')
        ) {
          manifests.push(relPath);
        }

        files.push({
          path: relPath,
          sizeBytes: fstat.size,
          language: lang,
        });
      }
    }
  };

  walk(resolved);

  let packageSummary = null;
  const pkgPath = path.join(resolved, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      packageSummary = {
        name: pkg.name,
        version: pkg.version,
        scripts: Object.keys(pkg.scripts || {}),
        dependencies: Object.keys(pkg.dependencies || {}),
      };
    } catch {
      packageSummary = null;
    }
  }

  return {
    type: 'directory',
    target: path.relative(realRoot, resolved) || '.',
    totalFilesScanned: files.length,
    truncated,
    languageCounts,
    manifests,
    packageSummary,
    files: files.slice(0, 100),
  };
}
