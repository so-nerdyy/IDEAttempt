# Conflict Analysis: VSCode + KiloCode Codebases

This document identifies conflicts, naming collisions, and integration challenges between the `vscode/` and `kilocode/` codebases for the purpose of merging them into a single repository.

## 1. Files with Same Relative Path

Only **5 files** share the exact same relative path at the repository root level:

| File | VSCode Purpose | KiloCode Purpose | Conflict Severity | Resolution Strategy |
|------|---------------|------------------|-------------------|---------------------|
| `package.json` | Root build config for `code-oss-dev` (v1.15.0). Uses npm + gulp. | Root monorepo config for `@kilocode/kilo` (v7.1.12). Uses bun + turbo workspaces. | **Critical** | Cannot merge. VSCode's `package.json` drives the entire editor build. KiloCode's drives a bun monorepo. Keep both in separate subdirectories or nest kilocode as a workspace inside vscode (not recommended). Best: keep as separate top-level dirs with a root orchestrator `package.json`. |
| `.vscode/settings.json` | VSCode dev settings: chat config, editor tabs, file exclusions, git, GitHub PRs, testing, eslint flat config, rust-analyzer, etc. (217 lines) | Minimal settings: mdx formatting, file/search excludes for `kilo-vscode` output dirs, tsc auto-detect off (15 lines) | **High** | Merge into a single workspace-level `.vscode/settings.json`. KiloCode settings are a subset. VSCode settings are editor-specific and would apply when opening the merged repo. Preserve both sets of settings; they target different aspects. |
| `.vscode/launch.json` | Comprehensive debug configs: gulp build, extension host attach, shared process, search process, agent host, CLI, main process, multiple test suites, chrome attach, compounds (822 lines) | 2 configs: "Run Extension" and "Run Extension (Local Backend)" for kilocode extension dev (28 lines) | **High** | Merge. VSCode configs cover the editor itself. KiloCode configs cover the extension. Both are needed. No structural conflict -- just union of configurations. |
| `.vscode/tasks.json` | VSCode build tasks: transpile, typecheck, extensions, web, gulp hygiene, tsec, vite, MCP server, component explorer (441 lines) | KiloCode extension tasks: ESBuild watch, TSC watch, CLI watch, compile, tests, DevSnapshot (158 lines) | **High** | Merge. Task labels do not overlap. VSCode uses `npm` task types; KiloCode uses `shell` tasks calling `bun`. Both can coexist in a merged tasks.json. |
| `.vscode/extensions.json` | Recommends: eslint, editorconfig, GitHub PR, issue notebooks, test runner, PR pinger, TS native preview, TS customized (8 extensions) | Recommends: eslint, esbuild problem matchers, test runner (3 extensions) | **Low** | Union of recommendations. No conflicts. Merge into single file. |

**No other source files share the same relative path.** The two codebases have completely different directory structures:
- VSCode: `src/vs/`, `extensions/`, `build/`, `test/`, `cli/`, `remote/`
- KiloCode: `packages/opencode/`, `packages/kilo-vscode/`, `packages/kilo-ui/`, `packages/sdk/`, etc.

## 2. Dependency Version Conflict Matrix

### Shared npm Packages (same package name, different versions)

| Package | VSCode Version | KiloCode Version(s) | Conflict | Notes |
|---------|---------------|---------------------|----------|-------|
| `typescript` | `^6.0.0-dev.20260306` (TS 6.0 nightly) | `5.8.2` (catalog) | **Critical** | Major version difference. VSCode uses TS 6.0 dev with `tsgo` (native preview). KiloCode uses stable TS 5.8.2. Both use `@typescript/native-preview` but different dates. |
| `@typescript/native-preview` | `^7.0.0-dev.20260306` | `7.0.0-dev.20260316.1` (catalog) | **Medium** | Different dev snapshot dates. Both are TS 7.0 native preview. Likely compatible but should be unified. |
| `@types/node` | `^22.18.10` | `22.13.9` (catalog) | **Low** | Minor version difference within same major. Should be compatible. Unify to the newer version. |
| `electron` | `39.8.5` | `40.4.1` (desktop-electron) | **Medium** | Different major versions. VSCode uses 39.x, KiloCode desktop-electron uses 40.x. If both run in the same process space, this is a problem. If kilocode extension runs inside vscode's electron, use vscode's version. |
| `husky` | `^0.13.1` | `9.1.7` | **Critical** | Husky 0.x vs 9.x are completely different. Husky 0.13.1 is ancient (2017 era). Husky 9.x is modern. Must unify to 9.x. |
| `glob` | `^5.0.13` | `13.0.5` | **High** | Major version difference. glob 5.x uses callback API, glob 13.x uses promises. Different APIs entirely. |
| `@playwright/test` | `^1.56.1` | `1.51.0` (catalog) / `1.57.0` (some packages) | **Low** | Minor version differences. All 1.5x. Should be compatible. Unify to latest. |
| `katex` | `^0.16.22` | `0.16.27` (ui package) | **None** | Compatible semver ranges. 0.16.x series. |
| `minimatch` | `^3.1.5` | `10.0.3` (opencode) | **High** | Major version difference. API changed significantly between v3 and v10. |
| `@vscode/codicons` | `^0.0.46-1` | `^0.0.44` (kilo-docs) | **None** | Compatible. Minor version difference in 0.0.x series. |
| `@vscode/test-cli` | `^0.0.6` | `^0.0.12` (kilo-vscode) | **None** | Compatible. KiloCode has newer version. |
| `@vscode/test-electron` | `^2.4.0` | `^2.5.2` (kilo-vscode) | **None** | Compatible. KiloCode has newer version. |
| `eslint` | `^9.36.0` | `^9.39.2` (kilo-vscode) | **None** | Compatible. Both ESLint 9.x with flat config. |
| `typescript-eslint` | `^8.45.0` | `^8.54.0` (kilo-vscode) | **None** | Compatible. Both v8.x. |
| `@parcel/watcher` | `^2.5.6` | `2.5.1` (opencode) | **Low** | Minor version difference. Same major. |
| `open` | `^10.1.2` | `10.1.2` (opencode, kilo-gateway) | **None** | Same version. |
| `@types/mocha` | `^10.0.10` | `^10.0.10` (kilo-vscode) | **None** | Same version. |

### KiloCode-Only Dependencies (no VSCode equivalent)

These packages are unique to KiloCode and introduce no conflicts:

| Package | Used By | Notes |
|---------|---------|-------|
| `@ai-sdk/*` (16 packages) | opencode, kilo-gateway | AI provider SDKs (anthropic, openai, google, etc.). No VSCode equivalent. |
| `ai` | opencode, kilo-gateway, multiple | Vercel AI SDK core. v5.0.124. |
| `hono` | opencode | HTTP server framework. |
| `zod` | opencode, kilo-vscode, multiple | v3.24.2 (kilo-vscode) vs v4.1.8 (catalog). **Internal conflict within kilocode**. |
| `solid-js` | kilo-vscode, app, ui, opencode | v1.9.10-v1.9.11. UI framework for webviews. |
| `bun` (packageManager) | root | `bun@1.3.10`. VSCode uses npm. |
| `turbo` | root | `2.8.13`. VSCode uses gulp. |
| `drizzle-orm` | opencode | Database ORM. |
| `@tauri-apps/*` | desktop | Native desktop framework. |
| `@kobalte/core` | kilo-ui, app | SolidJS component primitives. |
| `tailwindcss` | app, ui, kilo-ui | v4.1.11. |
| `vite` | multiple packages | v7.1.4 (catalog) / v7.3.1 (some packages). |
| `posthog-node` | kilo-telemetry | Analytics. |
| `@modelcontextprotocol/sdk` | opencode | MCP protocol. |
| `vscode-jsonrpc` | opencode | v8.2.1. JSON-RPC for VSCode protocol. |
| `web-tree-sitter` | opencode (0.25.10), kilo-vscode (^0.24.7) | **Internal kilocode conflict** between packages. |

### VSCode-Only Dependencies (no KiloCode equivalent)

| Package | Notes |
|---------|-------|
| `@github/copilot`, `@github/copilot-sdk` | GitHub Copilot integration. |
| `@xterm/*` (8 packages) | Terminal emulator. |
| `node-pty` | Native PTY. |
| `@vscode/ripgrep`, `@vscode/spdlog`, `@vscode/sqlite3` | Native VSCode dependencies. |
| `@vscode/policy-watcher`, `@vscode/proxy-agent` | Enterprise features. |
| `tas-client` | Telemetry and experimentation. |
| `playwright-core` | `1.59.0-alpha-2026-02-20`. |
| `undici` | `^7.24.0`. HTTP client. |
| All gulp plugins (`@vscode/gulp-electron`, `gulp-*`) | Build system. |

## 3. TypeScript Config Conflicts

| Aspect | VSCode | KiloCode | Conflict |
|--------|--------|----------|----------|
| **Root tsconfig** | `src/tsconfig.json` extends `tsconfig.base.json` | `tsconfig.json` extends `@tsconfig/bun/tsconfig.json` | **High** -- Different base configs |
| **TypeScript version** | 6.0.0-dev (native) | 5.8.2 (stable) | **Critical** |
| **Module system** | AMD (custom loader) | ESM (bun/native) | **Critical** |
| **Target** | ES2022 (via base) | ESNext (via @tsconfig/bun) | Medium |
| **Isolated modules** | `false` | `true` (via bun base) | Medium |
| **tsec plugin** | Yes (security type checker) | No | Low -- VSCode specific |
| **Config count** | 20+ tsconfig files across src/, extensions/, build/, test/ | 16 tsconfig files across packages/ | Structural difference only |
| **Compilation** | Custom gulp + tsgo pipeline | bun + tsgo via turbo | Different pipelines |

**Key conflict:** VSCode uses a custom AMD module system with its own loader (`src/vs/loader.js`), while KiloCode uses standard ESM. These cannot share a single tsconfig. The solution is to keep separate tsconfig hierarchies per subdirectory.

## 4. Build System Conflicts

| Aspect | VSCode | KiloCode | Conflict Severity |
|--------|--------|----------|-------------------|
| **Package manager** | npm (package-lock.json) | bun (bun.lock) | **Critical** |
| **Build orchestrator** | gulp (13+ gulpfiles) | turbo (turbo.json) | **Critical** |
| **Compiler** | tsgo (native TS) + custom transpiler | tsgo (native TS) + bun | Medium -- Both use tsgo |
| **Bundler** | Custom gulp + esbuild + webpack | esbuild + vite | Medium |
| **Lock file** | `package-lock.json` | `bun.lock` | **Critical** -- Different formats |
| **Postinstall** | `build/npm/postinstall.ts` (native deps, electron) | bun install (native deps via bun) | **High** |
| **CLI tooling** | `npm run gulp` | `bun turbo` | **High** |
| **Test runner** | mocha | bun test | **High** |

### Detailed Build System Analysis

**VSCode build pipeline:**
1. `npm install` -> `postinstall.ts` (downloads electron, builds native modules)
2. `gulp compile` -> transpiles `src/` to `out/` using tsgo
3. `gulp compile-extensions` -> builds all `extensions/`
4. `gulp vscode-win32-x64` (etc.) -> packages the final product
5. 13 gulpfile modules: `gulpfile.ts`, `gulpfile.cli.ts`, `gulpfile.compile.ts`, `gulpfile.editor.ts`, `gulpfile.extensions.ts`, `gulpfile.hygiene.ts`, `gulpfile.reh.ts`, `gulpfile.scan.ts`, `gulpfile.vscode.ts`, `gulpfile.vscode.linux.ts`, `gulpfile.vscode.web.ts`, `gulpfile.vscode.win32.ts`

**KiloCode build pipeline:**
1. `bun install` -> installs all workspace packages
2. `bun turbo typecheck` -> runs typecheck across all packages in dependency order
3. `bun run dev` -> runs CLI in dev mode
4. `bun run extension` -> builds and launches VSCode extension
5. Individual packages use vite/esbuild for bundling

**Integration approach:** The two build systems must remain separate. VSCode's gulp pipeline is deeply coupled to its AMD module system and electron packaging. KiloCode's turbo pipeline is designed for a bun workspace. The recommended approach is:
- Keep `vscode/` as an npm project (its own `node_modules`)
- Keep `kilocode/` as a bun workspace (its own `node_modules`)
- Add a root-level `package.json` that orchestrates both (e.g., `npm run build:vscode && bun run typecheck`)

## 5. Configuration File Conflicts

### .editorconfig

| Setting | VSCode | KiloCode | Conflict |
|---------|--------|----------|----------|
| `indent_style` | `tab` | `space` | **High** |
| `indent_size` | 2 (for JSON/YAML) | 2 | Compatible for JSON |
| `trim_trailing_whitespace` | `true` | Not set | Low |
| `insert_final_newline` | Not set | `true` | Low |
| `end_of_line` | Not set | `lf` | Low |
| `max_line_length` | Not set | 80 | Low |

**Resolution:** VSCode uses tabs (Microsoft convention), KiloCode uses 2-space indentation. In a merged repo, use `.editorconfig` with path-specific overrides: tabs for `vscode/src/`, spaces for `kilocode/`.

### ESLint

| Aspect | VSCode | KiloCode | Conflict |
|--------|--------|----------|----------|
| Config file | `eslint.config.js` (flat config) | `packages/kilo-vscode/eslint.config.mjs` | Different locations |
| Parser | `typescript-eslint` | `typescript-eslint` | Same |
| Custom plugins | `.eslint-plugin-local/` (many custom rules) | None | VSCode-specific |
| Prettier integration | Not configured | `eslint-config-prettier` | Low |
| Max lines | Not enforced | 3000 lines per file | Low |
| Header requirement | Microsoft copyright header on all files | None | Low |

**Resolution:** Keep separate ESLint configs per subdirectory. VSCode's config is highly specialized with 50+ custom rules. KiloCode's is minimal. No structural conflict.

### Prettier

| Aspect | VSCode | KiloCode |
|--------|--------|----------|
| Config | No prettier config (uses ESLint stylistic) | Inline in `package.json`: `semi: false, printWidth: 120` |
| Usage | Not used | Used across kilocode packages |

**Resolution:** No conflict. VSCode does not use prettier.

### bunfig.toml

KiloCode has `bunfig.toml` at root and in `packages/app/`, `packages/opencode/`, `packages/kilo-vscode/`. VSCode has no equivalent. No conflict.

## 6. Shared Package Name Conflicts in Merged Workspace

### Workspace Package Names

KiloCode defines 15 workspace packages. None of these names conflict with VSCode's internal structure:

```
@kilocode/cli, @kilocode/kilo-docs, @kilocode/kilo-gateway,
@kilocode/kilo-i18n, @kilocode/kilo-telemetry, @kilocode/kilo-ui,
@kilocode/plugin, @opencode-ai/app, @opencode-ai/desktop,
@opencode-ai/desktop-electron, @opencode-ai/script,
@opencode-ai/storybook, @opencode-ai/ui, @opencode-ai/util, kilo-code
```

VSCode does not define any workspace packages. Its `package.json` is a single-package project.

### Internal Module Name Collisions

No collisions found. VSCode's internal modules use `vs/` prefix (e.g., `vs/base/common/event.ts`), while KiloCode uses package-scoped imports (e.g., `@kilocode/sdk`).

## 7. @ai-sdk and Electron Analysis

### @ai-sdk Packages

KiloCode uses 16 `@ai-sdk/*` packages (all v2.x or v1.x):

| Package | Version | Used By |
|---------|---------|---------|
| `@ai-sdk/amazon-bedrock` | 3.0.82 | opencode |
| `@ai-sdk/anthropic` | 2.0.65 | opencode, kilo-gateway |
| `@ai-sdk/azure` | 2.0.91 | opencode |
| `@ai-sdk/cerebras` | 1.0.36 | opencode |
| `@ai-sdk/cohere` | 2.0.22 | opencode |
| `@ai-sdk/deepinfra` | 1.0.36 | opencode |
| `@ai-sdk/gateway` | 2.0.30 | opencode |
| `@ai-sdk/google` | 2.0.54 | opencode |
| `@ai-sdk/google-vertex` | 3.0.106 | opencode |
| `@ai-sdk/groq` | 2.0.34 | opencode |
| `@ai-sdk/mistral` | 2.0.27 | opencode |
| `@ai-sdk/openai` | 2.0.101 | opencode, kilo-gateway |
| `@ai-sdk/openai-compatible` | 1.0.32 | opencode, kilo-gateway |
| `@ai-sdk/perplexity` | 2.0.23 | opencode |
| `@ai-sdk/provider` | 2.0.1 | opencode |
| `@ai-sdk/provider-utils` | 3.0.21 | opencode |
| `@ai-sdk/togetherai` | 1.0.34 | opencode |
| `@ai-sdk/vercel` | 1.0.33 | opencode |
| `@ai-sdk/xai` | 2.0.56 | opencode |

**VSCode does not use any `@ai-sdk/*` packages.** VSCode uses `@github/copilot-sdk` for its AI integration. No conflict.

### Electron Versions

| Project | Version | Notes |
|---------|---------|-------|
| VSCode | 39.8.5 | Used for the editor itself |
| KiloCode desktop-electron | 40.4.1 | Separate desktop app (Tauri is primary, electron is secondary) |

**Conflict:** Different major versions. However, KiloCode's electron usage is in `packages/desktop-electron/` which is a standalone desktop app, not the VSCode extension. The VSCode extension (`kilo-vscode`) runs inside VSCode's own electron process and does not bundle its own electron. **No practical conflict** -- the VSCode extension will use whatever electron version VSCode provides.

## 8. Estimated Effort for Each Conflict Resolution

| Conflict Area | Effort | Description |
|--------------|--------|-------------|
| **Root package.json** | **High (3-5 days)** | Cannot merge directly. Need a root orchestrator package.json that delegates to both subdirectories. Or restructure to make kilocode a subdirectory within vscode's npm workspace (complex due to bun vs npm). |
| **TypeScript version mismatch** | **High (3-5 days)** | VSCode on TS 6.0 dev, KiloCode on TS 5.8.2. Need to either: (a) upgrade KiloCode to TS 6.0, (b) keep separate TS installations per subdirectory, or (c) find a common version. Option (b) is most practical. |
| **Build system (gulp vs bun/turbo)** | **Medium (2-3 days)** | Keep separate. Add root-level scripts that invoke both. No need to unify. |
| **Lock file (package-lock vs bun.lock)** | **Low (1 day)** | Keep both. npm for vscode/, bun for kilocode/. |
| **husky version** | **Low (2 hours)** | Unify to husky 9.x. VSCode's 0.13.1 is ancient and should be upgraded regardless. |
| **glob version (5 vs 13)** | **Medium (1-2 days)** | Different APIs. Need to isolate usage or create adapter layer. VSCode's gulp build depends on glob 5.x. |
| **minimatch version (3 vs 10)** | **Low (1 day)** | Minor usage areas. Update VSCode's build scripts to use minimatch 10.x or isolate. |
| **.editorconfig (tabs vs spaces)** | **Low (1 hour)** | Path-specific overrides. |
| **.vscode/* config files** | **Low (2 hours)** | Merge settings, launch, tasks, extensions. No structural conflicts. |
| **ESLint configs** | **Low (2 hours)** | Keep separate per subdirectory. |
| **Electron version** | **None** | No practical conflict. Extension runs inside VSCode's electron. |
| **@ai-sdk packages** | **None** | VSCode does not use them. |
| **Module system (AMD vs ESM)** | **High (5-10 days)** | VSCode's AMD loader is fundamental to its architecture. Cannot change without major refactoring. Keep isolated. |
| **Internal KiloCode version conflicts** | **Medium (1-2 days)** | KiloCode itself has version inconsistencies: zod (3.24.2 vs 4.1.8), web-tree-sitter (0.24.7 vs 0.25.10), @playwright/test (1.51.0 vs 1.57.0), storybook (10.2.10 vs 10.2.13). These should be fixed within KiloCode first. |

## 9. Build System Integration Recommendations

### Recommended Architecture

```
repo-root/
  package.json          # Root orchestrator (npm or bun)
  vscode/               # VSCode codebase (npm + gulp)
    package.json
    package-lock.json
    node_modules/
    ...
  kilocode/             # KiloCode codebase (bun + turbo)
    package.json
    bun.lock
    node_modules/
    ...
  docs/
    conflict-analysis.md
```

### Root package.json Scripts

```json
{
  "scripts": {
    "build:vscode": "cd vscode && npm run compile",
    "build:kilocode": "cd kilocode && bun turbo build",
    "typecheck:vscode": "cd vscode && npm run compile-check-ts-native",
    "typecheck:kilocode": "cd kilocode && bun turbo typecheck",
    "test:vscode": "cd vscode && npm run test-node",
    "test:kilocode": "cd kilocode/packages/opencode && bun test",
    "lint:vscode": "cd vscode && npm run eslint",
    "lint:kilocode": "cd kilocode && bun turbo lint",
    "install:all": "npm --prefix vscode install && bun --cwd kilocode install"
  }
}
```

### Key Decisions

1. **Do NOT merge node_modules**: Keep separate installations. VSCode's native modules and electron dependencies are incompatible with bun's resolution.
2. **Do NOT unify TypeScript**: Keep separate tsconfig hierarchies. The AMD vs ESM divide is fundamental.
3. **Do NOT merge build systems**: gulp for VSCode, turbo for KiloCode. Root scripts orchestrate both.
4. **DO merge .vscode/ configs**: These are editor-level settings that benefit from being unified.
5. **DO fix internal KiloCode version conflicts**: Before merging, align zod, web-tree-sitter, and storybook versions within kilocode.
6. **Consider bun as root package manager**: Bun can install npm packages and understand package-lock.json. This would allow `bun install` at root to handle both subdirectories. However, VSCode's postinstall script assumes npm.

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| npm/bun conflict in shared deps | High | Medium | Use separate node_modules per subdirectory |
| TypeScript version breakage | Medium | High | Pin versions per subdirectory, do not hoist |
| Native module ABI mismatch | Medium | High | Separate installations prevent this |
| CI pipeline complexity | High | Medium | Root-level scripts abstract complexity |
| Developer onboarding confusion | High | Low | Clear documentation, separate dev commands |
