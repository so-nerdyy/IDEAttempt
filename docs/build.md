# Build Documentation

This document describes the build process for the merged VS Code + KiloCode repository.

## Architecture Overview

The repository contains two independent codebases with separate build systems:

| Directory | Build System | Package Manager | Lock File |
|-----------|-------------|-----------------|-----------|
| `vscode/` | Gulp + tsgo | npm | `package-lock.json` |
| `kilocode/` | Turborepo + bun | bun | `bun.lock` |

These systems remain **separate** due to fundamental incompatibilities (AMD vs ESM modules, different TypeScript versions, native module ABI differences). The root `package.json` orchestrates both.

## Prerequisites

- **Node.js**: Version specified in `vscode/.nvmrc`
- **Bun**: Latest stable version
- **Linux build tools**: `build-essential`, `pkg-config`, `libx11-dev`, `libx11-xcb-dev`, `libxkbfile-dev`, `libnotify-bin`, `libkrb5-dev`

## Quick Start

```bash
# Install all dependencies (both codebases)
npm run install:all

# Build everything (KiloCode packages → extension → VS Code)
npm run compile

# Type check both codebases
npm run typecheck

# Run all tests
npm run test

# Lint both codebases
npm run lint
```

## Individual Commands

### Installation

```bash
npm run install:all       # Install both vscode/ and kilocode/ dependencies
npm run install:vscode    # Install VS Code dependencies only
npm run install:kilocode  # Install KiloCode dependencies only
```

### Building

```bash
npm run compile           # Full build: kilocode packages → extension → VS Code
npm run build:kilocode    # Build KiloCode packages via Turborepo
npm run build:extension   # Build Kilo Code VS Code extension (esbuild + webview assets)
npm run build:vscode      # Build VS Code core via gulp
npm run build:all         # Alias for compile
```

### Type Checking

```bash
npm run typecheck         # Type check both codebases
npm run typecheck:kilocode # Type check KiloCode (bun turbo typecheck)
npm run typecheck:vscode   # Type check VS Code (tsgo --noEmit)
```

### Testing

```bash
npm run test              # Run all tests
npm run test:kilocode     # Run KiloCode tests (bun test in packages/opencode)
npm run test:vscode       # Run VS Code node tests
npm run test:integration  # Run VS Code extension tests
```

### Linting

```bash
npm run lint              # Lint both codebases
npm run lint:kilocode     # Lint KiloCode (bun turbo lint)
npm run lint:vscode       # Lint VS Code (eslint)
```

### Watch Mode

```bash
npm run watch             # Watch both codebases (parallel)
npm run watch:kilocode    # Watch KiloCode (bun turbo dev)
npm run watch:vscode      # Watch VS Code (gulp watch)
```

### Packaging

```bash
npm run vsix:package      # Build VS Code Linux x64 package
npm run clean             # Remove all build artifacts
```

## Build Pipeline Details

### Order of Operations

The build must run in this order due to dependencies:

```
1. KiloCode packages (bun turbo build)
   └─ Compiles: sdk, kilo-i18n, kilo-ui, kilo-gateway, kilo-telemetry
   └─ Outputs: packages/*/dist/

2. Kilo Code extension (gulp compile-kilo-code-extension)
   ├─ Runs kilocode package build if needed
   ├─ Bundles extension via esbuild → dist/extension.js
   └─ Bundles webview assets → dist/webview-ui/

3. VS Code core (gulp compile)
   ├─ Transpiles src/ → out/
   ├─ Compiles all extensions (including kilo-code)
   └─ Compiles extension media
```

### Gulp Integration

The Kilo Code extension build is integrated into VS Code's gulp pipeline:

- **`compile-kilo-code-extension`**: Main task that compiles kilocode packages, builds the extension, and bundles webview assets
- **`watch-kilo-code-extension`**: Watches extension source and webview files for changes
- **`compile-extensions`** now depends on `compile-kilo-code-extension` (runs first)
- **`watch-extensions`** includes `watch-kilo-code-extension`

See `vscode/build/gulpfile.kilo-code.ts` for the implementation.

### TypeScript Configuration

Due to the AMD vs ESM divide, separate tsconfig hierarchies are maintained:

| Path | Purpose | TypeScript Version |
|------|---------|-------------------|
| `vscode/src/tsconfig.json` | VS Code core (AMD modules) | TS 6.0 dev |
| `vscode/extensions/kilo-code/tsconfig.json` | Kilo Code extension | TS 5.x |
| `kilocode/tsconfig.json` | KiloCode packages (ESM) | TS 5.8.2 |

A root `tsconfig.json` uses project references to link all three for IDE support:

```json
{
  "files": [],
  "references": [
    { "path": "vscode/src/tsconfig.json" },
    { "path": "vscode/extensions/kilo-code/tsconfig.json" },
    { "path": "kilocode/tsconfig.json" }
  ]
}
```

### Extension Build

The Kilo Code extension at `vscode/extensions/kilo-code/` uses:

- **esbuild** for bundling the extension host code (`src/extension.ts` → `dist/extension.js`)
- **gulp** for copying webview assets (`webview-ui/` → `dist/webview-ui/`)
- **Symlinks** to kilocode packages in `packages/` directory (pointing to `kilocode/packages/`)

The extension manifest is at `vscode/extensions/kilo-code/package.json` and is registered in `vscode/product.json` under `builtInExtensions`.

## CI/CD

GitHub Actions workflow: `.github/workflows/merged-build.yml`

### Jobs

| Job | Description | Dependencies |
|-----|-------------|-------------|
| `install` | Install dependencies for both codebases | — |
| `typecheck` | Type check VS Code and KiloCode | `install` |
| `kilocode-build` | Build KiloCode packages | `install` |
| `extension-build` | Build Kilo Code extension | `install`, `kilocode-build` |
| `vscode-build` | Build VS Code core + hygiene | `install`, `extension-build` |
| `kilocode-tests` | Run KiloCode tests | `install`, `kilocode-build` |
| `vscode-tests` | Run VS Code tests | `install`, `vscode-build` |
| `lint` | Lint both codebases | `install` |

### Caching

- VS Code `node_modules` cached by `package-lock.json` hash
- KiloCode `node_modules` cached by `bun.lock` hash
- Caches are restored on every run to avoid re-installation

## Troubleshooting

### Build fails with "bun: command not found"

Install bun: `curl -fsSL https://bun.sh/install | bash`

### VS Code native modules fail to build

Install required system dependencies:
```bash
sudo apt update && sudo apt install -y build-essential pkg-config libx11-dev libx11-xcb-dev libxkbfile-dev libnotify-bin libkrb5-dev
```

### KiloCode packages not found during extension build

Ensure symlinks are valid:
```bash
ls -la vscode/extensions/kilo-code/packages/
```
Each should point to the corresponding `kilocode/packages/` directory.

### TypeScript errors in IDE

The root `tsconfig.json` uses project references. Your editor should support this. If not, open the specific subdirectory's tsconfig directly.

### Clean build

```bash
npm run clean
npm run install:all
npm run compile
```
