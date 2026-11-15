import type { Locator, Page } from '@playwright/test';

/**
 * Generic accessibility probes (any website, no WordPress assumptions). The rules that judge what
 * the page returns are pure functions, unit tested in tests/unit/accessibility-rules.spec.ts; the
 * functions taking a Page only collect facts from the DOM.
 *
 * Bias: only flag what is certainly wrong. Whether an alt text *describes* its image, or an
 * `alt=""` image is really decorative, needs a human (docs/MANUAL-CHECKS.md).
 */

// ── Pure rules ──────────────────────────────────────────────────────────────────────────────────

const IMAGE_EXTENSION = /\.(png|jpe?g|gif|webp|avif|svg|bmp|tiff?)\b/i;
const PLACEHOLDER_ALT = /^(image|img|photo|picture|pic|graphic|logo|icon|banner|untitled|placeholder|thumbnail|spacer|(img|dsc|image|screenshot)[-_ ]?\d+)$/i;
export const MAX_ALT_LENGTH = 250;

/** Why a non-empty alt text cannot be meaningful, or null when it looks like a real description. */
export function altTextProblem(alt: string, src: string): string | null {
  const text = alt.trim();
  if (text === '') return null; // empty alt = decorative; judged by decorativeImageProblem
  if (IMAGE_EXTENSION.test(text)) return 'is a file name';
  if (PLACEHOLDER_ALT.test(text)) return 'is a placeholder word';
  const stem = src.split('/').pop()?.split('?')[0].replace(IMAGE_EXTENSION, '').toLowerCase();
  if (stem && stem.length > 3 && text.toLowerCase() === stem) return 'repeats the file name';
  if (text.length > MAX_ALT_LENGTH) return `is ${text.length} characters (over ${MAX_ALT_LENGTH}); use a caption or long description`;
  return null;
}

export interface ImageFacts {
  readonly src: string;
  /** null = no alt attribute at all. */
  readonly alt: string | null;
  readonly role: string | null;
  readonly ariaLabel: string | null;
  readonly title: string | null;
  /** Accessible text of the enclosing link or button (its text plus other images' alt), when there is one. */
  readonly controlText: string | null;
}

/** Contradictions in how an image is marked decorative; null when consistent. */
export function decorativeImageProblem(image: ImageFacts): string | null {
  const presentational = image.role === 'presentation' || image.role === 'none';
  if (presentational && image.alt !== null && image.alt.trim() !== '') return `role="${image.role}" but alt="${image.alt}"`;
  if (image.alt !== '') return null;
  if (image.ariaLabel) return `alt="" but aria-label="${image.ariaLabel}": decorative or not?`;
  if (image.title) return `alt="" but title="${image.title}": decorative or not?`;
  if (image.controlText !== null && image.controlText.trim() === '') return 'alt="" is the only content of a link or button, leaving it without a name';
  return null;
}

/** Skipped heading levels (`h2` → `h4`) and a first heading that is not `h1`. Levels in document order. */
export function headingOrderProblems(levels: readonly number[]): string[] {
  if (levels.length === 0) return ['page has no headings'];
  const problems: string[] = [];
  if (levels[0] !== 1) problems.push(`first heading is h${levels[0]}, not h1`);
  for (let i = 1; i < levels.length; i += 1) {
    if (levels[i] > levels[i - 1] + 1) problems.push(`h${levels[i - 1]} → h${levels[i]} skips a level (heading #${i + 1})`);
  }
  return problems;
}

export interface FocusStyle {
  readonly outlineStyle: string;
  readonly outlineWidth: string;
  readonly outlineColor: string;
  readonly boxShadow: string;
  readonly backgroundColor: string;
  readonly borderColor: string;
  readonly color: string;
  readonly textDecorationLine: string;
}

const TRANSPARENT = /^(transparent|rgba\(\s*\d+,\s*\d+,\s*\d+,\s*0\s*\))$/;

/** True when focus draws an outline, or changes how the element looks in another visible way. */
export function hasVisibleFocusIndicator(focused: FocusStyle, unfocused: FocusStyle): boolean {
  const outline = focused.outlineStyle !== 'none' && parseFloat(focused.outlineWidth) > 0 && !TRANSPARENT.test(focused.outlineColor);
  if (outline) return true;
  const changed: readonly (keyof FocusStyle)[] = ['boxShadow', 'backgroundColor', 'borderColor', 'color', 'textDecorationLine'];
  return changed.some((property) => focused[property] !== unfocused[property]);
}

// ── DOM probes ──────────────────────────────────────────────────────────────────────────────────

/** Rendered images not hidden from assistive technology. */
export async function imageFacts(page: Page): Promise<ImageFacts[]> {
  return page.locator('img').evaluateAll((images) =>
    images
      .filter((img) => {
        const box = img.getBoundingClientRect();
        return box.width > 0 && box.height > 0 && !img.closest('[aria-hidden="true"]');
      })
      .map((img) => {
        const control = img.closest('a, button');
        const otherAlt = control ? [...control.querySelectorAll('img[alt]')].map((i) => i.getAttribute('alt')).join(' ') : '';
        return {
          src: (img as HTMLImageElement).currentSrc || img.getAttribute('src') || '',
          alt: img.getAttribute('alt'),
          role: img.getAttribute('role'),
          ariaLabel: img.getAttribute('aria-label'),
          title: img.getAttribute('title'),
          controlText: control ? `${control.getAttribute('aria-label') ?? control.textContent} ${otherAlt}` : null,
        };
      }),
  );
}

/** Heading levels in document order, rendered headings only (hidden ones are not read out either). */
export async function headingLevels(page: Page): Promise<number[]> {
  return page.locator('h1, h2, h3, h4, h5, h6').evaluateAll((headings) =>
    headings
      .filter((h) => h.getClientRects().length > 0 && getComputedStyle(h).visibility !== 'hidden' && !h.closest('[aria-hidden="true"]'))
      .map((h) => Number(h.tagName[1])),
  );
}

export interface TabStop {
  readonly description: string;
  readonly inViewport: boolean;
  readonly focusIndicator: boolean;
}

/**
 * Presses Tab up to `maxStops` times and records each focused element: is it on screen, and does
 * focus visibly change it? Unfocused styles are read by blurring, then re-focusing, the element.
 */
export async function walkTabOrder(page: Page, maxStops: number): Promise<TabStop[]> {
  const stops: TabStop[] = [];
  for (let i = 0; i < maxStops; i += 1) {
    await page.keyboard.press('Tab');
    const stop = await page.evaluate(() => {
      const element = document.activeElement as HTMLElement | null;
      if (!element || element === document.body) return null;
      const read = (): FocusStyle => {
        const s = getComputedStyle(element);
        return {
          outlineStyle: s.outlineStyle,
          outlineWidth: s.outlineWidth,
          outlineColor: s.outlineColor,
          boxShadow: s.boxShadow,
          backgroundColor: s.backgroundColor,
          borderColor: s.borderColor,
          color: s.color,
          textDecorationLine: s.textDecorationLine,
        };
      };
      const focused = read();
      element.blur();
      const unfocused = read();
      element.focus({ preventScroll: true, focusVisible: true } as FocusOptions);
      const box = element.getBoundingClientRect();
      const label = (element.getAttribute('aria-label') ?? element.textContent).trim().replace(/\s+/g, ' ').slice(0, 40);
      return {
        description: `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''} "${label}"`,
        inViewport: box.bottom > 0 && box.right > 0 && box.top < innerHeight && box.left < innerWidth,
        focused,
        unfocused,
      };
    });
    if (stop === null) break; // focus left the document: end of the tab order
    stops.push({ description: stop.description, inViewport: stop.inViewport, focusIndicator: hasVisibleFocusIndicator(stop.focused, stop.unfocused) });
  }
  return stops;
}

/** Programmatic name of a form field: aria-label, aria-labelledby, or its <label>s. */
export async function fieldName(field: Locator): Promise<string> {
  return field.evaluate((el) => {
    const labelledBy = el.getAttribute('aria-labelledby');
    if (el.getAttribute('aria-label')) return el.getAttribute('aria-label')!.trim();
    if (labelledBy) return labelledBy.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' ').trim();
    // `labels` is null on hidden inputs, despite its DOM typing.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- the TS 7 DOM lib types it non-null
    const labels = (el as HTMLInputElement).labels as NodeListOf<HTMLLabelElement> | null;
    return [...(labels ?? [])].map((label) => label.textContent).join(' ').trim();
  });
}
