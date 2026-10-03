/**
 * Secret rules for NFR-12: secrets live only in /srv/atelion/.env, so the repo
 * must never hold an env file, a private key or a hard-coded credential.
 *
 * Kept free of git and file access so the rules can be tested against plain
 * strings; check-secrets.mjs feeds them the staged or tracked files.
 */

/** Put on a line to accept a reviewed false positive. */
export const ALLOW_MARKER = 'secret-scan: allow';

/** `.gitignore` keeps `.env.example` and nothing else that looks like one. */
const ALLOWED_ENV_FILES = new Set(['.env.example']);

/** PKCS#12 bundles are binary, so they are caught by name, not content. */
const KEY_FILE_EXTENSIONS = ['.p12', '.pfx'];
const KEY_FILE_NAMES = new Set(['id_rsa', 'id_dsa', 'id_ecdsa', 'id_ed25519']);

/** Files that must never be committed, whatever they contain. */
export function isForbiddenFile(path) {
  const name = basename(path).toLowerCase();
  if (ALLOWED_ENV_FILES.has(name)) return false;
  if (name === '.envrc' || name.startsWith('.env.') || name.endsWith('.env')) {
    return true;
  }
  return (
    KEY_FILE_NAMES.has(name) ||
    KEY_FILE_EXTENSIONS.some((extension) => name.endsWith(extension))
  );
}

/** Token formats issued by a known provider: any match is a finding. */
const TOKEN_RULES = [
  {
    rule: 'private-key',
    pattern: /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----/,
  },
  { rule: 'aws-access-key', pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  {
    rule: 'github-token',
    pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{60,})/,
  },
  { rule: 'slack-token', pattern: /\bxox[abposr]-[A-Za-z0-9-]{10,}/ },
  {
    rule: 'slack-webhook',
    pattern: /https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/_-]{20,}/,
  },
  { rule: 'stripe-key', pattern: /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}/ },
  { rule: 'anthropic-key', pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}/ },
  {
    rule: 'openai-key',
    pattern: /\bsk-(?!ant-)(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{20,}/,
    // Keeps kebab-case names that happen to start with `sk-` out.
    accept: (match) => /\d/.test(match) && /[A-Z]/.test(match),
  },
  { rule: 'google-api-key', pattern: /\bAIza[0-9A-Za-z_-]{35}/ },
  { rule: 'npm-token', pattern: /\bnpm_[A-Za-z0-9]{36}\b/ },
  // FR-01: the host is reached through tailscale.
  { rule: 'tailscale-key', pattern: /\btskey-[a-z]+-[A-Za-z0-9-]{10,}/ },
  {
    rule: 'jwt',
    pattern: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/,
  },
];

/** `scheme://user:password@host`; groups are the password and the host. */
const URL_CREDENTIALS =
  /\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@'"`]+:([^\s/@'"`]+)@([^\s/:'"`?#]+)/gi;
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** A name that announces a secret: `DB_PASSWORD`, `apiKey`, `client-secret`. */
const SECRET_NAME = String.raw`(?<![\w.-])[\w.-]*?(?:secret|passw(?:or)?d|pwd|token|api[_-]?key|private[_-]?key|access[_-]?key|auth[_-]?key|credential)[\w.-]*`;

/** `name = 'value'`, `"name": "value"`, `name := "value"`, `name => 'value'`. */
const QUOTED_ASSIGNMENT = new RegExp(
  String.raw`(${SECRET_NAME})['"]?\s*(?::=|=>|[:=])\s*(['"\x60])([^'"\x60\n]*)\2`,
  'gi',
);

/** Config files also assign unquoted: `DB_PASSWORD=value`, `token: value`. */
const UNQUOTED_ASSIGNMENT = new RegExp(
  String.raw`^\s*(?:export\s+|ENV\s+|ARG\s+|-\s+)?(${SECRET_NAME})\s*[:=]\s*([^\s'"\x60#]+)`,
  'i',
);
const CONFIG_FILE =
  /(?:\.(?:ya?ml|toml|ini|properties|conf|cfg|sh)|(?:^|[\\/])Dockerfile[^\\/]*|(?:^|[\\/])\.env\.example)$/i;

/** Characters a credential is made of; anything else is code or prose. */
const SECRET_CHARSET = /^[\w+/=.~!@#$%&*?:-]+$/;
const PLACEHOLDER =
  /^\$|^(?:pass(?:word)?|pwd|secret)$|changeme|change_me|example|placeholder|your[_-]|dummy|fake|sample|redacted|xxxx|\*\*\*/i;
/** `atelion.session.v1`, `config/secrets.json`: a name, not a value. */
const JOINED_WORDS = /^[a-z]+(?:[./_-][a-z0-9]+)+$/;
const URL_OR_PATH = /^(?:\.{0,2}\/|[a-z][a-z0-9+.-]*:\/\/)/i;

/**
 * Every secret in `text`, one finding per rule per line. `match` is the
 * secret itself, so print it through `mask`.
 */
export function findSecrets(path, text) {
  const configFile = CONFIG_FILE.test(path);
  const findings = [];
  const lines = text.split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    if (line.includes(ALLOW_MARKER)) continue;
    for (const { rule, match } of scanLine(line, configFile)) {
      findings.push({ line: index + 1, rule, match });
    }
  }
  return findings;
}

function scanLine(line, configFile) {
  const found = [];
  for (const { rule, pattern, accept } of TOKEN_RULES) {
    const match = pattern.exec(line)?.[0];
    if (match && (!accept || accept(match))) found.push({ rule, match });
  }
  for (const [match, password, host] of line.matchAll(URL_CREDENTIALS)) {
    if (LOCAL_HOSTS.has(host.toLowerCase()) || PLACEHOLDER.test(password)) {
      continue;
    }
    found.push({ rule: 'url-credentials', match });
  }
  // A provider token is also usually assigned to a secret-named variable.
  if (found.length > 0) return found;

  const values = [...line.matchAll(QUOTED_ASSIGNMENT)].map((match) => match[3]);
  if (configFile) {
    const unquoted = UNQUOTED_ASSIGNMENT.exec(line);
    if (unquoted) values.push(unquoted[2]);
  }
  const value = values.find(looksLikeSecret);
  if (value) found.push({ rule: 'secret-assignment', match: value });
  return found;
}

/** Whether a value assigned to a secret-named variable is a real credential. */
export function looksLikeSecret(value) {
  if (value.length < 8 || !SECRET_CHARSET.test(value)) return false;
  if (PLACEHOLDER.test(value) || JOINED_WORDS.test(value)) return false;
  if (URL_OR_PATH.test(value)) return false;
  // Generated secrets nearly always carry a digit; short words without one
  // are header names and labels.
  if (!/\d/.test(value) && value.length < 20) return false;
  return entropy(value) >= 3;
}

/** Shannon entropy in bits per character. */
function entropy(value) {
  const counts = new Map();
  for (const char of value) counts.set(char, (counts.get(char) ?? 0) + 1);
  let bits = 0;
  for (const count of counts.values()) {
    const share = count / value.length;
    bits -= share * Math.log2(share);
  }
  return bits;
}

/** Enough of a secret to find it again, never enough to use it. */
export function mask(secret) {
  const shown = Math.min(4, Math.floor(secret.length / 4));
  return `${secret.slice(0, shown)}… (${secret.length} chars)`;
}

function basename(path) {
  return path.split(/[\\/]/).pop() ?? path;
}
