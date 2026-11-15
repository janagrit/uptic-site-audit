import { unitTest as test, expect } from '../../fixtures';
import { altTextProblem, decorativeImageProblem, hasVisibleFocusIndicator, headingOrderProblems, type FocusStyle, type ImageFacts } from '../../audits/accessibility';

test.describe('Unit — Alt text rules', () => {
  const OK: ReadonlyArray<[alt: string, src: string]> = [
    ['A guest looking at a hotel website', 'https://site.example/uptic-digital-presence-768x768.webp'],
    ['Uptic Hospitality — home', 'https://site.example/Uptic_Logo_Light.png'],
    ['Tariq Khan', 'https://site.example/portrait.png'],
    ['', 'https://site.example/decorative.png'],
  ];
  for (const [alt, src] of OK) {
    test(`accepts alt="${alt}"`, () => {
      expect(altTextProblem(alt, src)).toBeNull();
    });
  }

  const BAD: ReadonlyArray<[alt: string, src: string, problem: RegExp]> = [
    ['Image_psot_6.png', 'https://site.example/Image_psot_6.png', /file name/],
    ['IMG_1234.JPG', 'https://site.example/IMG_1234.JPG', /file name/],
    ['image', 'https://site.example/a.png', /placeholder/],
    ['Photo', 'https://site.example/a.png', /placeholder/],
    ['DSC_0042', 'https://site.example/a.png', /placeholder/],
    ['hero-banner', 'https://site.example/hero-banner.webp?v=2', /repeats the file name/],
    ['x'.repeat(251), 'https://site.example/a.png', /251 characters/],
  ];
  for (const [alt, src, problem] of BAD) {
    test(`flags alt="${alt.slice(0, 20)}"`, () => {
      expect(altTextProblem(alt, src)).toMatch(problem);
    });
  }
});

test.describe('Unit — Decorative image rules', () => {
  const image = (overrides: Partial<ImageFacts>): ImageFacts => ({ src: 'a.png', alt: '', role: null, ariaLabel: null, title: null, controlText: null, ...overrides });

  test('empty alt next to link text is fine (card thumbnail)', () => {
    expect(decorativeImageProblem(image({ controlText: 'Revenue Strategy  ' }))).toBeNull();
  });

  test('empty alt as the only content of a link leaves the link unnamed', () => {
    expect(decorativeImageProblem(image({ controlText: '  ' }))).toMatch(/without a name/);
  });

  test('empty alt with an aria-label or title contradicts itself', () => {
    expect(decorativeImageProblem(image({ ariaLabel: 'Team photo' }))).toMatch(/aria-label/);
    expect(decorativeImageProblem(image({ title: 'Team photo' }))).toMatch(/title/);
  });

  test('role="presentation" with a non-empty alt contradicts itself', () => {
    expect(decorativeImageProblem(image({ role: 'presentation', alt: 'Team photo' }))).toMatch(/role="presentation"/);
  });

  test('an image with real alt text is not judged here', () => {
    expect(decorativeImageProblem(image({ alt: 'Team photo', title: 'Team' }))).toBeNull();
  });
});

test.describe('Unit — Heading order rules', () => {
  test('accepts a well-formed outline, including climbing back up', () => {
    expect(headingOrderProblems([1, 2, 3, 3, 4, 2, 3, 2])).toEqual([]);
  });

  test('flags a skipped level', () => {
    expect(headingOrderProblems([1, 2, 4])).toEqual(['h2 → h4 skips a level (heading #3)']);
  });

  test('flags a first heading that is not h1', () => {
    expect(headingOrderProblems([2, 3])).toEqual(['first heading is h2, not h1']);
  });

  test('flags a page without headings', () => {
    expect(headingOrderProblems([])).toEqual(['page has no headings']);
  });
});

test.describe('Unit — Focus indicator rules', () => {
  const style = (overrides: Partial<FocusStyle>): FocusStyle => ({
    outlineStyle: 'none',
    outlineWidth: '0px',
    outlineColor: 'rgb(0, 0, 0)',
    boxShadow: 'none',
    backgroundColor: 'rgba(0, 0, 0, 0)',
    borderColor: 'rgb(0, 0, 0)',
    color: 'rgb(0, 0, 0)',
    textDecorationLine: 'none',
    ...overrides,
  });

  test('a solid outline counts', () => {
    expect(hasVisibleFocusIndicator(style({ outlineStyle: 'solid', outlineWidth: '1px' }), style({}))).toBe(true);
  });

  test('outline: none with a 3px width does not count (the article search field)', () => {
    expect(hasVisibleFocusIndicator(style({ outlineWidth: '3px', outlineColor: 'rgb(31, 58, 46)' }), style({ outlineWidth: '3px' }))).toBe(false);
  });

  test('a transparent outline does not count', () => {
    expect(hasVisibleFocusIndicator(style({ outlineStyle: 'solid', outlineWidth: '2px', outlineColor: 'rgba(0, 0, 0, 0)' }), style({}))).toBe(false);
  });

  test('a focus-only box shadow, border or background change counts', () => {
    expect(hasVisibleFocusIndicator(style({ boxShadow: 'rgb(0, 0, 255) 0px 0px 0px 3px' }), style({}))).toBe(true);
    expect(hasVisibleFocusIndicator(style({ borderColor: 'rgb(0, 0, 255)' }), style({}))).toBe(true);
    expect(hasVisibleFocusIndicator(style({ backgroundColor: 'rgb(255, 255, 0)' }), style({}))).toBe(true);
  });
});
