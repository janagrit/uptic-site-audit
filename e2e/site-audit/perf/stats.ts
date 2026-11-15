/**
 * Performance statistics and budget decisions. Pure; unit tested in tests/unit/perf-stats.spec.ts.
 *
 * Why medians and history: a single page load on a shared production host varies by tens of
 * percent (CDN cache state, server load, network). So every metric is measured several times and
 * judged by its median; budgets fail the run, while a change against history only warns, and only
 * when it is large and history is long enough to mean something.
 */

export const METRICS = ['lcpMs', 'cls', 'inpMs', 'totalBytes', 'scriptBytes', 'imageBytes', 'requests'] as const;
export type Metric = (typeof METRICS)[number];

export type Sample = Readonly<Record<Metric, number>>;
export type Budget = Readonly<Partial<Record<Metric, number>>>;

export interface PageSummary {
  readonly page: string;
  readonly runs: number;
  readonly median: Sample;
  readonly p75: Sample;
}

/** Percentile with linear interpolation; `p` in [0, 1]. */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) throw new Error('percentile of an empty list');
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * p;
  const low = Math.floor(index);
  const high = Math.ceil(index);
  return sorted[low] + (sorted[high] - sorted[low]) * (index - low);
}

export const median = (values: readonly number[]): number => percentile(values, 0.5);

function aggregate(samples: readonly Sample[], fn: (values: number[]) => number): Sample {
  return Object.fromEntries(METRICS.map((metric) => [metric, fn(samples.map((s) => s[metric]))])) as Sample;
}

export function summarize(page: string, samples: readonly Sample[]): PageSummary {
  return { page, runs: samples.length, median: aggregate(samples, median), p75: aggregate(samples, (v) => percentile(v, 0.75)) };
}

export interface BudgetViolation {
  readonly metric: Metric;
  readonly actual: number;
  readonly budget: number;
}

/** Medians over budget. Budgets are judged on the median, never on a single run. */
export function budgetViolations(summary: PageSummary, budget: Budget): BudgetViolation[] {
  return METRICS.flatMap((metric) => {
    const limit = budget[metric];
    const actual = summary.median[metric];
    return limit !== undefined && actual > limit ? [{ metric, actual, budget: limit }] : [];
  });
}

export interface HistoryEntry {
  readonly measuredAt: string;
  readonly page: string;
  readonly median: Sample;
}

export interface Trend {
  readonly metric: Metric;
  readonly current: number;
  readonly historicalMedian: number;
  /** current / historical − 1, e.g. 0.25 = 25 % worse. */
  readonly change: number;
}

export interface TrendOptions {
  /** Fewer earlier runs than this: no verdict, history is not yet meaningful. */
  readonly minHistory: number;
  /** How many of the most recent runs form the reference. */
  readonly window: number;
  /** Relative worsening that is reported, e.g. 0.2 = 20 %. */
  readonly tolerance: number;
}

export const DEFAULT_TREND: TrendOptions = { minHistory: 3, window: 7, tolerance: 0.2 };

/** Metrics whose median is notably worse than the median of recent runs of the same page. Warning only. */
export function regressions(summary: PageSummary, history: readonly HistoryEntry[], options: TrendOptions = DEFAULT_TREND): Trend[] {
  const previous = history.filter((h) => h.page === summary.page).slice(-options.window);
  if (previous.length < options.minHistory) return [];
  return METRICS.flatMap((metric) => {
    const historicalMedian = median(previous.map((h) => h.median[metric]));
    const current = summary.median[metric];
    if (historicalMedian <= 0) return [];
    const change = current / historicalMedian - 1;
    return change > options.tolerance ? [{ metric, current, historicalMedian, change }] : [];
  });
}

// ── Image optimization ───────────────────────────────────────────────────────────────────────────

export interface ImageFacts {
  readonly url: string;
  readonly bytes: number;
  readonly naturalWidth: number;
  readonly neededWidth: number;
  readonly hasDimensions: boolean;
  readonly lazy: boolean;
  readonly aboveTheFold: boolean;
}

/** Served this much wider than drawn (after device pixel ratio) counts as oversized… */
export const OVERSIZE_FACTOR = 1.5;
/** …but only when the file is big enough for the waste to matter. */
export const OVERSIZE_MIN_BYTES = 30 * 1024;
/** A PNG/JPEG/GIF above this would gain from WebP or AVIF. */
export const LEGACY_FORMAT_MIN_BYTES = 100 * 1024;

/** Concrete, fixable problems per image; images without problems are left out. */
export function imageIssues(images: readonly ImageFacts[]): { url: string; issues: string[] }[] {
  return images.flatMap((image) => {
    const issues: string[] = [];
    const kb = Math.round(image.bytes / 1024);
    if (image.naturalWidth > image.neededWidth * OVERSIZE_FACTOR && image.bytes > OVERSIZE_MIN_BYTES) {
      issues.push(`oversized: ${image.naturalWidth}px wide, drawn at ${image.neededWidth}px (${kb} KB); serve a srcset size`);
    }
    if (/\.(png|jpe?g|gif)(\?|$)/i.test(image.url) && image.bytes > LEGACY_FORMAT_MIN_BYTES) {
      issues.push(`legacy format at ${kb} KB; WebP or AVIF would be much smaller`);
    }
    if (!image.hasDimensions) issues.push('no width/height attributes: layout shifts while it loads');
    if (image.lazy && image.aboveTheFold) issues.push('loading="lazy" above the fold delays LCP');
    return issues.length > 0 ? [{ url: image.url, issues }] : [];
  });
}

/** Parses history.jsonl, skipping blank or corrupt lines rather than failing the run. */
export function parseHistory(jsonl: string): HistoryEntry[] {
  return jsonl.split('\n').flatMap((line) => {
    if (!line.trim()) return [];
    try {
      const entry = JSON.parse(line) as Partial<HistoryEntry>;
      return typeof entry.page === 'string' && entry.median ? [entry as HistoryEntry] : [];
    } catch {
      return [];
    }
  });
}
