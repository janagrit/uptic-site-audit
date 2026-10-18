import type { TestDetails } from '@playwright/test';
import type { AuditCheck, AuditPage } from './targets';

/**
 * Tag for a test that fails because of an open site defect in FINDINGS.md.
 * The test stays red until the site is fixed; skip open bugs with `--grep-invert @bug`.
 */
export const BUG_TAG = '@bug';
export const BUG_ANNOTATION = 'bug';

/** Test details for a check that fails on the live site: `knownBug('FINDINGS #21: …')`. */
export function knownBug(finding: string): TestDetails {
  return { tag: BUG_TAG, annotation: { type: BUG_ANNOTATION, description: finding } };
}

/** knownBug() when the target lists this audit check in `knownIssues`, otherwise no details. */
export function auditDetails(target: AuditPage, check: AuditCheck): TestDetails {
  const finding = target.knownIssues?.[check];
  return finding === undefined ? {} : knownBug(finding);
}
