import { apiTest as test, expect } from '../../fixtures';

const REQUIRED_HEADERS: readonly { name: string; ok: (headers: Record<string, string>) => boolean }[] = [
  { name: 'Strict-Transport-Security', ok: (h) => /max-age=\d+/.test(h['strict-transport-security'] ?? '') },
  { name: 'X-Content-Type-Options: nosniff', ok: (h) => h['x-content-type-options'] === 'nosniff' },
  {
    name: 'framing protection (X-Frame-Options or CSP frame-ancestors)',
    ok: (h) => Boolean(h['x-frame-options']) || /frame-ancestors/.test(h['content-security-policy'] ?? ''),
  },
];

test.describe('API — Security', () => {
  test('REST API does not list user accounts publicly', async ({ wpApi }) => {
    test.fail(true, 'Known site defect — FINDINGS #17: /wp-json/wp/v2/users exposes login slugs');

    const response = await wpApi.usersResponse();

    const users = response.ok() ? ((await response.json()) as unknown[]) : [];
    expect(users, `${users.length} user(s) exposed`).toEqual([]);
  });

  test('home page sends the baseline security headers', async ({ request }) => {
    test.fail(true, 'Known site defect — FINDINGS #18: no HSTS, nosniff or framing protection');

    const response = await request.get('/');
    const headers = response.headers();

    const missing = REQUIRED_HEADERS.filter((header) => !header.ok(headers)).map((header) => header.name);
    expect(missing, `missing: ${missing.join(', ')}`).toEqual([]);
  });
});
