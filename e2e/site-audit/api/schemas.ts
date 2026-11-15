import { z } from 'zod';

/**
 * Contracts for the public WordPress REST API, as the suite relies on them. Objects are not
 * strict: WordPress and plugins add fields, and an extra field is not a breaking change. A missing
 * or mistyped field is. Unit tested in tests/unit/schemas.spec.ts.
 */

const rendered = z.object({ rendered: z.string() });

/** The subset of a `wp/v2/posts` item the suite relies on. */
export const postSchema = z.object({
  id: z.number().int().positive(),
  slug: z.string().min(1),
  status: z.literal('publish'),
  link: z.string().url(),
  date_gmt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/, 'expected an ISO date without zone, e.g. 2026-10-15T09:00:00'),
  title: rendered,
  excerpt: rendered,
});

export type Post = z.infer<typeof postSchema>;

export const postListSchema = z.array(postSchema);

/** Fields requested with `_fields` so list calls stay small; covers everything postSchema reads. */
export const POST_FIELDS = 'id,slug,status,link,date_gmt,title,excerpt';

/** Every REST error: `{ code, message, data: { status, params?, details? } }`. */
export const restErrorSchema = z.object({
  code: z.string().regex(/^[a-z0-9_]+$/, 'error codes are snake_case identifiers'),
  message: z.string().min(1),
  data: z
    .object({
      status: z.number().int().min(400).max(599),
      params: z.record(z.string(), z.string()).optional(),
      details: z.record(z.string(), z.object({ code: z.string(), message: z.string() }).passthrough()).optional(),
    })
    .passthrough(),
});

export type RestError = z.infer<typeof restErrorSchema>;

/** The `rest_invalid_param` variant names each rejected parameter. */
export const invalidParamSchema = restErrorSchema.extend({
  code: z.literal('rest_invalid_param'),
  data: restErrorSchema.shape.data.extend({ status: z.literal(400), params: z.record(z.string(), z.string()) }),
});

/** Pagination headers of a collection response: header values are strings holding integers. */
const paginationHeadersSchema = z.object({
  'x-wp-total': z.string().regex(/^\d+$/, 'expected an integer'),
  'x-wp-totalpages': z.string().regex(/^\d+$/, 'expected an integer'),
});

export interface Pagination {
  readonly total: number;
  readonly totalPages: number;
}

export function paginationOf(headers: Record<string, string>): Pagination {
  const parsed = parseContract(paginationHeadersSchema, headers, 'pagination headers');
  return { total: Number(parsed['x-wp-total']), totalPages: Number(parsed['x-wp-totalpages']) };
}

/** `Link: <url>; rel="next", <url>; rel="prev"` → `{ next: url, prev: url }`. */
export function parseLinkHeader(value: string | undefined): Record<string, string> {
  const links: Record<string, string> = {};
  for (const part of value?.split(',') ?? []) {
    const match = /<([^>]+)>\s*;\s*rel="([^"]+)"/.exec(part);
    if (match) links[match[2]] = match[1];
  }
  return links;
}

/** The REST index (`/wp-json/`): only the fields the security tests read. */
export const restIndexSchema = z.object({
  name: z.string(),
  namespaces: z.array(z.string()),
  routes: z.record(z.string(), z.unknown()),
});

/**
 * Parses `data` with `schema`. On mismatch throws one readable message listing each bad path
 * (`[0].date_gmt: expected an ISO date…`) instead of zod's raw issue array.
 */
export function parseContract<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, data: unknown, what: string): T {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  const issues = result.error.issues.map((issue) => `  ${formatPath(issue.path)}: ${issue.message}`);
  throw new Error(`${what} does not match its contract:\n${issues.join('\n')}`);
}

function formatPath(path: readonly (string | number)[]): string {
  if (path.length === 0) return '(root)';
  return path.map((part, i) => (typeof part === 'number' ? `[${part}]` : i === 0 ? part : `.${part}`)).join('');
}
