import type { CollectionEvidence } from '../../reporters/baseline';
import type { Outcome, TestRecord } from '../../reporters/model';

/** A test record with sensible defaults; key = `project › file › title`. */
export function record(title: string, outcome: Outcome, overrides: Partial<TestRecord> = {}): TestRecord {
  const project = overrides.project ?? 'desktop';
  const file = overrides.file ?? 'seo.spec.ts';
  return { key: `${project} › ${file} › ${title}`, project, file, title, outcome, attachments: [], durationMs: 10, ...overrides };
}

/** Evidence of a complete run that collected exactly the files of `records`. */
export function completeEvidence(records: readonly TestRecord[]): CollectionEvidence {
  const files: Record<string, string[]> = {};
  for (const r of records) files[r.project] = [...new Set([...(files[r.project] ?? []), r.file])];
  const projects = Object.keys(files);
  return { configuredProjects: projects, collectedProjects: projects, expectedFiles: files, collectedFiles: files, filters: [] };
}
