import { unitTest as test, expect } from '../../fixtures';
import { ConfigError, joinUrl, normalizeBaseUrl } from '../../config/url';
import { resolveTarget, type AuditTarget } from '../../targets';

test.describe('Unit — URL normalization', () => {
  const cases: ReadonlyArray<[input: string, expected: string]> = [
    ['https://uptichospitality.com', 'https://uptichospitality.com/'],
    ['https://uptichospitality.com/', 'https://uptichospitality.com/'],
    ['  https://UPTICHOSPITALITY.com  ', 'https://uptichospitality.com/'],
    ['https://staging.example.com/site', 'https://staging.example.com/site/'],
    ['https://staging.example.com/site///', 'https://staging.example.com/site/'],
    ['https://example.com//a//b/', 'https://example.com/a/b/'],
    ['http://localhost:8080', 'http://localhost:8080/'],
    ['https://example.com:443/', 'https://example.com/'],
  ];
  for (const [input, expected] of cases) {
    test(`"${input}" → "${expected}"`, () => {
      expect(normalizeBaseUrl(input)).toBe(expected);
    });
  }

  const invalid: ReadonlyArray<[input: string, message: RegExp]> = [
    ['', /not a valid absolute URL/],
    ['uptichospitality.com', /not a valid absolute URL/],
    ['/contact/', /not a valid absolute URL/],
    ['ftp://example.com', /http or https/],
    ['javascript:alert(1)', /http or https/],
    ['https://user:secret@example.com', /credentials/],
    ['https://example.com/?preview=1', /query or fragment/],
    ['https://example.com/#top', /query or fragment/],
  ];
  for (const [input, message] of invalid) {
    test(`rejects "${input}"`, () => {
      expect(() => normalizeBaseUrl(input)).toThrow(ConfigError);
      expect(() => normalizeBaseUrl(input)).toThrow(message);
    });
  }
});

test.describe('Unit — URL joining keeps the base path', () => {
  const cases: ReadonlyArray<[base: string, path: string, expected: string]> = [
    ['https://site.com/', '/', 'https://site.com/'],
    ['https://site.com/', '/contact/', 'https://site.com/contact/'],
    ['https://site.com/staging/', '/contact/', 'https://site.com/staging/contact/'],
    ['https://site.com/staging/', 'contact/', 'https://site.com/staging/contact/'],
    ['https://site.com/staging', '/contact/', 'https://site.com/staging/contact/'],
    ['https://site.com/staging/', '/', 'https://site.com/staging/'],
    ['https://site.com/staging/', '/?s=revenue', 'https://site.com/staging/?s=revenue'],
    ['https://site.com/staging/', '/wp-json/wp/v2/posts', 'https://site.com/staging/wp-json/wp/v2/posts'],
    ['https://site.com/', 'https://other.com/x', 'https://other.com/x'],
  ];
  for (const [base, path, expected] of cases) {
    test(`${base} + ${path}`, () => {
      expect(joinUrl(base, path)).toBe(expected);
    });
  }
});

test.describe('Unit — Target resolution', () => {
  const site: AuditTarget = {
    id: 'demo',
    name: 'Demo',
    productionUrl: 'https://demo.example',
    platform: 'generic',
    pages: [{ name: 'Home', path: '/' }],
  };
  const registry = { demo: site };

  test('defaults to production and flags it', () => {
    const target = resolveTarget({ AUDIT_TARGET: 'demo' }, registry);

    expect(target.baseUrl).toBe('https://demo.example/');
    expect(target.isProduction).toBe(true);
  });

  test('BASE_URL overrides the URL and keeps its path', () => {
    const target = resolveTarget({ AUDIT_TARGET: 'demo', BASE_URL: 'https://staging.demo.example/copy' }, registry);

    expect(target.baseUrl).toBe('https://staging.demo.example/copy/');
    expect(target.isProduction).toBe(false);
  });

  test('a production URL spelled differently is still production', () => {
    expect(resolveTarget({ AUDIT_TARGET: 'demo', BASE_URL: 'https://DEMO.example' }, registry).isProduction).toBe(true);
  });

  test('rejects an unknown AUDIT_TARGET and names the valid ones', () => {
    expect(() => resolveTarget({ AUDIT_TARGET: 'nope' }, registry)).toThrow(/unknown; expected one of: demo/);
  });

  test('rejects an invalid BASE_URL', () => {
    expect(() => resolveTarget({ AUDIT_TARGET: 'demo', BASE_URL: 'demo.example' }, registry)).toThrow(ConfigError);
  });

  test('rejects a target without pages', () => {
    expect(() => resolveTarget({ AUDIT_TARGET: 'empty' }, { empty: { ...site, id: 'empty', pages: [] } })).toThrow(/no pages/);
  });

  test('the default registry resolves to the Uptic production site', () => {
    const target = resolveTarget({});

    expect(target.id).toBe('uptic');
    expect(target.platform).toBe('wordpress');
    expect(target.isProduction).toBe(true);
  });
});
