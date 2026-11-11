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
| `node _src/tools/sprites.js <outDir> [port]` | page with `exportSprites([...])` to crop/scale/save sprites |
| `node _src/tools/fbx.js <fbx path>` | vertices and polygons of a binary FBX (Zzznake's snake came from it) |
| `node _src/tools/skeepkaku.js [seed]` | writes Skeepkaku's 41 puzzles to `src/play/games/skeepkaku/levels.json` |

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
| Game background | only scenes with a `GameSceneGradientBackground` (Amunt, Zzznake) get the gradient surface-main → surface-lowest (`drawSceneBackground`, `invert` for Amunt); the others are plain surface-main (`drawPlainBackground`) | `GameSceneGradientThemeBinding`, `PaintCameraBackground` |
| End of a match | `host.finish(won)` decides it; the game keeps updating for 0.5 s, then the result shows. A skeep in between still counts the result | `SinglePlayerPreResultPresentationDelaySeconds` |

**Text roles** (`SkeepTheme.asset`): H1 64u Sora Bold · H2 64u Medium · L1 32u Regular ·
L2 32u Medium · B1 32u Regular · B2 32u Medium · Feedback 75u Roboto Condensed Italic.

**Colours** are in `play.css` `:root`. User accent = red palette. Game category palettes:
puzzle → blue, arcade → red, ability → purple (`categoryAccentIndex`). The six games' categories
are confirmed by their catalog art (`SkeepGames/<Game>/Catalog/banner.webp`): Embus and Skeepkaku
blue (puzzle), Zzznake and Collapse red (arcade), Knives_Out and Amunt purple (ability).

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

## Shared in-game pieces (learned on Amunt)

- **Feedback texts and start hint** are shell features (`shell/feedback.js`), reached through the
  host: `host.feedback(text, x, y, color, motion)`, `host.showStartHint(text, place?)` (call in `start()`; `place` = `() => ({ y, align })` keeps it clear of the board: above it for boards, under the score capsule for Amunt),
  `host.dismissStartHint()` (on the game's first real move). Motions are `GameFeedbackMotion`
  values in units (default: lift 14, drift 108/s, hold 0.75, dissolve 0.45, tilt 15–45° by screen
  side). Font: Roboto Condensed Italic 75u with the theme's shadow. The shared words
  (Perfect, Good 1–3, Alert 1–3, Miss) are in `host.strings`; a game's own words go in its `text`.
- **HUD capsule** (`GameCounterHud`): `.hud-capsule` in `host.hud`.
- **3D scenes with an orthographic camera**: `SkeepCameraScaffoldBoundsFit` fits the scene's
  `CameraBounds` box to the content width, so pixels per world unit = content width / bounds width,
  and the bounds' centre sits at the centre of the content area. Draw boxes with three faces;
  measured shading on the app: front-left 1.0, front-right 0.89, top 0.77, faint white edges.
- **Tone cycling** up a structure: `PingPongColorIndex` (0→5→0).
- **2D boards** (Embus): the scene's CameraBounds is usually 6 units wide and fitted to the content
  width, so a board of N world units takes N/6 of the width, centred in the content area. Rounded
  pieces use the theme's `roundedR16` (≈ 0.24 of a cell at Embus's scale); held pieces get the
  `frameR16` outline in content-primary. Default feedback colour = category tone 2.
- **Logic boards** (Skeepkaku, and Skeepdoku/Skeepoodle-style games): `features/celebration.js`
  (SkeepBoardCelebration: cell flashes and block pops in wave/radial/scatter order) and
  `features/confetti.js` (the 2D win confetti, palette tones 0–3). Theme sprites at 300 px/unit:
  roundedR8 radius 27 px, roundedR16 51 px. `theme.logicColors` = logicGameColors.
  The result timing for these games is SolvedCelebrationSeconds (pop + celebration + extra) from
  the solving move: call `host.finish` that long minus the shell's 0.5 s.
- **Skeepkaku puzzles** are pre-generated: `node _src/tools/skeepkaku.js [seed]` (the app's
  generator, uniqueness solver and logic solver, ported; masks as two 32-bit halves).
- **Zzznake**: camera fits its 8 × 4 × 4 CameraBounds to the width (1 unit = width/8), aligned to
  the content's bottom, then follows the head. Shading measured on the app: top 1.0, −z side 0.89,
  +x side 0.72 (`shade(n)`); the path is `#eaeaea`; shadows drop down and toward +x, clipped to the
  block tops. Its pickups need the player to take branch detours sometimes (as in the app); a
  test autopilot that never leaves the main path can stall on the last cube.
- **Verify a port with a script**: import the module in the page, drive it with a fake host, and
  for puzzles solve every level (Embus: BFS over all 41 boards) before looking at it.

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
