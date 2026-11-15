import type { Request } from '@playwright/test';

// WordPress endpoints the site writes to. Tests intercept these (route globs) instead of hitting production.
export const ADMIN_POST = '**/wp-admin/admin-post.php';
export const ADMIN_AJAX = '**/wp-admin/admin-ajax.php';

/**
 * WordPress endpoints that can change state even on GET (an `admin-ajax.php?action=…` handler may
 * write). The write guard blocks every method to these paths, on any host, unless a test intercepts.
 * Unsafe methods (POST, PUT, PATCH, DELETE, …) to the site are blocked anyway, listed or not.
 */
export const WRITE_ENDPOINT_PATHS: readonly RegExp[] = [
  /\/wp-admin\/admin-post\.php$/,
  /\/wp-admin\/admin-ajax\.php$/,
  /\/wp-comments-post\.php$/,
  /\/xmlrpc\.php$/,
];

export const CONTACT_ACTION = 'uptic_inquiry';
export const ARTICLE_VIEW_ACTION = 'uptic_article_view';

/** Parses a urlencoded POST body; repeated keys such as `services[]` keep every value. */
export function formBody(request: Request): URLSearchParams {
  return new URLSearchParams(request.postData() ?? '');
}

export function isAction(request: Request, action: string): boolean {
  return request.method() === 'POST' && formBody(request).get('action') === action;
}
