/**
 * CI gate for the module boundaries in docs/prd, section 5.4. The rules live
 * in rules.mjs; this reads the Nx project graph and reports what they find.
 */
import { createProjectGraphAsync } from '@nx/devkit';
import { findViolations } from './rules.mjs';

const graph = await createProjectGraphAsync({ exitOnError: false });
const violations = findViolations(graph);

if (violations.length > 0) {
  console.error('Module boundary violations:\n');
  for (const violation of violations) console.error(`  - ${violation}`);
  console.error('\nSee docs/prd, section 5.4 "Repository layout".');
  process.exit(1);
}

console.log(
  `Module boundaries OK (${Object.keys(graph.nodes).length} projects).`,
);
