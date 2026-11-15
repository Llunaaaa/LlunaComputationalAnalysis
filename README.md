Lluna Computational Analysis

LCA (Lluna Computational Analysis) is a Windows desktop calculator and graphing
application built with Tauri, Rust, TypeScript, and a native C++ math engine.
It is an independent project inspired by the approachable interaction model of
modern graphing calculators. It is not affiliated with or endorsed by Desmos.

## What it does today

### Arithmetic

The Arithmetic section provides MathLive-powered mathematical input backed by
the native C++ engine. It currently supports:

- Exact rational arithmetic where the expression can remain exact.
- Decimal and scientific-number evaluation when exact representation is not
  possible or not practical.
- Operator precedence, implicit multiplication, powers, factorials, and
  parentheses.
- Constants including `pi`, `e`, and `phi`.
- Trigonometric, logarithmic, exponential, radical, combinatorial, and
  calculus operations.
- Exact fractions through the fraction display toggle.
- `ans` references to previous results.
- Native error reporting and computation guardrails.

The UI distinguishes exact results from decimal approximations. For example,
an exact rational result can be shown as a decimal approximation by default and
as an exact fraction when the fraction control is enabled.

### Graphing

The Graph section provides an interactive plotting workspace with:

- Multiple expression rows.
- Function and vertical-line expressions.
- Expression reordering.
- Per-expression visibility and colors.
- Sliders for numeric variables.
- Pan, zoom, pinch, and reset-view controls.
- Grid and axes toggles.
- Adaptive curve sampling.
- Pole and discontinuity detection.
- Fullscreen mode through the graph button or `F11`.
- A shared 20-color palette with custom hex colors.
- Safe affine implicit-equation normalization for supported expressions.

Graph sampling runs in the frontend so interaction does not route thousands of
sample evaluations through Tauri. Scalar calculator results remain owned by the
native engine.

### Algebra

- **Simplify** distributes products, combines like terms, and expands
  non-negative integer powers for supported single-variable expressions.
  Equations are simplified on each side without solving them.
- **Rearrange** provides an editable base equation and a read-only mathematical
  result, with initial support for the supplied lens equation's variables.
  General symbolic rearrangement is still planned.
- Equation fields stay compact for ordinary expressions and grow vertically
  with tall notation. Nested fractions use display-style spacing and a minimum
  symbol size; wide equations scroll horizontally rather than shrinking.

### Settings

The Settings section currently includes six tabs:

- **UI** — theme foundation, accent color, density, font scale, reduced motion,
  and the shared 20-color palette.
- **Performance** — Efficiency, Standard, and Performance preferences. These
  currently persist as configuration only and do not change mathematical
  semantics.
- **Constants** — Reserved for a future constants-management redesign.
- **Units** — SI units and prefixes in a searchable, filterable table.
- **Equations** — Reserved for future equation preferences.
- **Graphing** — Grid, axes, sampling quality, line thickness, expression
  outline color, and ordering preferences.

The Units catalog supports locally persisted custom units and categories:

- Create and edit units.
- Assign units to categories.
- Choose Base, Derived, or Prefix kind.
- Enable or disable units.
- Delete custom units.
- Reset customized units to their original definition.
- Protect built-in SI units from deletion.

Unit physical quantities are retained as structured data for future calculator
and conversion integration. Unit arithmetic and conversion are not yet wired
into expression evaluation.

### Application shell

- Windows desktop packaging through Tauri.
- Keyboard-accessible sidebar navigation.
- Lazy loading for large sections.
- Application-wide `F11` fullscreen behavior.
- Dark responsive UI with reduced-motion support.
- Shared MathLive configuration.
- Explicit cleanup for graph observers, timers, animation frames, and global
  listeners.

## What is planned

### Near-term goals

- Finish the Units workflow:
  - Improve category management.
  - Add stronger form validation and inline error presentation.
  - Connect physical quantities to dimensional compatibility.
  - Add unit conversion.
  - Integrate enabled units with calculator and graph expressions.
- Move settings tab rendering and event binding fully into their respective
  tab folders.
- Expand regression coverage for editable units, persistence migration,
  enable/disable behavior, and reset behavior.
- Improve calculator presentation for exact, approximate, symbolic, and
  scientific results.

### Mathematical capabilities

- Broader symbolic algebra and simplification.
- More complete implicit-equation solving.
- Function manipulation and algebraic transformations.
- Expanded calculus tools.
- Matrix operations.
- Statistics and probability tools.
- Geometry and trigonometry workspaces.
- Tables and datasets.
- Better expression diagnostics and explanations.

### Product goals

- Keep exact arithmetic exact whenever mathematically supported.
- Make approximation explicit rather than silently presenting rounded values.
- Keep performance settings from changing mathematical answers.
- Preserve responsive interaction with bounded work and predictable behavior.
- Improve accessibility, keyboard navigation, and screen-reader semantics.
- Add import/export for expressions, graphs, settings, and unit catalogs.
- Provide stronger persistence migration and backup/restore workflows.
- Support additional platforms after the Windows experience is stable.

## Architecture

```text
TypeScript UI -> Tauri command -> Rust FFI -> C++ math engine
```

The repository is organized by responsibility:

- [`src/general/`](./src/general/) contains app composition, shared styles,
  MathLive setup, fullscreen behavior, expression infrastructure, and LaTeX
  conversion.
- [`src/arithmetic/`](./src/arithmetic/) contains calculator rows, evaluation
  state, result presentation, and fraction controls.
- [`src/graph/`](./src/graph/) contains graph state, canvas rendering,
  sampling, pan/zoom interaction, rows, sliders, menus, and reordering.
- [`src/settings/`](./src/settings/) contains the six settings-tab folders and
  their associated state, persistence, catalogs, and views.
- The remaining section folders define boundaries for future implementations:
  `home`, `functions`, `table`, `algebra`, `systems`, `trigonometry`, `matrices`,
  `calculus`, `statistics`, `probability`, `geometry`, and `financial`.
- [`src-tauri/`](./src-tauri/) contains the Rust/Tauri application layer.
- [`engine/`](./engine/) contains the native C++ evaluator and C-compatible
  interface.

Graph rendering is deliberately separate from scalar calculator evaluation.
The graph evaluator samples curves synchronously in the frontend, while the
native engine remains the source of truth for calculator calculations.

## Development

Install:

- Node.js
- Rust
- A Windows C++ compiler
- Windows WebView2

Then run:

```bash
npm install
npm run tauri dev
```

Run the frontend and native tests:

```bash
npm test
cd src-tauri
cargo test
```

Build a Windows release:

```bash
npm run tauri build
```

The MSI and NSIS installers are generated under:

```text
src-tauri/target/release/bundle/
```

## Project status

LCA is an actively evolving prototype. Arithmetic and
graphing form the primary working vertical slice. Several sidebar sections are
reserved for future tools, and unit definitions are currently a catalog and
settings feature rather than a complete dimensional-analysis engine.
