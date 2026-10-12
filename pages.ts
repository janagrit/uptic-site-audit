// Pages under audit. Add URLs here as you expand coverage.
export const BASE_URL = 'https://uptichospitality.com';

export interface AuditPage {
  readonly name: string;
  readonly path: string;
}

export const PAGES: readonly AuditPage[] = [
  { name: 'Home', path: '/' },
  { name: 'Article: Independent Hotels', path: '/independent-hotels-should-think-independently/' },
];
