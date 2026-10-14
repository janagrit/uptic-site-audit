import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const ENV_FILE = resolve(__dirname, '.env');
export const PRODUCTION_URL = 'https://uptichospitality.com';

if (existsSync(ENV_FILE)) {
  process.loadEnvFile(ENV_FILE);
}

/** Site under test: `BASE_URL` from the environment or `.env`, else production. */
function readBaseUrl(): string {
  const raw = process.env.BASE_URL?.trim() || PRODUCTION_URL;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`BASE_URL is not a valid URL: "${raw}" (set it in .env, e.g. BASE_URL=${PRODUCTION_URL})`);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(`BASE_URL must be http(s), got "${raw}"`);
  }
  return url.origin;
}

// Pages under audit. Add URLs here as you expand coverage.
export const BASE_URL = readBaseUrl();

export type AuditCheck = 'single-h1' | 'title-length' | 'meta-description' | 'axe';

export interface AuditPage {
  readonly name: string;
  readonly path: string;
  /** Checks known to fail on the live site, mapped to their FINDINGS.md entry. */
  readonly knownIssues?: Readonly<Partial<Record<AuditCheck, string>>>;
}

/** A published article used by the e2e and API suites. */
export const SAMPLE_ARTICLE_SLUG = 'independent-hotels-should-think-independently';

export const PAGES: readonly AuditPage[] = [
  { name: 'Home', path: '/' },
  {
    name: 'Article: Independent Hotels',
    path: `/${SAMPLE_ARTICLE_SLUG}/`,
    knownIssues: {
      'single-h1': 'FINDINGS #1',
      'meta-description': 'FINDINGS #2',
      'title-length': 'FINDINGS #10',
      axe: 'FINDINGS #16',
    },
  },
];
