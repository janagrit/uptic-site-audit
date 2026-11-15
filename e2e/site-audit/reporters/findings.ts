import type { TestRecord } from './model';

/**
 * Turns test outcomes into findings a reader can act on: severity, affected page, evidence,
 * expected vs actual, remediation. Known defects take severity, page and remediation from their
 * FINDINGS.md row (the human-maintained source of truth); new failures are "untriaged".
 * Pure; unit tested in tests/unit/findings.spec.ts.
 */

export interface FindingsEntry {
  readonly id: number;
  readonly page: string;
  readonly summary: string;
  readonly severity: string;
  readonly recommendation: string;
  readonly status: string;
}

export type FindingCategory = 'new-failure' | 'known-defect' | 'fixed-on-site';

export interface Finding {
  readonly category: FindingCategory;
  readonly test: string;
  /** `FINDINGS #N`, when the test cites one. */
  readonly reference?: string;
  readonly severity: string;
  readonly page: string;
  readonly summary?: string;
  readonly expected?: string;
  readonly actual?: string;
  readonly evidence: { readonly error?: string; readonly attachments: readonly string[] };
  readonly remediation: string;
}

/** Rows of the FINDINGS.md tables: `| # | Page | Finding | Severity | Recommendation | Status |`. */
export function parseFindings(markdown: string): Map<number, FindingsEntry> {
  const entries = new Map<number, FindingsEntry>();
  for (const line of markdown.split('\n')) {
    // Split on unescaped pipes; cells may contain `\|`.
    const cells = line.trim().split(/(?<!\\)\|/).slice(1, -1).map((cell) => cell.trim().replace(/\\\|/g, '|'));
    if (cells.length !== 6 || !/^\d+$/.test(cells[0])) continue;
    const [id, page, summary, severity, recommendation, status] = cells;
    entries.set(Number(id), { id: Number(id), page, summary, severity, recommendation, status });
  }
  return entries;
}

/** The FINDINGS number a `knownBug('FINDINGS #N: …')` reason cites. */
export function findingNumber(reason: string | undefined): number | undefined {
  const match = reason?.match(/FINDINGS #(\d+)/);
  return match ? Number(match[1]) : undefined;
}

/** `Expected:` / `Received:` lines of a Playwright assertion message. */
export function expectedActual(message: string | undefined): { expected?: string; actual?: string } {
  if (!message) return {};
  const line = (label: RegExp): string | undefined => message.split('\n').find((l) => label.test(l))?.replace(label, '').trim();
  return {
    expected: line(/^\s*Expected(?: \w+)?:\s*/),
    actual: line(/^\s*Received(?: \w+)?:\s*/),
  };
}

/** `SEO — Home › has a canonical URL` → `Home`: specs title describes `<Layer> — <Area>`. */
export function pageFromTitle(title: string): string {
  const first = title.split(' › ')[0];
  const area = first.split(' — ').at(1)?.trim();
  return area || first;
}

const MAX_ERROR_LENGTH = 600;

export function buildFindings(records: readonly TestRecord[], findings: ReadonlyMap<number, FindingsEntry>): Finding[] {
  const result: Finding[] = [];
  for (const record of records) {
    const category: FindingCategory | undefined =
      record.outcome === 'failed' ? 'new-failure' : record.outcome === 'known-defect' ? 'known-defect' : record.outcome === 'unexpected-pass' ? 'fixed-on-site' : undefined;
    if (!category) continue;

    const number = findingNumber(record.finding);
    const entry = number === undefined ? undefined : findings.get(number);
    const reference = number === undefined ? undefined : `FINDINGS #${number}`;
    const remediation =
      category === 'new-failure'
        ? 'Triage: reproduce on the site. A site defect gets a FINDINGS.md entry and knownBug(); a test defect gets fixed.'
        : category === 'fixed-on-site'
          ? `Fixed on the site: remove knownBug(), mark ${reference ?? 'the finding'} fixed, run npm run baseline:update.`
          : (entry?.recommendation ?? 'See FINDINGS.md.');

    result.push({
      category,
      test: record.key,
      reference,
      severity: category === 'new-failure' ? 'untriaged' : (entry?.severity ?? 'unknown'),
      page: entry?.page ?? pageFromTitle(record.title),
      summary: entry?.summary ?? record.finding,
      ...(category === 'fixed-on-site' ? {} : expectedActual(record.error)),
      evidence: { error: record.error?.slice(0, MAX_ERROR_LENGTH), attachments: record.attachments },
      remediation,
    });
  }
  const order: Record<FindingCategory, number> = { 'new-failure': 0, 'fixed-on-site': 1, 'known-defect': 2 };
  return result.sort((a, b) => order[a.category] - order[b.category] || a.test.localeCompare(b.test));
}
