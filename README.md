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

- `src/` contains the TypeScript and CSS frontend.
- `src-tauri/` contains the Tauri and Rust application layer.
- `engine/` contains the C++ expression evaluator and C-compatible API.

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
