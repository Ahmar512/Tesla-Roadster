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
| 5 | Audio & polish | ⏳ Next |
| 6 | Meta progression | 🔲 Planned |
| 7 | Android release | 🔲 Planned |

---

## Phase 1: Core prototype ✅

**Goal:** a playable loop with placeholder shapes.

- Endless 3-lane highway with scrolling road, buildings and street lamps
- Swipe controls that fire while the finger is still moving, with input buffering
  - ← → change lane
  - ↑ thruster hop
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
  - Music and sound effect volume (stored now; audio arrives in Phase 5)
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
- **Revive (UI only):** once per run, a "Continue?" prompt with a 5-second draining ring. Continuing clears the road ahead, sends the police away, and resumes after a 3-2-1 countdown. It's free for now; cells or a rewarded ad come in Phase 6.
- **Quitting** to Home from the pause menu still banks the run's cells and best score.
- **Layout:** safe-area and notch handling on every edge, plus a landscape layout for short screens, where the game-over panel and buttons sit side by side.

## Phase 5: Audio & polish 🔲

**Goal:** sound and the final hero look.

- **Audio:** Howler.js, with all sound files bundled for offline play.
- **Music:**
  - An upbeat looping track during play
  - A calmer track on the menu
- **Sound effects:**
  - Electric motor hum that rises with speed
  - Thruster whoosh and landing thud
  - Cell chime, with pitch that climbs during streaks
  - Power-up pickup and expiry sounds
  - Police siren
  - Crash
  - UI clicks
- **Haptics** via Capacitor Haptics on Android.
- **Hero car model:** a custom low-poly roadster inspired by the Tesla Roadster, from Blender or a commissioned artist, replacing the placeholder.
- **Optional art upgrade:** replace placeholder traffic with a CC0 low-poly pack (Kenney or Quaternius) or commissioned art.
- **Extra environments** that rotate during a run: city → desert highway → "Mars" (a nod to SpaceX).
- **Final tuning pass:** difficulty curve, power-up frequency, and camera feel.

## Phase 6: Meta progression 🔲

**Goal:** reasons to keep playing.

- **Garage:**
  - Paint colors and skins bought with energy cells
  - A preview of the car on a turntable
- **Upgrades:** longer durations for each power-up, in several levels per power-up.
- **Daily missions:** for example "collect 300 cells", "ride 5 carriers", "3 near misses in one run". They reward cells and a score multiplier.
- **Daily reward streak.**
- **Achievements.**
- **Leaderboards and achievements online** via Google Play Games Services.
- **Optional monetization:**
  - Rewarded ads (AdMob) for revive and bonus cells
  - In-app purchases (Google Play Billing) for cell packs or ad removal

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
├── chaser/              police car
├── world/               road and roadside scenery
├── render/              curved-world shader, toon materials, outlines, sky
├── fx/                  particles, speed lines, effects
└── ui/                  HUD, menus and settings screen, debug overlay
scripts/
└── check-patterns.ts    proves every obstacle pattern can be beaten
```
