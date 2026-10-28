import { test } from '@playwright/test';
import type { AuditCheck, AuditPage } from './targets';

/**
 * Marks the running test as an expected failure caused by an open site defect in FINDINGS.md
 * (`test.fail`): the run stays green while the defect is open. Once the site is fixed the test
 * passes unexpectedly and turns red: remove the call and mark the finding fixed.
 */
export function knownBug(finding: string): void {
  test.fail(true, finding);
}

/** knownBug() when the target lists this audit check in `knownIssues`. */
export function expectKnownIssue(target: AuditPage, check: AuditCheck): void {
  const finding = target.knownIssues?.[check];
  if (finding !== undefined) knownBug(finding);
}
