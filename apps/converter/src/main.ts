/**
 * Entry point for the PDF converter unit (FR-72). A systemd path unit starts
 * it when a job lands in the inbox; it converts, writes to the outbox and
 * exits, with no network and no database access. Phase 3 fills it in.
 */
console.log('Atelion converter: no jobs to process.');
