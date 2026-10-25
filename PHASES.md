# Roadster Rush — Development Phases

A Subway Surfers–style endless runner for mobile. You drive a flying roadster down a 3-lane highway, dodging traffic and collecting energy cells. It's built for the web and wrapped as an Android app.

> **Working title:** "Roadster Rush". A Play Store release needs an original name and a car that's *inspired by* the Tesla Roadster, not a copy, with no Tesla branding. App stores reject unlicensed trademarks.

## Tech stack

| Part | Tool |
|---|---|
| Language | TypeScript |
| 3D rendering | Three.js |
| Build / dev server | Vite |
| Font | Luckiest Guy (bundled locally, works offline) |
| Android / iOS app | Capacitor (Phase 7) |

## Running the project

```bash
npm install
npm run dev              # dev server; open the "Network" URL on a phone on the same Wi-Fi
npm run build            # production build into dist/
npm run check:patterns   # verify every obstacle pattern can be beaten
```

- Add `?debug` to the URL to show FPS, draw calls and quality level.
- In dev builds, the game object is available as `window.game` for testing.

## Status overview

| # | Phase | Status |
|---|---|---|
| 1 | Core prototype | ✅ Done |
| 2 | Look & feel | ✅ Done |
| 3 | Content | ✅ Done |
| 4 | UI & menus | ✅ Done |
| 5 | Audio & polish | ✅ Done |
| 6 | Meta progression | ✅ Done |
| 7 | Android release | ⏳ Next |

---

## Phase 1: Core prototype ✅

**Goal:** a playable loop with placeholder shapes.

- Endless 3-lane highway with scrolling road, buildings and street lamps
- Swipe controls that fire while the finger is still moving, with input buffering
  - ← → change lane
  - ↑ thruster hop: four white vapor jets blast down from under the car, and it barrel-rolls a full turn in the air, left side down first (tune with `JUMP_SPIN_TIME` in `src/config.ts`)
  - ↓ duck (fast-fall when airborne)
- Keyboard controls for desktop: arrows/WASD, Space, Enter
- Obstacles:
  - Cars: hop or dodge
  - Trucks: dodge
  - Barriers: hop
  - Overhead signs: duck
- Speed ramps from 18 to 42 m/s
- Crash, score, and best score saved on the device
- Object pooling, frame-rate-independent movement, and a field of view that adapts to portrait screens

## Phase 2: Look & feel ✅

**Goal:** make it look and feel like a polished cartoon runner.

- **Curved-world shader**: the road bends over the horizon. Tune it with `CURVE_STRENGTH` in `src/config.ts`.
- **Shading:** toon shading with three light bands, a rim light on vehicles, cartoon outlines, a gradient sky with a sun glow, and fog.
- **Instanced scenery:**
  - Buildings with windows
  - Billboards, low-poly trees, bushes, lamps and cones
  - Red-white curbs and paved sidewalks
- **Road wear:** wheel tracks, patches and manhole covers.
- **New placeholder roadster:**
  - Curved body and glass canopy
  - Rims and taillight bar
  - Glowing thruster nozzles
- **Effects:**
  - Thruster flames
  - Landing dust and lane-change smoke
  - Crash sparks and debris
  - Speed lines
- **Game feel:** landing squash and camera dip; on crash, slow motion, camera zoom and shake.
- **UI:** cartoon font, animated logo and buttons, screen fades, and a score pop.
- **Auto quality:** steps down resolution, then outlines and particles, if FPS drops below about 48.
- **Defaults chosen:** sunny day, red car, outlines on vehicles.

## Phase 3: Content ✅

**Goal:** everything that makes it a real game.

- **Energy cells:** auto-placed along the solved safe path of each obstacle pattern.
  - They arc over hops and climb carrier ramps.
  - Per-run count and lifetime total are saved.
- **Power-ups**, with timers bottom-left like Subway Surfers:

  | Power-up | Duration | Effect |
  |---|---|---|
  | 🚀 Flight Mode | 8 s | Fly at 6 m over traffic, collecting a sky trail of cells. The landing zone is cleared, and the car blinks before landing. |
  | 🧲 Magnet | 10 s | Pulls cells in from all lanes. |
  | ×2 Multiplier | 15 s | Double score. |
  | 🛡 Shield | Until hit | Absorbs one hit and knocks the obstacle away. |
  | 💨 Nitro | 5 s | 1.6× speed; smash through traffic. |

- **Car carriers:** drive up the ramp and ride on the deck, like the train roofs in Subway Surfers.
- **Moving traffic,** plus **lane-changing cars** that flash a blinker first.
- **26 hand-designed obstacle patterns** in 4 difficulty tiers, randomly mirrored.
  - A solver proves every pattern can be beaten; run `npm run check:patterns`.
- **Collisions:**
  - Head-on hit: crash
  - Clipped from the side: stumble
  - Landing on top of a vehicle: bounce
- **Classic police car chaser:**
  - A stumble starts a 10-second chase.
  - A second stumble during the chase ends the run with "BUSTED!", and the police car pulls up alongside you.
- **Near-miss bonus:** +50 for dodging traffic at the last moment.
- **Game-over screen:** score, cells collected, best score.

---

## Phase 4: UI & menus ✅

**Goal:** a complete, app-like flow around the gameplay.

- **Pause:**
  - Pause button top-left, or Esc / P on a keyboard.
  - Resuming runs a 3-2-1 countdown first.
  - The game auto-pauses when the app goes to the background or the window loses focus.
- **Settings screen** (from the title screen or the pause menu), saved on the device:
  - Music and sound effect volume
  - Vibration on/off
  - Graphics quality: Auto (steps down if FPS drops), High, or Low
  - Tutorial on/off
- **First-run tutorial:** an easy stretch of road with one obstacle per move: swipe left, right, up (hop) and down (duck).
  - As each obstacle gets close, time eases to a stop and an animated prompt shows the swipe to make. Only that swipe is accepted, so the player can't fail.
  - It switches itself off once finished. Turn it back on in Settings to replay it.
- **Title screen:** tap anywhere to start, lifetime cells shown top-left, a settings button, and a Garage button marked "SOON" (Phase 6).
- **Game-over screen:**
  - The score counts up.
  - Breakdown: distance, near misses, the ×2 bonus, and cells.
  - On a new best: a "NEW BEST!" banner and confetti.
  - **Play Again** and **Home** buttons; Enter also restarts.
- **Revive:** a "Continue?" prompt with a 5-second draining ring. Continuing clears the road ahead, sends the police away, and resumes after a 3-2-1 countdown. (Phase 6 added the price: cells or a rewarded ad.)
- **Quitting** to Home from the pause menu still banks the run's cells and best score.
- **Layout:** safe-area and notch handling on every edge, plus a landscape layout for short screens, where the game-over panel and buttons sit side by side.

## Phase 5: Audio & polish ✅

**Goal:** sound and the final hero look.

- **Audio:** every sound and both music tracks are synthesized at runtime with the Web Audio API (`src/audio/`). There are no audio files to download or license, and it all works offline. Howler.js isn't needed until real recorded sounds replace the synthesized ones.
  - Audio starts on the first tap or key press (browsers require this), stops while the app is in the background, and the music is turned down in the pause menu.
  - The Music and Sound FX sliders in Settings control the volumes.
- **Music:**
  - Run track: an upbeat 128 BPM loop (Am–F–C–G) that builds over 16 bars: drums and bass, then arpeggio, then pads and claps.
  - Menu track: a calmer 92 BPM loop with soft pads and a plucked arpeggio. Plays on the title and game-over screens.
  - Tracks crossfade; the music cuts out on a crash.
- **Sound effects:**
  - Electric motor whine whose pitch follows speed, and goes higher on nitro
  - Thruster whoosh, landing thud, lane-change swoosh, near-miss swoosh
  - Cell chime that climbs a pentatonic scale during a streak
  - Power-up pickup and expiry sounds, shield break, nitro smash
  - Police siren (a classic wail) while the police are chasing or arresting you
  - Stumble and crash
  - UI clicks, 3-2-1 countdown beeps, tutorial prompt cue, new-best fanfare
- **Haptics:** through Capacitor Haptics, which uses native haptics on Android and `navigator.vibrate` in the browser. Light, medium and heavy impacts for power-ups, stumbles and hits, a long buzz for a crash, and a success pattern for a new best. The Vibration setting turns them all off.
- **Hero car model:** a new procedural low-poly roadster (`src/player/roadsterModel.ts`) *inspired by* the Tesla Roadster, with no branding.
  - Long sloping nose, slim split headlights, wide rear haunches and a wraparound tinted canopy.
  - A full-width rear light bar, a rear diffuser, and five-spoke aero rims.
  - It costs one fewer draw call than the old car.
  - A model from Blender or a commissioned artist can still replace it later.
- **Extra environments** that rotate during a run: city → desert highway → "Mars" → city, switching every ~1200 m with a smooth blend of sky, fog and ground. New roadside props drive in from the horizon, and the zone name pops up on entry. Every run (and the title screen) starts in the city.
- **Tuning pass:**
  - Speed now eases toward its maximum instead of climbing in a straight line: about 30 m/s after 1 minute, 36 after 2 and 39 after 3, instead of hitting the 42 m/s cap at 80 seconds. Hard patterns arrive later, so early runs last longer.
  - Power-up frequency and camera feel were left as they were. They need playtesting on a real phone.
- **Not done (optional):** replacing the placeholder traffic with a CC0 art pack (Kenney or Quaternius) or commissioned art.

## Phase 6: Meta progression ✅

**Goal:** reasons to keep playing.

- **Save file:** all progress lives in one saved profile (`src/meta/Profile.ts`). Best scores and cells from earlier versions carry over. Energy cells are now a currency you spend.
- **Garage** (from the title screen): the camera slowly circles the parked car while you shop in a sheet at the bottom (a side panel in landscape). Tapping an item previews it on the car; leaving without buying puts the equipped look back.
  - **Paints:** 8 colors, 500–2,000 cells each. Rocket Red is free.
  - **Skins:** racing stripes and two-tone (3,000), hot flames (4,500), neon glow with underglow (5,000), chrome (6,500), solid gold (8,000). Skins combine with the paint, except chrome and gold, which replace it.
  - Skins recolor the body triangle by triangle, so they cost no extra draw calls.
- **Upgrades** (a Garage tab): 5 levels per power-up at 500 / 1,000 / 2,000 / 4,000 / 8,000 cells.
  - Flight 8 → 13 s, Magnet 10 → 20 s, ×2 15 → 25 s, Nitro 5 → 9 s.
  - Shield: each level makes shields 30% more common, and level 5 starts every run with one.
- **Missions:** three at a time, drawn from a pool of 25 (`src/meta/missions.ts`). Some count across runs ("Drive 3,000 m"), others must be done in a single run ("3 near misses in one run").
  - Each pays cells, with a toast mid-run when it's done.
  - Finishing all three raises the permanent **score multiplier** by 1 (up to ×30) and deals a new set. Targets grow 20% per multiplier level.
  - Unfinished missions are swapped for new ones each day.
  - The multiplier shows on the title screen and in the HUD, where it pulses while the ×2 power-up doubles it. The game-over breakdown shows it as "multiplier bonus".
- **Daily reward streak:** a 7-day calendar that pops up on the first visit each day: 100, 200, 300, 500, 750, 1,000, then 2,500 on day 7. Missing a day restarts at day 1.
- **Trophies:** 21 achievements (`src/meta/achievements.ts`), worth 250 cells each, with a toast when unlocked and a list screen. Examples: score 10,000 in one run, reach Mars, escape the police 10 times, own every paint, a 7-day streak.
- **Revive:** now costs cells, 500 the first time in a run and doubling after that. Alternatively, watch a rewarded ad (once per run). If neither is possible, the run goes straight to game over. The timer pauses while an ad plays.
- **Game over:** a "Watch ad: ×2 cells" button doubles the cells from the run.
- **Store services** (`src/services/platform.ts`): one layer for rewarded ads, the leaderboard and achievements. Revive, the ×2 cells offer, best scores and achievement unlocks already call it.
  - On the web it does nothing. Dev builds (or `?ads` in the URL) show a 3-second placeholder ad so the flows can be tested.
  - Phase 7 connects AdMob and Google Play Games Services.
- **Monetization decision:** rewarded ads only, for revive and ×2 cells. There are no forced ads and no in-app purchases at launch.
- **Economy estimate:** a run that reaches about 30 m/s offers roughly 0.15 cells per meter, so a typical 2-minute run should earn around 200–250 cells. That makes a mid-price paint 3–5 runs and a skin 15–35 runs, before mission and daily rewards. Prices are in `src/meta/catalog.ts` and should be tuned after real playtesting.

## Extras (added after Phase 6)

- **Hop tricks:** swiping up fires four white vapor jets from under the car, and the car barrel-rolls a full turn in the air. Flight Mode and Nitro use the same white vapor instead of flames.
- **Police helicopter:** at random times (first after 45–75 s of play, then every 55–95 s) a police helicopter swoops in ahead of the car and makes three attack runs. Each one locks onto your lane: a red strip flashes up the lane for about 1.1 s with a lock-on beep, then the guns rake it. Swipe left or right to get out of the way; a dodged volley scores +100 (× multiplier). Getting hit is a crash (a Shield absorbs it).
  - **Always escapable:** when the helicopter is called, the level generator keeps a stretch of road completely empty, counted from beyond where any moving traffic already on the road could drift. The helicopter only fires inside that stretch, and skips a volley that wouldn't fit in what's left of it. There's always a free lane to swerve into, and a weaving line of cells to collect.
  - It doesn't come during the tutorial or Flight Mode, and it leaves when you crash or revive.
  - Tuning: `HELI_FIRST` and `HELI_EVERY` in `src/config.ts`; volley count and timings at the top of `src/chaser/Helicopter.ts`.

## Phase 7: Android release 🔲

**Goal:** publish on Google Play.

- **Capacitor setup:**
  - Add the Android project and bundle the game files so it works offline.
  - Set portrait lock, full-screen and immersive mode.
- **App assets:** app icon, adaptive icon and splash screen.
- **Performance pass on low-end Android devices:**
  - Check the auto-quality thresholds
  - Check memory use
  - Check load time
- **Build:** a signed release `.aab` from Android Studio.
- **Play Console:**
  - Developer account (one-time $25)
  - Store listing (screenshots, description, feature graphic)
  - Privacy policy page
  - Content rating questionnaire
  - Data safety form
- **Closed testing:** new personal accounts need about 12 testers for 14 days before a production release.
- **Production release.**
- **Later:** an iOS build with the same code; requires a Mac and an Apple Developer account ($99/year).

---

## Project layout

```
src/
├── main.ts              entry point
├── config.ts            all tuning numbers (speeds, jump, curve, etc.)
├── game/                game loop, input, power-ups, settings, tutorial, auto quality
├── level/               obstacle patterns, solver, level generator
├── obstacles/           obstacle manager and vehicle models
├── pickups/             energy cells and power-up badges
├── player/              the roadster: controls, physics, visuals
├── chaser/              police car and police helicopter
├── audio/               synthesized music and sound effects
├── meta/                profile, shop catalog, missions, achievements, daily streak
├── services/            ads, leaderboard and achievements (stubs until Phase 7)
├── world/               road and roadside scenery
├── render/              curved-world shader, toon materials, outlines, sky
├── fx/                  particles, speed lines, effects
└── ui/                  HUD, menus, settings, garage, missions/trophies panels, debug overlay
scripts/
└── check-patterns.ts    proves every obstacle pattern can be beaten
```
