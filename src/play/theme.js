// The app's dark theme for code that draws on a canvas. The values live in play.css (:root), so CSS
// and canvas can never disagree.

const css = getComputedStyle(document.documentElement);
const read = (name) => css.getPropertyValue(name).trim();
const palette = (name) => [0, 1, 2, 3, 4, 5].map((tone) => read(`--${name}-${tone}`));

export const theme = {
  surfaceHigh: read('--surface-high'),
  surfaceMain: read('--surface-main'),
  surfaceLow: read('--surface-low'),
  surfaceLowest: read('--surface-lowest'),
  surfaceSunken: read('--surface-sunken'),
  contentPrimary: read('--content-primary'),
  contentSecondary: read('--content-secondary'),
  palettes: {
    red: palette('red'),
    purple: palette('purple'),
    blue: palette('blue'),
  },
  /** logicGameColors: blue, red, purple, teal, emerald, violet, orchid, lime, spring green, yellow. */
  logicColors: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => read(`--logic-${i}`)),
};

// SkeepTheme.asset's categoryAccentIndex: each game category paints with its own palette.
const CATEGORY_PALETTE = {
  puzzle: 'blue',
  arcade: 'red',
  ability: 'purple',
};

/** The six tones (0 = brightest) of a game category's accent palette. */
export function categoryPalette(category) {
  return theme.palettes[CATEGORY_PALETTE[category]] || theme.palettes.red;
}
