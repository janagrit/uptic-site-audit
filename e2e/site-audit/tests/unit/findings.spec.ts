import { unitTest as test, expect } from '../../fixtures';
import { buildFindings, expectedActual, findingNumber, pageFromTitle, parseFindings } from '../../reporters/findings';
import { record } from './support';

const FINDINGS_MD = `
| # | Page | Finding | Severity | Recommendation | Status |
|---|------|---------|----------|----------------|--------|
| 11 | Home | No search box \\| none at all | Low | Add the Search block | open |
| 19 | Site | Header injected by JS | Low | Render nav in the template | open |
| x | not | a | finding | row | here |
`;

test.describe('Unit — Findings', () => {
  test('parses FINDINGS.md table rows, including escaped pipes', () => {
    const findings = parseFindings(FINDINGS_MD);

    expect([...findings.keys()]).toEqual([11, 19]);
    expect(findings.get(11)).toEqual({
      id: 11,
      page: 'Home',
      summary: 'No search box | none at all',
      severity: 'Low',
      recommendation: 'Add the Search block',
      status: 'open',
    });
  });

  test('reads the FINDINGS number from a knownBug() reason', () => {
    expect(findingNumber('FINDINGS #19: header injected')).toBe(19);
    expect(findingNumber('no reference')).toBeUndefined();
    expect(findingNumber(undefined)).toBeUndefined();
  });

  test('extracts expected and received values from an assertion message', () => {
    const message = 'Error: expect(received).toBe(expected)\n\nExpected: 200\nReceived: 404\n    at x.spec.ts:3';

    expect(expectedActual(message)).toEqual({ expected: '200', actual: '404' });
    expect(expectedActual('Timeout 5000ms exceeded')).toEqual({ expected: undefined, actual: undefined });
  });

  test('derives the page from a `<Layer> — <Area>` describe title', () => {
    expect(pageFromTitle('SEO — Home › has a canonical URL')).toBe('Home');
    expect(pageFromTitle('Links — Contact: no broken links')).toBe('Contact: no broken links');
    expect(pageFromTitle('untitled')).toBe('untitled');
  });

  test('builds actionable findings for new failures, fixed bugs and known defects only', () => {
    const findings = buildFindings(
      [
        record('SEO — Home › title', 'passed'),
        record('Smoke — Search › home page offers a search box', 'known-defect', { finding: 'FINDINGS #11: no search UI', error: 'Expected: visible\nReceived: hidden' }),
        record('E2E — Without JavaScript › nav', 'unexpected-pass', { finding: 'FINDINGS #19: header injected' }),
        record('SEO — Contact › has a canonical URL', 'failed', { error: 'Expected: 1\nReceived: 0', attachments: ['test-results/x.png'] }),
      ],
      parseFindings(FINDINGS_MD),
    );

    expect(findings.map((f) => f.category)).toEqual(['new-failure', 'fixed-on-site', 'known-defect']);
    expect(findings[0]).toMatchObject({
      severity: 'untriaged',
      page: 'Contact',
      expected: '1',
      actual: '0',
      evidence: { attachments: ['test-results/x.png'] },
    });
    expect(findings[1]).toMatchObject({ reference: 'FINDINGS #19', severity: 'Low', remediation: expect.stringMatching(/remove knownBug\(\)/) });
    expect(findings[2]).toMatchObject({
      reference: 'FINDINGS #11',
      severity: 'Low',
      page: 'Home',
      expected: 'visible',
      actual: 'hidden',
      remediation: 'Add the Search block',
    });
  });
});
