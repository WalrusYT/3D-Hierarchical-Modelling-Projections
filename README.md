# 3D Hierarchical Modelling & Projections — Tank Scene (WebGL)

A WebGL 2.0 project focused on **hierarchical modelling**, **scene graphs**, and **camera/projection systems**.  
The scene features an articulated tank built from primitives, multiple view modes, and an extra gameplay feature: **“Tomato Strike”** (shooting projectiles into a dynamic hole with scoring + persistence).

This project was developed during the **1st semester of the 2025/2026 academic year** as part of the  
**Computer Graphics and Interfaces** course (NOVA School of Science and Technology — FCT, Lisbon).

**Final grade:** 18.7 / 20  
**Report date:** November 11, 2025

---

## 👥 Team

- **Ilia Taitsel** (67258)  
- Oleksandra Kozlova (68739)

---

## 🎯 Project Goals

- Build a **hierarchical 3D model** using a **scene graph** (local transforms with inheritance).
- Implement **multiple camera views** and **projection types** (orthographic, perspective, axonometric, oblique).
- Support real-time interaction: movement, rotations, zoom, and rendering mode.
- Add an extra interactive feature (game mechanic + HUD + persistence).

---

## 🧱 Hierarchical Modelling (Scene Graph)

The tank is defined as a hierarchy (root → base → cabin → cannon base → cannon, plus wheel subtrees).  
Global transforms applied to the root node affect all children (e.g., tank translation drives wheel rotation).

Some nodes use `inheritScale = false` (scale compensation) to prevent unintended scaling propagation from parents.

---

## 🎮 Controls

### Views
- `1` — Front view  
- `2` — Left view  
- `3` — Top view  
- `4` — Fourth view (projection playground)  
- `0` — Toggle **single view** ↔ **multi-view (4 viewports)**

### Tank Movement
- `q` — Move tank along world **+x**  
- `e` — Move tank along world **−x**  
- Movement speed: `TANK_SPEED = 0.1`

### Cabin / Cannon
- `a` — Rotate cabin left (yaw)  
- `d` — Rotate cabin right (yaw)  
- `w` — Raise cannon (pitch)  
- `s` — Lower cannon (pitch)  
- Cannon step: `CANNON_STEP = 5°`  
- Cannon limits: **−17° ≤ pitch ≤ 80°**

### Projection & Camera (View 4)
- `8` — Toggle **Axonometric** ↔ **Oblique**  
- `9` — Toggle **Orthographic** ↔ **Perspective** (disabled in oblique mode)  
- `← / →` — Adjust projection angle parameter  
  - Axonometric: `theta ± 5°`  
  - Oblique: `alpha ± 5°`  
- `↑ / ↓` — Adjust projection parameter  
  - Axonometric: `gamma ± 5°`  
  - Oblique: `lambda ± 0.1`  
- `r` — Reset View 4 parameters to defaults  
  - Axonometric default: `theta = 35°`, `gamma = 45°`  
  - Oblique default: `alpha = 45°`, `lambda = 0.5`

### Zoom & Rendering
- Mouse wheel — Zoom in/out (`ZOOM_STEP = 1.1`)
- Space — Toggle wireframe

### Game (“Tomato Strike”)
- `z` — Fire a tomato projectile
- `x` — Reset current score
- `b` — Reset best score (also clears saved value)

---

## 🔧 Runtime-Dependent Transformations

### Tank Translation
Root node `tank.translation` controls the global position:
- On `q` / `e`:  
  `tank.translation[0] ← tank.translation[0] ± 0.1`

### Cannon Pitch (clamped)
`cannon_base.rotation[2]` is updated in 5° steps and clamped to:
- Lower limit: −17°
- Upper limit: 80°

### Wheel Rotation
All wheels rotate when the tank moves:
- `+20°` on forward (`q`)
- `−20°` on backward (`e`)
- Applied as:  
  `wheel.rotation[1] ← (wheel.rotation[1] + rotationSpeed) mod 360`

### Ground Tiles
A checkerboard ground is generated procedurally in a grid:
- Tile size: `0.5`, height: `0.05`
- Tiles per side: `24`
- Alternating colors per `(i + j) mod 2`

---

## 🎯 Extra Feature — “Tomato Strike” Mini-Game

A dynamic “target hole” is placed on the ground. The player shoots tomatoes from the cannon and scores points by landing hits.

### Hole Behaviour
- Random position: `(xh, zh) ∈ [-5, 5]^2`
- Radius changes after each hit:
  - `rmax = 0.8`, `rmin = 0.08`, `Δr = 0.06`
  - The hole alternates between shrinking and growing phases.

### Hit Detection
A hit occurs when:
- Tomato is near the ground: `|y| < 0.05`
- Tomato center is inside the radius:
  `(x − xh)^2 + (z − zh)^2 ≤ r^2`

On hit:
- Tomato is removed
- Score and streak increase
- Hole relocates and updates radius

### Scoring System (Difficulty + Streak)
Smaller hole → higher score; streak increases the multiplier:

- Base points: `10`
- Streak bonus: `+25%` per consecutive hit
- Points formula:
  `points = round(10 · (0.5 + 0.5 · (rmax / r)) · (1 + 0.25 · streak))`

### Best Score Persistence
Best score is stored across sessions using `localStorage`:
- Save: `localStorage.setItem("bestScore", String(bestScore))`
- Load: `bestScore = Number(localStorage.getItem("bestScore") || 0)`

HUD shows:
- **Score**
- **Best**
- **Streak**
(updated in real time)

---

## 🛠 Technologies Used

- **WebGL 2.0**
- **GLSL shaders**
- **JavaScript**
- Scene graph loaded from **`scene.json`**
- Primitives: cube / cylinder / sphere

---

## 🚀 How to Run

1. Start a local web server in the project folder (required for loading JSON and shaders).
2. Open the served page in a WebGL-enabled browser.
3. Use the controls above to explore the model, projections, and the mini-game.

---

## 📌 What I Learned

- Hierarchical modelling with a scene graph (local vs world transforms)
- Multi-viewport rendering and camera handling
- Orthographic vs perspective projection
- Implementing axonometric and oblique projections
- Simple physics and collision testing for interactive features
- Persistent state via browser storage
