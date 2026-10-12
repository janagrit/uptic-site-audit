// Pages under audit. Add URLs here as you expand coverage.
export const BASE_URL = 'https://uptichospitality.com';

export type AuditCheck = 'single-h1' | 'title-length' | 'meta-description';

export interface AuditPage {
  readonly name: string;
  readonly path: string;
  /** Checks known to fail on the live site, mapped to their FINDINGS.md entry. */
  readonly knownIssues?: Readonly<Partial<Record<AuditCheck, string>>>;
}

export const PAGES: readonly AuditPage[] = [
  { name: 'Home', path: '/' },
  {
    name: 'Article: Independent Hotels',
    path: '/independent-hotels-should-think-independently/',
    knownIssues: {
      'single-h1': 'FINDINGS #1',
      'meta-description': 'FINDINGS #2',
      'title-length': 'FINDINGS #10',
    },
  },
];
