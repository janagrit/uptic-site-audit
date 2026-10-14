import type { Request } from '@playwright/test';

// Server endpoints the site writes to. Tests intercept these instead of hitting production.
export const ADMIN_POST = '**/wp-admin/admin-post.php';
export const ADMIN_AJAX = '**/wp-admin/admin-ajax.php';

/** Every endpoint that changes state on the live site (form handlers, comments, XML-RPC). */
export const WRITE_ENDPOINTS: readonly string[] = [
  ADMIN_POST,
  ADMIN_AJAX,
  '**/wp-comments-post.php',
  '**/xmlrpc.php',
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
