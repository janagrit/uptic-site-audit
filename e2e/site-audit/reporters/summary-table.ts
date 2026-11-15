import { formatDrift } from './baseline';
import type { Finding, FindingCategory } from './findings';
import type { Counts, GroupRow, Outcome, RunReport } from './model';

/**
 * Renders a RunReport as a console table and as GitHub step-summary Markdown. Rendering only: the
 * verdict is decided in model.ts before anything is printed, so the PASS/FAIL label shown here is
 * always the run's real exit status.
 */

const COLUMNS: readonly { key: Outcome; label: string; color: string }[] = [
  { key: 'passed', label: 'Passed', color: '32' },
  { key: 'failed', label: 'New failure', color: '31' },
  { key: 'flaky', label: 'Flaky', color: '33' },
  { key: 'known-defect', label: 'Known bug', color: '35' },
  { key: 'unexpected-pass', label: 'Fixed on site', color: '36' },
  { key: 'skipped', label: 'Skipped', color: '90' },
  { key: 'not-run', label: 'Not run', color: '31' },
];

const SECTIONS: readonly { category: FindingCategory; heading: string; color: string }[] = [
  { category: 'new-failure', heading: 'New failures (look at these first)', color: '31' },
  { category: 'fixed-on-site', heading: 'Fixed on the site: remove knownBug() and mark the finding fixed', color: '36' },
  { category: 'known-defect', heading: 'Known bugs (FINDINGS.md)', color: '35' },
];

const seconds = (ms: number): string => `${(ms / 1000).toFixed(1)}s`;
const stripAnsi = (text: string): string => text.replace(/\x1b\[[0-9;]*m/g, '');
const firstLine = (text: string | undefined): string => text?.split('\n').find((line) => line.trim())?.trim() ?? '';

function totalRow(report: RunReport): GroupRow {
  return { group: 'Total', counts: report.counts, durationMs: report.groups.reduce((sum, g) => sum + g.durationMs, 0) };
}

/** One-line explanation under the table, e.g. "2 known bug(s), 0 new failure(s)". */
export function verdictLine(report: RunReport): string {
  const c: Counts = report.counts;
  const parts = [`${c['known-defect']} known bug(s)`, `${c.failed} new failure(s)`];
  if (c['unexpected-pass'] > 0) parts.push(`${c['unexpected-pass']} fixed on the site`);
  if (c.flaky > 0) parts.push(`${c.flaky} flaky`);
  if (c['not-run'] > 0) parts.push(`${c['not-run']} not run`);
  return parts.join(', ');
}

export function baselineLine(report: RunReport): string {
  return `Baseline (${report.baseline.mode}): ${report.baseline.status} — ${report.baseline.message}`;
}

// ── Console ─────────────────────────────────────────────────────────────────────────────────────

export function renderConsole(report: RunReport, useColor: boolean): string {
  const paint = (code: string, text: string): string => (useColor ? `\x1b[${code}m${text}\x1b[0m` : text);
  const pad = (text: string, width: number, right: boolean): string => {
    const fill = ' '.repeat(Math.max(0, width - stripAnsi(text).length));
    return right ? fill + text : text + fill;
  };

  const header = ['Spec', ...COLUMNS.map((c) => c.label), 'Time'];
  const cells = (row: GroupRow, bold: boolean): string[] => [
    bold ? paint('1', row.group) : row.group,
    ...COLUMNS.map(({ key, color }) => (row.counts[key] > 0 ? paint(color, String(row.counts[key])) : paint('90', '·'))),
    seconds(row.durationMs),
  ];
  const body = report.groups.map((row) => cells(row, false));
  const footer = cells(totalRow(report), true);
  const widths = header.map((h, i) => Math.max(h.length, ...[...body, footer].map((r) => stripAnsi(r[i]).length)));
  const rule = (l: string, m: string, r: string): string => l + widths.map((w) => '─'.repeat(w + 2)).join(m) + r;
  const line = (cols: readonly string[]): string => `│${cols.map((c, i) => ` ${pad(c, widths[i], i > 0)} `).join('│')}│`;

  const out = [
    '',
    rule('┌', '┬', '┐'),
    line(header.map((h) => paint('1', h))),
    rule('├', '┼', '┤'),
    ...body.map(line),
    rule('├', '┼', '┤'),
    line(footer),
    rule('└', '┴', '┘'),
  ];

  const passed = report.verdict.status === 'passed';
  const label = passed ? paint('42;30', ' PASS ') : paint('41;37', ` ${report.verdict.status.toUpperCase()} `);
  out.push(`${label} ${seconds(report.durationMs)} wall time  ${verdictLine(report)}`);
  out.push(paint(report.baseline.status === 'failed' || report.baseline.status === 'refused' ? '31' : '90', baselineLine(report)));
  for (const issue of report.baseline.collectionIssues) out.push(paint('31', `  collection: ${issue}`));
  for (const drift of report.baseline.drift) out.push(paint('31', `  ${formatDrift(drift)}`));
  if (!passed) out.push(paint('31', `Why: ${report.verdict.reasons.join('; ')}`));

  for (const { category, heading, color } of SECTIONS) {
    const items = report.findings.filter((f) => f.category === category);
    if (items.length === 0) continue;
    out.push('', paint(`${color};1`, heading));
    items.forEach((f, i) => {
      out.push(`  ${i + 1}. ${paint('1', f.test)}`);
      out.push(`     ${paint('90', `${f.severity} · ${f.page}${f.reference ? ` · ${f.reference}` : ''}`)}`);
      const detail = category === 'new-failure' ? firstLine(f.evidence.error) : (f.summary ?? '');
      if (detail) out.push(`     ${paint(color, detail)}`);
    });
  }
  return `${out.join('\n')}\n`;
}

// ── GitHub step summary ─────────────────────────────────────────────────────────────────────────

const cell = (text: string): string => text.replace(/\|/g, '\\|').replace(/\n/g, ' ');

function findingRow(f: Finding): string {
  const detail = f.category === 'new-failure' ? firstLine(f.evidence.error) : (f.summary ?? '');
  return `| ${cell(f.severity)} | ${cell(f.page)} | ${cell(f.test)} | ${cell(f.reference ?? '')} | ${cell(detail)} | ${cell(f.remediation)} |`;
}

export function renderMarkdown(report: RunReport): string {
  const icon = report.verdict.status === 'passed' ? '✅' : '❌';
  const counts = (row: GroupRow): string => COLUMNS.map(({ key }) => (row.counts[key] > 0 ? row.counts[key] : '·')).join(' | ');
  const lines = [
    `## ${icon} Site audit — ${report.verdict.status} (${seconds(report.durationMs)})`,
    '',
    `Target: ${report.target.baseUrl}${report.target.isProduction ? ' (production)' : ''}`,
    '',
    `| Spec | ${COLUMNS.map((c) => c.label).join(' | ')} | Time |`,
    `|---|${COLUMNS.map(() => '---:').join('|')}|---:|`,
    ...report.groups.map((row) => `| \`${row.group}\` | ${counts(row)} | ${seconds(row.durationMs)} |`),
    `| **Total** | ${counts(totalRow(report))} | ${seconds(totalRow(report).durationMs)} |`,
    '',
    verdictLine(report),
    '',
    baselineLine(report),
    ...report.baseline.collectionIssues.map((issue) => `- collection: ${issue}`),
    ...report.baseline.drift.map((d) => `- \`${formatDrift(d)}\``),
    '',
    ...(report.verdict.reasons.length > 0 ? [`**Why ${report.verdict.status}:** ${report.verdict.reasons.join('; ')}`, ''] : []),
  ];
  for (const { category, heading } of SECTIONS) {
    const items = report.findings.filter((f) => f.category === category);
    if (items.length === 0) continue;
    lines.push(`### ${heading}`, '', '| Severity | Page | Test | Ref | Detail | Remediation |', '|---|---|---|---|---|---|', ...items.map(findingRow), '');
  }
  return `${lines.join('\n')}\n`;
}
