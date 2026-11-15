import { unitTest as test, expect } from '../../fixtures';
import { budgetViolations, imageIssues, median, parseHistory, percentile, regressions, summarize, type HistoryEntry, type ImageFacts, type Sample } from '../../perf/stats';

const sample = (overrides: Partial<Sample>): Sample => ({ lcpMs: 1000, cls: 0.01, inpMs: 50, totalBytes: 500_000, scriptBytes: 10_000, imageBytes: 100_000, requests: 10, ...overrides });

test.describe('Unit — Performance statistics', () => {
  test('median and percentiles interpolate', () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(percentile([10, 20, 30, 40, 50], 0.75)).toBe(40);
    expect(() => median([])).toThrow();
  });

  test('one slow outlier does not move the median', () => {
    const summary = summarize('Home', [sample({ lcpMs: 900 }), sample({ lcpMs: 1000 }), sample({ lcpMs: 9000 }), sample({ lcpMs: 950 }), sample({ lcpMs: 1100 })]);

    expect(summary.median.lcpMs).toBe(1000);
    expect(summary.runs).toBe(5);
  });

  test('budgets are judged on the median and list each violation', () => {
    const summary = summarize('Home', [sample({ lcpMs: 3000, cls: 0.2 }), sample({ lcpMs: 3100, cls: 0.2 }), sample({ lcpMs: 900, cls: 0.2 })]);

    expect(budgetViolations(summary, { lcpMs: 2500, cls: 0.1, requests: 50 })).toEqual([
      { metric: 'lcpMs', actual: 3000, budget: 2500 },
      { metric: 'cls', actual: 0.2, budget: 0.1 },
    ]);
  });
});

test.describe('Unit — Performance history', () => {
  const entry = (lcpMs: number, page = 'Home'): HistoryEntry => ({ measuredAt: '2026-11-01T06:00:00Z', page, median: sample({ lcpMs }) });
  const current = summarize('Home', [sample({ lcpMs: 1500 })]);

  test('no trend verdict until history is long enough', () => {
    expect(regressions(current, [entry(1000), entry(1000)])).toEqual([]);
  });

  test('a large worsening against recent runs is reported', () => {
    const [trend] = regressions(current, [entry(1000), entry(1100), entry(900)]);

    expect(trend).toMatchObject({ metric: 'lcpMs', current: 1500, historicalMedian: 1000 });
    expect(trend.change).toBeCloseTo(0.5);
  });

  test('a change within tolerance, or on another page, is not', () => {
    expect(regressions(summarize('Home', [sample({ lcpMs: 1100 })]), [entry(1000), entry(1000), entry(1000)])).toEqual([]);
    expect(regressions(current, [entry(500, 'Contact'), entry(500, 'Contact'), entry(500, 'Contact')])).toEqual([]);
  });

  test('history parsing skips blank and corrupt lines', () => {
    const jsonl = `${JSON.stringify(entry(1000))}\n\nnot json\n{"page": 1}\n${JSON.stringify(entry(1200))}\n`;

    expect(parseHistory(jsonl).map((e) => e.median.lcpMs)).toEqual([1000, 1200]);
  });
});

test.describe('Unit — Image optimization rules', () => {
  const image = (overrides: Partial<ImageFacts>): ImageFacts => ({
    url: 'https://site.example/a.webp',
    bytes: 50_000,
    naturalWidth: 800,
    neededWidth: 800,
    hasDimensions: true,
    lazy: false,
    aboveTheFold: true,
    ...overrides,
  });

  test('a well-sized modern image has no issues', () => {
    expect(imageIssues([image({})])).toEqual([]);
  });

  test('flags oversized, legacy-format, dimensionless and lazy above-the-fold images', () => {
    const [result] = imageIssues([image({ url: 'https://site.example/hero.png', bytes: 400_000, naturalWidth: 2400, neededWidth: 800, hasDimensions: false, lazy: true })]);

    expect(result.issues).toEqual([
      expect.stringMatching(/^oversized: 2400px wide, drawn at 800px/),
      expect.stringMatching(/^legacy format/),
      expect.stringMatching(/^no width\/height/),
      expect.stringMatching(/^loading="lazy" above the fold/),
    ]);
  });

  test('small files are not worth flagging as oversized or legacy', () => {
    expect(imageIssues([image({ url: 'https://site.example/icon.png', bytes: 5_000, naturalWidth: 512, neededWidth: 48 })])).toEqual([]);
  });
});
