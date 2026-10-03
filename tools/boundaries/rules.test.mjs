import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { findViolations } from './rules.mjs';

const TAGS = {
  '@app/api': ['scope:app', 'type:app'],
  '@app/web': ['scope:app', 'type:app'],
  '@app/converter': ['scope:app', 'type:app'],
  '@core/api': ['scope:core', 'type:core'],
  '@core/db': ['scope:core', 'type:core'],
  '@core/ui': ['scope:core', 'type:core'],
  '@devtools/web': ['scope:devtools', 'type:web'],
  '@fiscus/contracts': ['scope:fiscus', 'type:contracts'],
  '@fiscus/domain': ['scope:fiscus', 'type:domain'],
  '@fiscus/api': ['scope:fiscus', 'type:api'],
  '@fiscus/web': ['scope:fiscus', 'type:web'],
  '@pdf/contracts': ['scope:pdf', 'type:contracts'],
  '@pdf/api': ['scope:pdf', 'type:api'],
  '@pdf/web': ['scope:pdf', 'type:web'],
};

/** Mirrors the workspace dependencies each project's package.json declares. */
const EDGES = {
  '@app/api': ['@core/api', '@fiscus/api', '@pdf/api', 'npm:@nestjs/core'],
  '@app/web': [
    '@core/ui',
    '@devtools/web',
    '@fiscus/web',
    '@pdf/web',
    'npm:react',
  ],
  '@app/converter': ['@pdf/contracts'],
  '@core/api': ['@core/db', 'npm:@nestjs/common'],
  '@fiscus/api': ['@core/api', '@fiscus/domain', '@fiscus/contracts'],
  '@fiscus/domain': ['@fiscus/contracts'],
  '@fiscus/web': ['@core/ui', '@fiscus/contracts', 'npm:react'],
  '@pdf/api': ['@core/api', '@pdf/contracts'],
  '@pdf/web': ['@core/ui', '@pdf/contracts'],
  '@devtools/web': ['@core/ui'],
};

function graph({ tags = TAGS, edges = EDGES } = {}) {
  return {
    nodes: Object.fromEntries(
      Object.entries(tags).map(([name, projectTags]) => [
        name,
        { name, data: { tags: projectTags } },
      ]),
    ),
    dependencies: Object.fromEntries(
      Object.keys(tags).map((name) => [
        name,
        (edges[name] ?? []).map((target) => ({ source: name, target })),
      ]),
    ),
  };
}

/** The shipped layout plus one extra edge. */
function withEdge(source, target) {
  return graph({
    edges: { ...EDGES, [source]: [...(EDGES[source] ?? []), target] },
  });
}

function assertViolation(input, pattern) {
  const violations = findViolations(input);
  assert.ok(
    violations.some((violation) => pattern.test(violation)),
    `Expected a violation matching ${pattern}, got:\n${violations.join('\n')}`,
  );
}

describe('findViolations', () => {
  it('accepts the shipped layout', () => {
    assert.deepEqual(findViolations(graph()), []);
  });

  describe('tags', () => {
    it('rejects an untagged project', () => {
      assertViolation(
        graph({ tags: { ...TAGS, '@pdf/web': [] } }),
        /@pdf\/web needs exactly one scope/,
      );
    });

    it('rejects two type tags', () => {
      assertViolation(
        graph({
          tags: { ...TAGS, '@pdf/web': ['scope:pdf', 'type:web', 'type:api'] },
        }),
        /@pdf\/web needs exactly one scope/,
      );
    });

    it('rejects an unknown type', () => {
      assertViolation(
        graph({ tags: { ...TAGS, '@pdf/web': ['scope:pdf', 'type:lib'] } }),
        /@pdf\/web needs exactly one scope/,
      );
    });
  });

  it('rejects any import of an app', () => {
    assertViolation(
      withEdge('@core/api', '@app/api'),
      /Nothing may depend on an app/,
    );
  });

  it('rejects core importing a module', () => {
    assertViolation(
      withEdge('@core/ui', '@fiscus/contracts'),
      /Core must not import any module/,
    );
  });

  describe('cross-module imports', () => {
    it('rejects reaching past contracts', () => {
      assertViolation(
        withEdge('@pdf/api', '@fiscus/domain'),
        /only through contracts/,
      );
    });

    it('accepts another module’s contracts', () => {
      assert.deepEqual(
        findViolations(withEdge('@pdf/api', '@fiscus/contracts')),
        [],
      );
    });
  });

  it('rejects contracts importing a workspace project', () => {
    assertViolation(
      withEdge('@fiscus/contracts', '@core/db'),
      /Contracts must not import any workspace project/,
    );
  });

  describe('domain', () => {
    it('rejects a non-contracts project', () => {
      assertViolation(
        withEdge('@fiscus/domain', '@core/api'),
        /Domain may depend only on contracts/,
      );
    });

    it('rejects a framework package, with or without a version suffix', () => {
      assertViolation(
        withEdge('@fiscus/domain', 'npm:@nestjs/common'),
        /framework-free/,
      );
      assertViolation(
        withEdge('@fiscus/domain', 'npm:react@19.3.0'),
        /framework-free/,
      );
    });

    it('accepts a package that only shares a prefix with one', () => {
      assert.deepEqual(
        findViolations(withEdge('@fiscus/domain', 'npm:postgres-array')),
        [],
      );
    });
  });

  describe('browser code', () => {
    it('rejects importing an api project', () => {
      assertViolation(
        withEdge('@fiscus/web', '@fiscus/api'),
        /Browser code must not import server code/,
      );
    });

    it('rejects importing core/db from the shell', () => {
      assertViolation(
        withEdge('@app/web', '@core/db'),
        /Browser code must not import server code/,
      );
    });

    it('rejects a server package', () => {
      assertViolation(
        withEdge('@core/ui', 'npm:fastify'),
        /Browser code must not import server packages/,
      );
    });
  });

  describe('converter', () => {
    it('rejects anything but contracts', () => {
      assertViolation(
        withEdge('@app/converter', '@core/db'),
        /converter may depend only on contracts/,
      );
    });

    it('rejects a database package', () => {
      assertViolation(
        withEdge('@app/converter', 'npm:postgres'),
        /converter has no database access/,
      );
    });
  });
});
