import fs from 'node:fs';
import path from 'node:path';

export function resolveSafeWorkspacePath(rootDir, targetPath = '.') {
  const realRoot = fs.realpathSync(path.resolve(rootDir));
  const candidate = path.resolve(realRoot, targetPath || '.');

  if (candidate !== realRoot && !candidate.startsWith(realRoot + path.sep)) {
    throw new Error(`Path escapes workspace root: ${targetPath}`);
  }

  if (fs.existsSync(candidate)) {
    const realCandidate = fs.realpathSync(candidate);
    if (realCandidate !== realRoot && !realCandidate.startsWith(realRoot + path.sep)) {
      throw new Error(`Symlink escapes workspace root: ${targetPath}`);
    }
    return { realRoot, resolved: realCandidate };
  }

  return { realRoot, resolved: candidate };
}
