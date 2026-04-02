# Phase 2 Integration Plan: VS Code + KiloCode

## Overview

This document describes the architecture for merging the VS Code editor codebase (`vscode/`) and the KiloCode AI agent codebase (`kilocode/`) into a single buildable repository. KiloCode will ship as a built-in VS Code extension rather than an external marketplace extension.

## Architecture Decisions

### 1. Build System Strategy

**Decision: Keep VS Code's gulp build as primary; Bun as secondary for kilocode packages only.**

The VS Code build system (gulp + npm) is deeply coupled to its AMD module loader, electron packaging, and native module compilation. KiloCode's build system (Bun + Turborepo) targets ESM and Bun-specific APIs. These cannot be unified without major refactoring.

- **Primary build**: `npm run compile` in `vscode/` (gulp-based)
- **Secondary build**: `bun turbo build` in `kilocode/` (for kilocode packages only)
- **Root orchestrator**: `package.json` at repo root delegates to both subdirectories

### 2. Directory Layout

```
repo-root/
  package.json              # Root orchestrator (npm)
  package-lock.json         # Root lock (orchestrator only)
  bun.lock                  # KiloCode lock (kilocode/ only)

  vscode/                   # VS Code codebase (npm + gulp)
    package.json
    package-lock.json
    node_modules/
    extensions/
      kilo-code/            # KiloCode as built-in extension (symlink)
        package.json        # Built-in extension manifest
        src/                # Extension source
        packages/           # Symlinks to kilocode packages
          opencode/         # -> ../../../../kilocode/packages/opencode
          sdk/              # -> ../../../../kilocode/packages/sdk
          kilo-gateway/     # -> ../../../../kilocode/packages/kilo-gateway
          kilo-telemetry/   # -> ../../../../kilocode/packages/kilo-telemetry
          kilo-i18n/        # -> ../../../../kilocode/packages/kilo-i18n
          kilo-ui/          # -> ../../../../kilocode/packages/kilo-ui
    src/                    # VS Code core (unchanged)
    build/                  # VS Code build scripts
    product.json            # Product config (updated)

  kilocode/                 # KiloCode codebase (bun + turbo)
    package.json
    bun.lock
    node_modules/
    packages/               # Original kilocode packages
      opencode/
      kilo-vscode/          # Original external extension (preserved for reference)
      kilo-gateway/
      kilo-telemetry/
      kilo-i18n/
      kilo-ui/
      sdk/
      ...

  docs/
    conflict-analysis.md          # Phase 1 conflict analysis
    phase2-integration-plan.md    # This document
```

### 3. Extension Model

KiloCode is registered as a **built-in extension** in `vscode/extensions/kilo-code/`. This directory contains:

- `package.json` — VS Code extension manifest (derived from `kilocode/packages/kilo-vscode/package.json`)
- `src/` — Extension TypeScript source (adapted from `kilocode/packages/kilo-vscode/src/`)
- `webview-ui/` — Webview assets (adapted from `kilocode/packages/kilo-vscode/webview-ui/`)
- `packages/` — Symlinks to kilocode dependency packages

The built-in extension is registered in `vscode/product.json` under `builtInExtensions`.

### 4. Dependency Resolution

**Separate node_modules per subdirectory:**

| Directory | Package Manager | Lock File | Notes |
|-----------|----------------|-----------|-------|
| `vscode/` | npm | `package-lock.json` | VS Code core + extensions |
| `kilocode/` | bun | `bun.lock` | KiloCode packages |
| `vscode/extensions/kilo-code/` | bun | (inherits from kilocode) | Uses symlinks to kilocode packages |

The `kilo-code` extension uses Bun to resolve its `workspace:*` dependencies through symlinks into `kilocode/packages/`. This avoids duplicating node_modules while keeping the two build systems isolated.

### 5. TypeScript Configuration

Separate tsconfig hierarchies are maintained:

- `vscode/` uses AMD modules with TS 6.0 dev (native)
- `kilocode/` uses ESM with TS 5.8.2 (stable)
- `vscode/extensions/kilo-code/` uses its own tsconfig compatible with the VS Code extension host

No single root tsconfig is possible due to the AMD vs ESM divide.

## Build Pipeline

### Root-Level Scripts

```json
{
  "scripts": {
    "install:all": "npm --prefix vscode install && bun --cwd kilocode install",
    "build:kilocode": "cd kilocode && bun turbo build",
    "build:extension": "cd vscode/extensions/kilo-code && bun run compile",
    "build:vscode": "cd vscode && npm run compile",
    "build:all": "npm run build:kilocode && npm run build:extension && npm run build:vscode",
    "typecheck:kilocode": "cd kilocode && bun turbo typecheck",
    "typecheck:vscode": "cd vscode && npm run compile-check-ts-native",
    "test:kilocode": "cd kilocode/packages/opencode && bun test",
    "test:vscode": "cd vscode && npm run test-node"
  }
}
```

### Gulp Integration

A new gulp task `compile-kilo-code` is added to the VS Code build pipeline. It:

1. Runs `bun install` in `kilocode/` if `bun.lock` is newer than `node_modules/`
2. Compiles kilocode packages (`opencode`, `sdk`, `kilo-gateway`, `kilo-telemetry`, `kilo-i18n`, `kilo-ui`)
3. Compiles the kilo-code extension (esbuild + tsc)
4. Bundles webview assets into the extension output directory

The task runs as a dependency of `compile-extensions`.

### Build Order

```
1. kilocode packages build (bun turbo build)
2. kilo-code extension build (esbuild + tsc)
3. VS Code core build (gulp compile)
4. VS Code extensions build (gulp compile-extensions)
   └─ includes kilo-code extension
5. VS Code packaging (gulp vscode-*)
```

## product.json Changes

KiloCode is added to the `builtInExtensions` array in `vscode/product.json`:

```json
{
  "builtInExtensions": [
    {
      "name": "kilocode.kilo-code",
      "version": "7.1.12",
      "repo": "https://github.com/Kilo-Org/kilocode",
      "metadata": {
        "id": "kilocode-kilo-code-builtin",
        "publisherId": {
          "publisherId": "kilocode",
          "publisherName": "kilocode",
          "displayName": "Kilo Code",
          "flags": "verified"
        },
        "publisherDisplayName": "Kilo Code"
      }
    }
  ]
}
```

## Migration Phases

### Phase 2 (Current): Integration Scaffolding
- [x] Create integration plan document
- [x] Set up `vscode/extensions/kilo-code/` directory structure
- [x] Create symlinks to kilocode packages
- [x] Update `product.json` with built-in extension entry
- [x] Create gulp task for kilocode compilation
- [x] Create root-level `package.json` orchestrator

### Phase 3: Native Service Integration
- [ ] Port opencode CLI server to run as VS Code built-in service (KiloAIService)
- [ ] Replace HTTP+SSE communication with direct function calls
- [ ] Adapt Bun.serve to Node.js HTTP server
- [ ] Register service in VS Code's IoC container

### Phase 4: Built-in Extension
- [ ] Convert kilo-vscode package to built-in extension format
- [ ] Port KiloConnectionService to use native KiloAIService
- [ ] Port SSE event subscription to VS Code Event/Emitter
- [ ] Preserve all 40+ commands, 30+ keybindings, context menus

### Phase 5: Native UI Components
- [ ] Convert KiloProvider sidebar to native TreeView + WebviewView
- [ ] Migrate session management to VS Code commands
- [ ] Wire up KiloCode tools to VS Code APIs

### Phase 6: Testing & CI
- [ ] Create integration test suites
- [ ] Set up mock AI provider for deterministic testing
- [ ] Update CI configuration for merged build
- [ ] Document build and test processes

## Known Constraints

1. **TypeScript version mismatch**: VS Code uses TS 6.0 dev, KiloCode uses TS 5.8.2. Kept isolated per subdirectory.
2. **Module system**: VS Code uses AMD loader, KiloCode uses ESM. No unification possible without major refactoring.
3. **Bun-specific APIs**: KiloCode's opencode server uses `Bun.serve` and other Bun-specific APIs. These must be adapted to Node.js for in-process VS Code integration.
4. **Native modules**: VS Code's native modules (`node-pty`, `@vscode/sqlite3`, etc.) are incompatible with Bun's resolution. Separate installations required.
5. **Electron version**: VS Code uses Electron 39.x, KiloCode desktop uses 40.x. The extension runs inside VS Code's Electron process, so VS Code's version takes precedence.

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| npm/bun conflict in shared deps | Separate node_modules per subdirectory |
| TypeScript version breakage | Pin versions per subdirectory, do not hoist |
| Native module ABI mismatch | Separate installations prevent this |
| CI pipeline complexity | Root-level scripts abstract complexity |
| Developer onboarding confusion | Clear documentation, separate dev commands |
