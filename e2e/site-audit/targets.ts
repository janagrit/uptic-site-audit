import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { ConfigError, joinUrl, normalizeBaseUrl } from './config/url';

/**
 * The one place that says what is audited. A target is a website: where it lives, which platform
 * it runs on (decides whether the WordPress-specific layers apply) and which pages every generic
 * audit (SEO, accessibility, links, mobile, page health) runs against.
 *
 * Adding another site = one more entry in TARGETS, then `AUDIT_TARGET=<id> npm test`.
 */

export type Platform = 'wordpress' | 'generic';

/** Audit checks a page can list as a known, open defect (see knownBugs.ts → expectKnownIssue). */
export type AuditCheck =
  | 'single-h1'
  | 'title-length'
  | 'meta-description'
  | 'axe'
  | 'heading-order'
  | 'focus-visible'
  | 'image-alt-quality'
  | 'touch-targets';

export interface AuditPage {
  readonly name: string;
  /** Path relative to the target's base URL; a leading slash does not drop a base path. */
  readonly path: string;
  /** Checks known to fail on the live site, mapped to their FINDINGS.md entry. */
  readonly knownIssues?: Readonly<Partial<Record<AuditCheck, string>>>;
}

export interface AuditTarget {
  readonly id: string;
  readonly name: string;
  /** Production URL. The regression baseline describes this URL only. */
  readonly productionUrl: string;
  readonly platform: Platform;
  readonly pages: readonly AuditPage[];
  /** A published article the e2e and API suites read (WordPress targets). */
  readonly sampleArticleSlug?: string;
}

const UPTIC_ARTICLE = 'independent-hotels-should-think-independently';

export const TARGETS: Readonly<Record<string, AuditTarget>> = {
  uptic: {
    id: 'uptic',
    name: 'Uptic Hospitality',
    productionUrl: 'https://uptichospitality.com/',
    platform: 'wordpress',
    sampleArticleSlug: UPTIC_ARTICLE,
    pages: [
      { name: 'Home', path: '/' },
      {
        name: 'Article: Independent Hotels',
        path: `/${UPTIC_ARTICLE}/`,
        knownIssues: { 'focus-visible': 'FINDINGS #24: search field has no visible focus indicator' },
      },
      { name: 'Contact', path: '/contact/' },
    ],
  },
};

export const DEFAULT_TARGET_ID = 'uptic';

export interface ResolvedTarget extends AuditTarget {
  /** Normalized URL actually under test: BASE_URL when set, else the production URL. Ends with `/`. */
  readonly baseUrl: string;
  readonly isProduction: boolean;
}

/**
 * Picks and validates the target from environment variables. Pure: pass `process.env` or a test
 * double. AUDIT_TARGET selects the site (default `uptic`); BASE_URL points it at another copy of
 * that site, e.g. staging, keeping any path prefix.
 */
export function resolveTarget(
  env: Readonly<Record<string, string | undefined>>,
  registry: Readonly<Record<string, AuditTarget>> = TARGETS,
): ResolvedTarget {
  const id = env.AUDIT_TARGET?.trim() || DEFAULT_TARGET_ID;
  const target = registry[id] as AuditTarget | undefined;
  if (!target) {
    throw new ConfigError(`AUDIT_TARGET "${id}" is unknown; expected one of: ${Object.keys(registry).join(', ')}`);
  }
  if (target.pages.length === 0) {
    throw new ConfigError(`target "${id}" lists no pages`);
  }
  const productionUrl = normalizeBaseUrl(target.productionUrl, `${id}.productionUrl`);
  const override = env.BASE_URL?.trim();
  const baseUrl = override ? normalizeBaseUrl(override) : productionUrl;
  return { ...target, productionUrl, baseUrl, isProduction: baseUrl === productionUrl };
}

const ENV_FILE = resolve(__dirname, '.env');
if (existsSync(ENV_FILE)) {
  process.loadEnvFile(ENV_FILE);
}

export const TARGET: ResolvedTarget = resolveTarget(process.env);

/** URL under test, normalized with a trailing slash (e.g. `https://uptichospitality.com/`). */
export const BASE_URL = TARGET.baseUrl;
export const PRODUCTION_URL = TARGET.productionUrl;
export const IS_PRODUCTION = TARGET.isProduction;
export const PAGES: readonly AuditPage[] = TARGET.pages;

/** Absolute URL of a path on the site under test. Every `goto` and `request.get` goes through it. */
export function siteUrl(path: string): string {
  return joinUrl(BASE_URL, path);
}

/** The sample article of a WordPress target. */
export const SAMPLE_ARTICLE_SLUG = TARGET.sampleArticleSlug ?? '';
