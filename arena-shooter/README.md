# Neon Arena — 3D Arena Shooter

A self-contained, browser-based first-person shooter built with [Three.js](https://threejs.org/).
Fight a computer-controlled combat bot in an enclosed neon arena — first to win 3 rounds takes the match.

No build step or dependencies to install: Three.js is loaded from the jsDelivr CDN via an import map.

## Run it

ES modules can't be loaded from `file://`, so serve the folder over HTTP:

```bash
cd arena-shooter
python3 -m http.server 8000
# or: npx serve .
```

Then open <http://localhost:8000>.

## Controls

| Key | Action |
| --- | --- |
| `↑` / `↓` | Move forward / back |
| `←` / `→` | Turn left / right |
| `Space` | Shoot (hold for automatic fire) |
| `A` / `D` | Strafe (optional) |
| `P` / `Esc` | Pause |
| `Enter` | Start / restart match |

## Features

- Enclosed arena with cover obstacles, neon trim, shadows, fog and bloom post-processing.
- AI opponent that hunts you with A* pathfinding, strafes while engaging, leads its shots,
  and retreats to cover when its health is low. Three difficulty levels.
- Projectile-based hit detection against obstacles and both combatants.
- HUD with health bars, round/score, crosshair, hit markers, damage direction indicator and minimap.
- Start screen with controls, round countdowns, victory/defeat screen with match stats, and restart.
- Synthesized sound effects via the Web Audio API (no asset files).

## Files

- `index.html` — markup for the canvas, HUD and overlay screens; import map for Three.js.
- `style.css` — HUD and menu styling.
- `main.js` — game: scene, collision, navigation, bot AI, bullets, effects, game flow.
