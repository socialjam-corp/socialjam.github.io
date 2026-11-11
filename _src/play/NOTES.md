# Skeep lite: working notes

The HTML/JS "lite" Skeep feed on `play.html`, for the Closed Beta campaign. This file records what
has already been worked out from the Unity project (`D:/Repos/Pimba`), so later work starts here
instead of re-reading it. `_src/` is not published (Jekyll skips folders starting with `_`).

## Scope (agreed)

- Single-player vertical feed only. No Versus/duels, FFA, Groups, Profile, Peeks, ads, sponsored
  panels, reactions, notifications, login, music, SFX, haptics, Unity builds.
- Games: **Amunt** (first panel), Embus, Skeepkaku, Zzznake, Collapse, Knives_Out.
- Levels: a game serves its Tutorial until it is won (a loss or skeep brings it back). Then the
  overall share is 30% Easy / 50% Medium / 20% Hard; Hard only right after that game's Medium.
  Implemented and verified in `src/play/feed/levels.js`.
- Skeepkaku: pre-generate puzzles to JSON with Embus's split (Tutorial 1, Easy 5, Medium 15, Hard 20).
- Collapse: redraw its white-silhouette sprite sheet as vector shapes; fallback is cropped WebP.
- Campaign reveal after 3 feed actions (finished matches and skeeps together). Not built yet.
- Dark theme only. `play.html` is `noindex`, reached only through shared links.
- Desktop: site nav, brand gradient, phone frame (to be revisited). Phones: fullscreen, no frame.

## Files

```
_src/pages/play.html, _src/strings/play.js   page + CA/EN/ES text (node _src/build.js)
src/play/play.css          all styles; the theme colours live here only (theme.js reads them)
src/play/main.js           boot
src/play/theme.js          colours for canvas code; categoryPalette(category)
src/play/storage.js        localStorage, always guarded
src/play/feed/feed.js      Active/Next, advances, AutoScroll bar, load fallback
src/play/feed/levels.js    level picker
src/play/feed/navigator.js swipe / wheel / ↓ key → skeep; other pointers → the Active game
src/play/shell/chrome.js   unit sizing, Skeep button signals, How to play card
src/play/shell/panel.js    one panel: canvas + HUD layer + result; hosts a game
src/play/shell/result.js   victory / defeat screen
src/play/features/         pieces shared by games (like Skeep.Features): background.js
src/play/games/registry.js game list, FIRST_GAME, category per game
src/play/games/<id>/       one folder per game: index.js (+ levels.json)
src/play/img/              app sprites, white, painted through CSS masks
```

## Tools (`_src/tools/`, Node 6)

| Command | Does |
|---|---|
| `node _src/tools/serve.js` | site on http://localhost:8731/ca/play |
| `node _src/tools/loc.js <GameId> "<keyRegex>"` | CA/EN/ES strings of a game (or `SkeepMain`) |
| `node _src/tools/levels.js <GameId> src/play/games/<id>` | writes `levels.json` from the level packs |
| `node _src/tools/sprite-slices.js <png path>` | slices of a sprite sheet as top-left rects |
| `node _src/tools/sprites.js <outDir>` | page on :8736 with `exportSprites([...])` to crop/scale/save sprites |

## App design spec (from the Unity UI code)

**Units.** Canvas reference 1080×1920, match 0.5: `u = sqrt(W/1080 · H/1920)` px. `chrome.layout()`
sets `--u`, `--header-h`, `--nav-h` on `#play-app`; CSS sizes are `calc(N * var(--u))`.

| Element | Spec | Source |
|---|---|---|
| Header | min(10% H, 144u); brand "skeep" L1 | `UISafeAreaScaffoldArgs.Standard`, `FeedShellHeaderChrome` |
| Nav band | min(16% H, 300u) + bottom safe area | same |
| Divider / AutoScroll bar | top of nav, 16u high, 64u side margins, radius 8u, content-secondary; fill accent-0 | `GameFeedNavigationDividerSpecs` |
| Skeep button | centred in nav, side = nav/3, circle content-primary, logo at 60/160 in surface-main | `GameScreen.ApplyNavCenterFabSize`, `SkeepBtn.prefab` |
| Button signals | Next ready: icon spins 0→180° 0.22s; not ready: icon fades to accent 0.18s and back. A tap does nothing (the app's radial menu is out) | `SkeepButton` |
| How to play | 64u circle contrast-primary, "?" 32u surface-main, at left 64u / 16u over the nav. Opens into a card: radius 32u, title H1 underlined, description split at "/" into capsules (content-secondary, radius 32u, pad 24u, L2), then GAME_DESCRIPTION_SP, ✕ at bottom; veil + "Pausa" (H1 ×2) | `SkeepGameUI` |
| Result | veil surface-main .95; 600u slot: laurel 600u + logo_big (170.9×209.8u, up 58u, accent, full, no fill animation) or skull 300u; title H1 up to 148u in accent; 3 s bar | `SkeepGameResultContentBuilder`, `SkeepGameResultOverlay` |
| Game background | vertical gradient surface-main → surface-lowest (`drawSceneBackground`, `invert` for Amunt) | `GameSceneGradientThemeBinding` |

**Text roles** (`SkeepTheme.asset`): H1 64u Sora Bold · H2 64u Medium · L1 32u Regular ·
L2 32u Medium · B1 32u Regular · B2 32u Medium · Feedback 75u Roboto Condensed Italic.

**Colours** are in `play.css` `:root`. User accent = red palette. Game category palettes:
puzzle → blue, arcade → red, ability → purple (`categoryAccentIndex`). The six games' categories
are in the production catalog only: **ask the user**; screenshots suggest Amunt purple, Zzznake red.

**Sprites in `src/play/img/`**: `logo.png` (skeep_white_logo), `logo-big.png` (skeep_logo_big),
`victory.webp` / `defeat.webp` (skeep_result_icons slices 2 and 3), `howto.png` / `cross.png`
(skeep_icons_6 / _4). Icon keys map to sprites in `Assets/Skeep/Settings/Media/SkeepUiIconDatabase.asset`.

## Feed rules kept (Docs/Feed/01-normes-del-feed.md)

N1 (Active + Next), N3/N26, N4, N6 (no blocks left except transient), N7/N7b (1 s pending skeep),
N8 (3 s post-match bar, paused by a finger, always advances), N12, N16/N22, N18, N19, N23, N14.
Swipes start in the nav band; from the game area only when the panel is not being played
(result shown for 0.5 s). Out: N2, N5, N9–N11, N13, N15, N17, N20, N24, N25, N27.

## Game module contract

Default export `{ text, levels(), create(host) }` (see `games/registry.js` and `shell/panel.js`).
`text[lang] = { title, description, descriptionSp }` from GAME_TITLE / GAME_DESCRIPTION /
GAME_DESCRIPTION_SP. The game builds its whole world in `load(level)`; `update(dt)`/`render()`
come from the feed's single tick; pointers only reach the Active panel; `host.finish(won)` ends it.

## Porting a game (checklist)

1. Ask the user for a screenshot or short capture of the game in the app.
2. `loc.js <GameId> "^GAME_"` for the text; `levels.js` for the packs.
3. Read only the gameplay files: the SceneManager partials that hold the rules and feedback,
   `<GameId>_LevelData.cs`, `Data/<GameId>_Config.asset`, pure-logic folders. Skip Versus/FFA
   partials, Registry, Editor, UI wiring.
4. Sprites, if any: `sprite-slices.js`, then `sprites.js` → `src/play/img/` or the game folder.
5. Register in `games/registry.js` with its category; add to `modulepreload` only if it is first.
6. Test with JS checks (state, sizes); one small screenshot for visual sign-off.

## Working practice (token budget)

- Start from this file; update it when something new is learned.
- Narrow reads: `grep -n` for the constant, `sed -n a,bp` for the function. No whole-file dumps.
- Edit with the Edit tool, not inline Node scripts (escaping breaks).
- Browser: reuse the one test window on the user's second screen (never close it); batch
  actions; prefer `javascript_tool` checks over screenshots; `zoom` on the frame at scale ≤ 0.8.
  A covered window drops to ~2 fps, which slows timed checks.
- Keep reports short: what changed, what was verified, the file list.
