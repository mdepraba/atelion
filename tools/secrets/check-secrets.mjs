/**
 * Gate for NFR-12: secrets live only in /srv/atelion/.env. The rules live in
 * rules.mjs; this collects the files and reports what they find.
 *
 *   --staged   the index, as the next commit will record it (pre-commit hook)
 *   (no flag)  every tracked file in the working tree (CI)
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { ALLOW_MARKER, findSecrets, isForbiddenFile, mask } from './rules.mjs';

/** Larger files are generated or binary, not hand-written config. */
const MAX_BYTES = 1024 * 1024;
const LOCKFILES = new Set([
  'bun.lock',
  'bun.lockb',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
]);

const staged = process.argv.includes('--staged');

function git(args, input) {
  return execFileSync('git', args, { input, maxBuffer: 512 * 1024 * 1024 });
}

function listFiles() {
  const args = staged
    ? ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z']
    : ['ls-files', '-z'];
  return git(args).toString('utf8').split('\0').filter(Boolean);
}

/**
 * Staged contents, read from the index rather than the working tree so a
 * partly staged file is checked as it will be committed. Two `git cat-file`
 * processes in all: one for sizes, one for the blobs small enough to scan.
 */
function readStaged(paths) {
  if (paths.length === 0) return new Map();
  const checks = git(
    ['cat-file', '--batch-check=%(objectname) %(objecttype) %(objectsize)'],
    paths.map((path) => `:${path}\n`).join(''),
  )
    .toString('utf8')
    .split('\n');

  const wanted = [];
  for (const [index, path] of paths.entries()) {
    const [id, type, size] = checks[index].split(' ');
    if (type === 'blob' && Number(size) <= MAX_BYTES) {
      wanted.push({ path, id, size: Number(size) });
    }
  }

  const contents = new Map();
  if (wanted.length === 0) return contents;
  const batch = git(
    ['cat-file', '--batch'],
    wanted.map(({ id }) => `${id}\n`).join(''),
  );
  let offset = 0;
  for (const { path, size } of wanted) {
    offset = batch.indexOf(0x0a, offset) + 1; // skip "<id> blob <size>\n"
    contents.set(path, batch.subarray(offset, offset + size));
    offset += size + 1;
  }
  return contents;
}

function readTracked(paths) {
  const contents = new Map();
  for (const path of paths) {
    try {
      if (statSync(path).size <= MAX_BYTES) {
        contents.set(path, readFileSync(path));
      }
    } catch {
      // Deleted in the working tree but not yet staged: nothing to scan.
    }
  }
  return contents;
}

const paths = listFiles();
const contents = staged ? readStaged(paths) : readTracked(paths);
const problems = [];

for (const path of paths) {
  if (isForbiddenFile(path)) {
    problems.push(`${path}  env or private key file`);
    continue;
  }
  const name = path.split('/').pop();
  const content = contents.get(path);
  if (LOCKFILES.has(name) || !content || content.includes(0)) continue;

  for (const { line, rule, match } of findSecrets(path, content.toString())) {
    problems.push(`${path}:${line}  ${rule}  ${mask(match)}`);
  }
}

if (problems.length > 0) {
  console.error(`Secrets in ${staged ? 'staged' : 'tracked'} files:\n`);
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error(
    [
      '',
      'Secrets live only in /srv/atelion/.env (NFR-12). Take the file out of',
      'the commit (git rm --cached <path>) or move the value to the env file.',
      `For a false positive, add "${ALLOW_MARKER}" to the line.`,
    ].join('\n'),
  );
  process.exit(1);
}

console.log(`No secrets found (${paths.length} files).`);
