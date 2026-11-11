// The games the lite feed can serve. Each module is loaded only when the feed first needs it.
//
// A game module's default export:
//   text            { ca|en|es: { title, description, descriptionSp } }  How to play: the game's
//                   GAME_TITLE, GAME_DESCRIPTION ("/" splits it into capsules) and GAME_DESCRIPTION_SP
//   levels()        Promise of { tutorial, easy, medium, hard }: arrays of levels, each with an `id`
//   create(host)    one game for one panel (see shell/panel.js for the host and the game hooks)
//
// category picks the accent palette, as in the app (theme.js).

export const GAMES = [
  // Placeholders that exercise the feed until the real games land. Three of them, so N12 (never
  // the same game twice in a row) still leaves a choice.
  { id: 'test_a', category: 'puzzle', load: () => import('./test/index.js') },
  { id: 'test_b', category: 'arcade', load: () => import('./test/index.js') },
  { id: 'test_c', category: 'ability', load: () => import('./test/index.js') },
];

/** N19: the first panel is always this game, so the very first thing a visitor sees is light. */
export const FIRST_GAME = 'test_a';
