import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ALLOW_MARKER,
  findSecrets,
  isForbiddenFile,
  looksLikeSecret,
  mask,
} from './rules.mjs';

// Fixtures are split across string concatenations so this file passes the
// scanner it tests.
const SECRETS = {
  'private-key': `-----BEGIN RSA ${'PRIVATE KEY'}-----`,
  'aws-access-key': `AKIA${'IOSFODNN7EXAMPLE'}`,
  'github-token': `ghp_${'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8'}`,
  'slack-token': `xoxb-${'1234567890-abcdefghij'}`,
  'slack-webhook': `https://hooks.slack.com/${'services/T0000/B0000/XXXXXXXXXXXXXXXX'}`,
  'stripe-key': `sk_live_${'4eC39HqLyjWDarjtT1zdp7dc'}`,
  'anthropic-key': `sk-ant-${'api03-a1B2c3D4e5F6g7H8i9J0k1L2'}`,
  'openai-key': `sk-proj-${'a1B2c3D4e5F6g7H8i9J0k1L2m3N4'}`,
  'google-api-key': `AIza${'SyA1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q'}`,
  'npm-token': `npm_${'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8'}`,
  'tailscale-key': `tskey-auth-${'kXGGbs7CNTRL-a1B2c3D4e5F6'}`,
  jwt: `eyJhbGciOiJIUzI1NiJ9.${'eyJzdWIiOiIxMjM0NTY3ODkwIn0'}.${'dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U'}`,
};

/** `name = 'value'` without the pair appearing in this file's source. */
const assign = (name, value, quote = "'") =>
  `const ${name} = ${quote}${value}${quote};`;

const rules = (path, text) => findSecrets(path, text).map(({ rule }) => rule);

describe('isForbiddenFile', () => {
  for (const path of [
    '.env',
    '.env.local',
    '.env.production',
    'apps/api/.env',
    'apps/api/.env.local',
    'deploy/prod.env',
    '.envrc',
    'certs/client.p12',
    'certs/client.pfx',
    'id_rsa',
    'keys/id_ed25519',
  ]) {
    it(`rejects ${path}`, () => assert.equal(isForbiddenFile(path), true));
  }

  for (const path of [
    '.env.example',
    'apps/api/.env.example',
    'src/environment.ts',
    '.environment',
    'core/api/src/env.ts',
    'id_rsa.pub',
    'README.md',
  ]) {
    it(`accepts ${path}`, () => assert.equal(isForbiddenFile(path), false));
  }
});

describe('findSecrets: provider tokens', () => {
  for (const [rule, secret] of Object.entries(SECRETS)) {
    it(`finds ${rule}`, () => {
      const findings = findSecrets('src/config.ts', `const x = '${secret}';`);
      assert.deepEqual(
        findings.map((finding) => finding.rule),
        [rule],
      );
      assert.equal(findings[0].line, 1);
    });
  }

  it('reports the line number', () => {
    const text = ['// one', '// two', SECRETS['aws-access-key']].join('\n');
    assert.equal(findSecrets('a.ts', text)[0].line, 3);
  });

  it('handles CRLF line endings', () => {
    const text = ['// one', SECRETS['aws-access-key']].join('\r\n');
    assert.equal(findSecrets('a.ts', text)[0].line, 2);
  });

  it('does not take kebab-case names for OpenAI keys', () => {
    assert.deepEqual(rules('a.css', '.sk-loading-spinner-placeholder {}'), []);
  });

  it('does not take an Anthropic key for an OpenAI one', () => {
    assert.deepEqual(rules('a.ts', SECRETS['anthropic-key']), [
      'anthropic-key',
    ]);
  });
});

describe('findSecrets: credentials in URLs', () => {
  const url = (password, host = 'db.example.org') =>
    `postgres://atelion:${password}@${host}:5432/atelion`;

  it('finds a password in a connection string', () => {
    assert.deepEqual(rules('a.ts', url('Xk82Lmq0')), ['url-credentials']);
  });

  it('accepts local development hosts', () => {
    assert.deepEqual(rules('a.ts', url('Xk82Lmq0', 'localhost')), []);
    assert.deepEqual(rules('a.ts', url('Xk82Lmq0', '127.0.0.1')), []);
  });

  it('accepts a variable reference', () => {
    assert.deepEqual(rules('a.yml', url(`\${DB_PASSWORD}`)), []);
  });

  it('accepts a placeholder password', () => {
    assert.deepEqual(rules('a.md', url('password')), []);
  });

  it('ignores URLs without a password', () => {
    assert.deepEqual(rules('a.ts', 'https://user@github.com/org/repo'), []);
  });
});

describe('findSecrets: secret-named assignments', () => {
  const value = `a8F3${'kq92LmZx'}`;

  for (const name of [
    'apiKey',
    'API_KEY',
    'clientSecret',
    'DB_PASSWORD',
    'jwtSecret',
    'accessToken',
    'this.password',
  ]) {
    it(`finds ${name} assigned a literal`, () => {
      assert.deepEqual(rules('a.ts', assign(name, value)), [
        'secret-assignment',
      ]);
    });
  }

  it('finds JSON keys', () => {
    const json = `{ "client_secret": "${value}" }`;
    assert.deepEqual(rules('a.json', json), ['secret-assignment']);
  });

  it('finds double-quoted and template literals', () => {
    assert.deepEqual(rules('a.ts', assign('token', value, '"')), [
      'secret-assignment',
    ]);
    assert.deepEqual(rules('a.ts', assign('token', value, '`')), [
      'secret-assignment',
    ]);
  });

  it('finds a long secret with no digit', () => {
    const long = `CorrectHorse${'BatteryStaple'}`;
    assert.deepEqual(rules('a.ts', assign('password', long)), [
      'secret-assignment',
    ]);
  });

  it('finds unquoted values in config files', () => {
    const line = `DB_PASSWORD=${value}`;
    assert.deepEqual(rules('docker/app.sh', `export ${line}`), [
      'secret-assignment',
    ]);
    assert.deepEqual(rules('.env.example', line), ['secret-assignment']);
    assert.deepEqual(rules('compose.yaml', `  - ${line}`), [
      'secret-assignment',
    ]);
    assert.deepEqual(rules('Dockerfile', `ENV ${line}`), ['secret-assignment']);
  });

  it('ignores unquoted values outside config files', () => {
    assert.deepEqual(rules('notes.md', `DB_PASSWORD=${value}`), []);
  });

  for (const [label, line] of [
    ['an env reference', 'const apiKey = process.env.API_KEY;'],
    ['a type annotation', 'password: string;'],
    ['a comparison', `if (token === '${value}') {}`],
    ['an empty .env.example value', 'DB_PASSWORD='],
    ['a GitHub Actions secret', `password: \${{ secrets.DB_PASSWORD }}`],
    ['a placeholder', assign('apiKey', 'your-api-key-here')],
    ['changeme', assign('password', 'changeme123')],
    ['a storage key name', assign('tokenKey', 'atelion.session.v1')],
    ['a snake_case name', assign('TOKEN_NAME', 'auth_token')],
    ['a header name', assign('TOKEN_HEADER', 'X-Auth-Token')],
    ['a route', assign('tokenUrl', '/api/v1/auth/token')],
    ['a regex', assign('TOKEN_PATTERN', '^[A-Za-z0-9]+$')],
    ['prose', assign('passwordHint', 'Use 12 or more characters')],
    ['a short value', assign('pwd', 'Ab1')],
    ['a package version', '"js-tokens": "^4.0.0",'],
  ]) {
    it(`ignores ${label}`, () => assert.deepEqual(rules('a.yml', line), []));
  }
});

describe('findSecrets: allow marker', () => {
  it('skips a line carrying the marker', () => {
    const line = `${SECRETS.jwt} // ${ALLOW_MARKER}`;
    assert.deepEqual(rules('a.test.ts', line), []);
  });

  it('only skips that line', () => {
    const text = [
      `${SECRETS.jwt} // ${ALLOW_MARKER}`,
      SECRETS['aws-access-key'],
    ].join('\n');
    assert.deepEqual(
      findSecrets('a.ts', text).map(({ line }) => line),
      [2],
    );
  });
});

describe('looksLikeSecret', () => {
  it('needs at least 8 characters', () => {
    assert.equal(looksLikeSecret('Ab1x9Kz'), false);
    assert.equal(looksLikeSecret('Ab1x9Kz2'), true);
  });

  it('rejects low-entropy values', () => {
    assert.equal(looksLikeSecret('aaaaaaaa1'), false);
  });
});

describe('mask', () => {
  it('never shows more than a quarter of the secret', () => {
    assert.equal(mask('Ab1x9Kz2'), 'Ab… (8 chars)');
    assert.equal(mask(SECRETS['aws-access-key']), 'AKIA… (20 chars)');
  });
});
