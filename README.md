# Lluna Computational Analysis

Lluna Computational Analysis is a Windows 11 calculator and graphing
application built with a Tauri desktop shell, Rust commands, and a native C++
math engine. The first vertical slice evaluates basic arithmetic expressions
with `+`, `-`, `*`, `/`, and parentheses.

The project is heavily inspired by the Desmos online graphing calculator and
aims to bring a similarly approachable graphing experience to Windows 11.
This is an independent project created by Lluna and is in no way sponsored,
affiliated with, or endorsed by Desmos.

## Architecture

```text
TypeScript UI -> Tauri command -> Rust FFI -> C++ math engine
```

- `src/` contains only section folders and the shared `general/` frontend
  folder. `general/` owns app composition, shared styling, MathLive setup,
  shared expression/LaTeX infrastructure, and common UI behavior. Each
  calculator section has its own folder, even when that section is currently
  a placeholder.
- `src-tauri/` contains the Tauri and Rust application layer.
- `engine/` contains the C++ expression evaluator and C-compatible API.

The Graph section intentionally uses a separate, synchronous frontend sampling
path in [`src/graph/`](./src/graph/). The scalar native command remains the
source of truth for calculator results, while graph interaction avoids routing
thousands of individual samples through Tauri. The graph evaluator supports
`x`, `pi`, `e`, arithmetic, powers, radians, degree postfix notation, and the
common single-argument functions `sin`, `cos`, `tan`, `sqrt`, `abs`, `exp`,
`ln`, and `log`. Unsupported expressions are isolated to the affected graph
row and do not change calculator semantics.

Graph sampling is segment-based and adaptive: invalid/overflowing values break
segments, steep intervals are subdivided up to seven levels, and interactive
frames use a coarser sample stride before refining after a short settling
delay. A graph is limited to 32 expressions and 1,600 horizontal samples per
expression per refinement pass to keep interaction bounded and predictable.
Canvas backing dimensions are scaled by `devicePixelRatio` (capped at 3) for
sharp rendering without unbounded GPU allocation.

Graph expression rows keep their assigned colors when reordered. Right-clicking
an expression opens the lightweight color menu with 20 presets and validated
hex input. Safe affine implicit equations such as `y - x = 3` are normalized
to an explicit `y = f(x)` curve by `src/general/cas.ts`; nonlinear rearrangement is
intentionally left for the future CAS layer.

The Graph UI is split by responsibility:

- [`src/graph/state.ts`](./src/graph/state.ts) owns persistent rows, colors,
  slider policy, and viewport/options state.
- [`src/graph/canvas.ts`](./src/graph/canvas.ts) owns the canvas context,
  adaptive-curve cache, resize observer, pan/zoom/pinch interaction, and
  animation cleanup.
- [`src/graph/index.ts`](./src/graph/index.ts) composes the section, row editors, menus,
  and model/canvas callbacks. It does not own canvas drawing or viewport
  pointer state.

The canvas controller is mounted only while Graph is active and releases its
observer, animation frame, timers, pointer state, and curve cache on cleanup.

The other frontend domains use the same boundary-first structure:

- `src/general/expression/` contains the graph evaluator split into types, tokenizing,
  numeric calculus helpers, function/constant registration, and compilation.
- `src/general/latex/` contains the LaTeX lexicon, tokenizer, and recursive
  converter.
- `src/arithmetic/` contains evaluation/IPC state, row rendering, fraction
  toggles, shared types, and section composition.
- `src/graph/` contains the corresponding Graph state, canvas, rows, sliders,
  reorder controller, color menu, markup, and shared view types.
- `src/settings/` contains the versioned settings model, persistence,
  catalogs, tab renderers, and settings-specific color picker.
- `src/home/`, `src/functions/`, `src/table/`, `src/algebra/`,
  `src/systems/`, `src/trigonometry/`, `src/matrices/`, `src/calculus/`,
  `src/statistics/`, `src/probability/`, `src/geometry/`, and
  `src/financial/` are reserved section boundaries for future implementations.

Compatibility entrypoints are intentionally small: callers do not need to
know the internal module layout, while each subsystem can be tested and
optimized without loading or editing unrelated UI code.

## Development

Install Node.js, Rust, a C++ compiler, and the Windows WebView2 runtime. Then:

```bash
npm install
npm run tauri dev
```

To create a Windows release bundle:

```bash
npm run tauri build
```

The generated MSI and NSIS installer are placed under
`src-tauri/target/release/bundle/`.

## Planned features

- Graphing datasets, functions, and implicit equations.
- Basic arithmetic and calculator capabilities.
- Algebraic and function manipulation.
- SI unit support for real-world applications of data.
- Advanced mathematical functions, including calculus operations, factorials,
  the Gamma function, and permutations.
- Trigonometric and geometric functionality.
- Matrix support.
- LaTeX and ASCIIMath formatting.
- Future native macOS and Linux applications.
