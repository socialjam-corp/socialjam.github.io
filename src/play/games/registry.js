// The games the lite feed can serve. Each module is loaded only when the feed first needs it.
//
// A game module's default export:
//   text            { ca|en|es: { title, description, descriptionSp, ... } }  How to play: the game's
//                   GAME_TITLE, GAME_DESCRIPTION ("/" splits it into capsules) and GAME_DESCRIPTION_SP;
//                   anything else the game needs (its start hint, its own feedback words)
//   levels()        Promise of { tutorial, easy, medium, hard }: arrays of levels, each with an `id`
//   create(host)    one game for one panel (see shell/panel.js for the host and the game hooks)
//
// category picks the accent palette, as in the app (theme.js), confirmed by each game's catalog
// art (SkeepGames/<Game>/Catalog/banner.webp).

export const GAMES = [
  { id: 'amunt', category: 'ability', load: () => import('./amunt/index.js') },
  { id: 'embus', category: 'puzzle', load: () => import('./embus/index.js') },
  { id: 'skeepkaku', category: 'puzzle', load: () => import('./skeepkaku/index.js') },
  { id: 'zzznake', category: 'arcade', load: () => import('./zzznake/index.js') },
];

/** N19: the first panel is always this game, so the very first thing a visitor sees is light. */
export const FIRST_GAME = 'amunt';
