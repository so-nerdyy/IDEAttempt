# Import Fix Plan — kilo-vscode/src/ Audit

**Date**: 2026-04-08
**Scope**: All `.ts`/`.tsx` files under `kilocode/packages/kilo-vscode/src/` and `kilocode/packages/kilo-vscode/webview-ui/`
**Current state**: Typecheck passes (`tsc --noEmit` exits 0) because the monorepo workspace resolution makes all `@kilocode/*` and `@opencode-ai/*` aliases resolve via symlinked workspace packages.

## Summary

| Category | Count of import statements | Unique package/subpath | Risk |
|---|---|---|---|
| (a) @kilocode workspace package aliases | 399 | 88 unique subpaths | HIGH — all break outside monorepo |
| (b) Wrong relative paths | 0 confirmed | — | NONE — all relative paths resolve correctly |
| (c) VS Code API types | 55 | `vscode` (1 module) | LOW — resolves via `@types/vscode` devDep |
| (d) Other | 6 | 3 issues | MEDIUM — direct `child_process`, `@opencode-ai/ui`, `@anthropic-ai/sdk` |

---

## Category (a): @kilocode Workspace Package Alias Imports

These imports rely on `workspace:*` resolution in the monorepo. In a standalone VS Code fork repo without the monorepo, **all of these will fail to resolve**.

### Package: `@kilocode/sdk`

Used for: TypeScript SDK client types for the CLI backend HTTP API.

| Subpath | Import count | Files (src/) | Files (webview-ui/) |
|---|---|---|---|
| `@kilocode/sdk/v2/client` | 29 | 17 files | 4 files |
| `@kilocode/sdk/v2` | 16 | 8 files | 7 files |

**src/ files using `@kilocode/sdk/v2/client`:**

| File | Imported symbols |
|---|---|
| `src/services/cli-backend/connection-service.ts` | `createKiloClient`, `KiloClient`, `Event` |
| `src/services/cli-backend/sdk-sse-adapter.ts` | `KiloClient`, `GlobalEvent`, `Event` |
| `src/services/cli-backend/connection-utils.ts` | `Event` |
| `src/services/cli-backend/types.ts` | (comment reference) |
| `src/KiloProvider.ts` | `KiloClient`, `Session`, `Event`, `Agent`, etc. |
| `src/kilo-provider-utils.ts` | `Session`, `Agent`, `Event`, `ProviderListResponse` |
| `src/kilo-provider/handlers/auth.ts` | `KiloClient` |
| `src/kilo-provider/handlers/cloud-session.ts` | `KiloClient`, `Session`, `TextPartInput`, `FilePartInput` |
| `src/kilo-provider/handlers/permission-handler.ts` | `KiloClient`, `PermissionRequest` |
| `src/kilo-provider/handlers/migration.ts` | `KiloClient` |
| `src/kilo-provider/handlers/question.ts` | `KiloClient` |
| `src/agent-manager/AgentManagerProvider.ts` | `KiloClient`, `Session` |
| `src/agent-manager/GitStatsPoller.ts` | `KiloClient`, `FileDiff` |
| `src/agent-manager/host.ts` | `Session` |
| `src/agent-manager/fork-session.ts` | `KiloClient`, `Session` |
| `src/agent-manager/continue-in-worktree.ts` | `KiloClient`, `Session` |
| `src/agent-manager/types.ts` | `FileDiff` |
| `src/commands/toggle-auto-approve.ts` | `KiloClient`, `Event` |
| `src/services/browser-automation/browser-automation-service.ts` | `KiloClient`, `McpStatus` |
| `src/services/commit-message/index.ts` | `KiloClient` |
| `src/legacy-migration/migration-service.ts` | `KiloClient` |
| `src/legacy-migration/sessions/migrate.ts` | `KiloClient` |
| `src/DiffViewerProvider.ts` | `FileDiff` |
| `src/review-utils.ts` | `FileDiff` |
| `src/session-status.ts` | `KiloClient`, `SessionStatus` |
| `src/provider-actions.ts` | `KiloClient` |

**src/ files using `@kilocode/sdk/v2` (top-level):**

| File | Imported symbols |
|---|---|
| `src/provider-actions.ts` | `KiloClient` |
| `src/legacy-migration/sessions/lib/parts/parts-builder.ts` | `KilocodeSessionImportPartData` |
| `src/legacy-migration/sessions/lib/parts/parts.ts` | `KilocodeSessionImportPartData` |
| `src/legacy-migration/sessions/lib/parts/merge-tools.ts` | `KilocodeSessionImportPartData` |
| `src/legacy-migration/sessions/lib/messages.ts` | `KilocodeSessionImportMessageData` |
| `src/legacy-migration/sessions/lib/session.ts` | `KilocodeSessionImportSessionData` |
| `src/legacy-migration/sessions/lib/project.ts` | `KilocodeSessionImportProjectData` |
| `src/legacy-migration/sessions/parser.ts` | multiple session import types |

**webview-ui/ files using `@kilocode/sdk`:**

| File | Import path | Symbols |
|---|---|---|
| `webview-ui/src/App.tsx` | `@kilocode/sdk/v2` | `Message`, `Part` |
| `webview-ui/src/utils/errorUtils.ts` | `@kilocode/sdk/v2` | `AssistantMessage` |
| `webview-ui/src/types/messages.ts` | `@kilocode/sdk/v2/client` | `ProviderAuthAuthorization`, `ProviderAuthMethod` |
| `webview-ui/src/context/provider.tsx` | `@kilocode/sdk/v2/client` | `ProviderAuthMethod` |
| `webview-ui/src/components/chat/AssistantMessage.tsx` | `@kilocode/sdk/v2` | `AssistantMessage` |
| `webview-ui/src/components/chat/TaskToolExpanded.tsx` | `@kilocode/sdk/v2` | `ToolPart`, `Message` |
| `webview-ui/src/components/chat/VscodeSessionTurn.tsx` | `@kilocode/sdk/v2` | `Message`, `TextPart`, `ToolPart` |
| `webview-ui/src/components/chat/ErrorDisplay.tsx` | `@kilocode/sdk/v2` | `AssistantMessage` |
| `webview-ui/src/components/settings/ProviderConnectDialog.tsx` | `@kilocode/sdk/v2/client` | `ProviderAuthAuthorization`, `ProviderAuthMethod` |
| `webview-ui/src/stories/composite.stories.tsx` | `@kilocode/sdk/v2` | `AssistantMessage`, `TextPart`, `ToolPart` |
| `webview-ui/src/stories/shell.stories.tsx` | `@kilocode/sdk/v2` | `AssistantMessage`, `ToolPart` |

**Fix options for `@kilocode/sdk`:**
1. Add `paths` mapping in `tsconfig.json`: `"@kilocode/sdk/*": ["../sdk/js/src/*"]`
2. Publish `@kilocode/sdk` to npm and add as a regular dependency
3. Replace with relative paths (impractical — too many files)

---

### Package: `@kilocode/kilo-ui`

Used for: SolidJS component library (40+ components). Used exclusively in `webview-ui/` (sidebar, agent manager, diff viewer).

| Subpath | Import count |
|---|---|
| `@kilocode/kilo-ui/button` | 35 |
| `@kilocode/kilo-ui/icon` | 24 |
| `@kilocode/kilo-ui/card` | 19 |
| `@kilocode/kilo-ui/icon-button` | 18 |
| `@kilocode/kilo-ui/context/dialog` | 18 |
| `@kilocode/kilo-ui/spinner` | 16 |
| `@kilocode/kilo-ui/toast` | 14 |
| `@kilocode/kilo-ui/dialog` | 14 |
| `@kilocode/kilo-ui/tooltip` | 13 |
| `@kilocode/kilo-ui/text-field` | 12 |
| `@kilocode/kilo-ui/select` | 9 |
| `@kilocode/kilo-ui/switch` | 8 |
| `@kilocode/kilo-ui/diff` | 7 |
| `@kilocode/kilo-ui/message-part` | 6 |
| `@kilocode/kilo-ui/context/diff` | 6 |
| `@kilocode/kilo-ui/context/data` | 6 |
| `@kilocode/kilo-ui/tag` | 5 |
| `@kilocode/kilo-ui/popover` | 5 |
| `@kilocode/kilo-ui/file` | 5 |
| `@kilocode/kilo-ui/context/marked` | 5 |
| `@kilocode/kilo-ui/context/file` | 5 |
| `@kilocode/kilo-ui/context/code` | 5 |
| `@kilocode/kilo-ui/code` | 5 |
| `@kilocode/kilo-ui/file-icon` | 4 |
| `@kilocode/kilo-ui/diff-changes` | 4 |
| `@kilocode/kilo-ui/context-menu` | 4 |
| `@kilocode/kilo-ui/context` | 4 |
| `@kilocode/kilo-ui/theme` | 3 |
| `@kilocode/kilo-ui/sticky-accordion-header` | 3 |
| `@kilocode/kilo-ui/radio-group` | 3 |
| `@kilocode/kilo-ui/provider-icon` | 3 |
| `@kilocode/kilo-ui/list` | 3 |
| `@kilocode/kilo-ui/i18n/en` | 3 |
| `@kilocode/kilo-ui/accordion` | 3 |
| `@kilocode/kilo-ui/tabs` | 2 |
| `@kilocode/kilo-ui/resize-handle` | 2 |
| `@kilocode/kilo-ui/hooks` | 2 |
| `@kilocode/kilo-ui/context/i18n` | 2 |
| `@kilocode/kilo-ui/collapsible` | 2 |
| `@kilocode/kilo-ui/checkbox` | 2 |
| `@kilocode/kilo-ui/markdown` | 1 |
| `@kilocode/kilo-ui/lucide` | 1 |
| `@kilocode/kilo-ui/inline-input` | 1 |
| `@kilocode/kilo-ui/hover-card` | 1 |
| `@kilocode/kilo-ui/error-details` | 1 |
| `@kilocode/kilo-ui/dropdown-menu` | 1 |
| `@kilocode/kilo-ui/dock-prompt` | 1 |
| `@kilocode/kilo-ui/basic-tool` | 1 |
| `@kilocode/kilo-ui/i18n/{ar,br,bs,da,de,es,fr,ja,ko,nl,no,pl,ru,th,tr,zh,zht}` | 1 each (17 locales) |

Also: 3 side-effect-only imports of `@kilocode/kilo-ui/styles` (in `webview-ui/src/index.tsx`, `webview-ui/agent-manager/index.tsx`, `webview-ui/diff-viewer/index.tsx`).

**Fix options for `@kilocode/kilo-ui`:**
1. Add `paths` mapping in webview `tsconfig.json`: `"@kilocode/kilo-ui/*": ["../../kilo-ui/src/*"]` — requires kilo-ui source to be present
2. Publish `@kilocode/kilo-ui` to npm and add as regular dependency
3. Bundle kilo-ui source into the extension package directly

---

### Package: `@kilocode/kilo-i18n`

Used for: Translation strings (16 languages). Used in `webview-ui/src/context/language.tsx` only.

| Subpath | Import count |
|---|---|
| `@kilocode/kilo-i18n/en` | 3 |
| `@kilocode/kilo-i18n/{ar,br,bs,da,de,es,fr,ja,ko,nl,no,pl,ru,th,tr,zh,zht}` | 1 each (17 locales) |

All imports are in a single file: `webview-ui/src/context/language.tsx`

**Fix options for `@kilocode/kilo-i18n`:**
1. Add `paths` mapping in webview `tsconfig.json`
2. Publish to npm and add as regular dependency
3. Copy i18n locale files locally

---

## Category (b): Wrong Relative Paths

**No broken relative paths found.** The typecheck (`tsc --noEmit`) passes with zero errors. All relative imports resolve correctly within the current directory structure.

The previously reported issue (tool-execution tools importing `./tool-execution-service` instead of `../tool-execution-service`) has already been fixed — all files in `src/services/tool-execution/tools/*.ts` now correctly use `../tool-execution-service`.

---

## Category (c): VS Code API Types

The `vscode` module is imported in 55 locations across `src/`. It resolves via the `@types/vscode` devDependency and is also marked as `external: ["vscode"]` in the esbuild config.

This is the correct and expected pattern for a VS Code extension. **No fix needed.**

Files importing `vscode`:

| Directory | Count |
|---|---|
| `src/services/autocomplete/` | 18 |
| `src/services/tool-execution/` | 9 |
| `src/services/autocomplete/continuedev/` | 5 |
| `src/agent-manager/` | 3 |
| `src/services/cli-backend/` | 2 |
| `src/` (root files) | 5 |
| `src/services/code-actions/` | 4 |
| `src/services/` (other) | 4 |
| `src/legacy-migration/` | 3 |
| `src/test/` | 1 |
| `src/kilo-provider/` | 1 |

---

## Category (d): Other Import Issues

### (d-1) Direct `child_process` imports (bypassing Windows-safe wrapper)

The AGENTS.md convention requires using the wrappers in `src/util/process.ts` instead of importing from `child_process` directly, to prevent cmd.exe console windows flashing on Windows.

| File | Import | Issue |
|---|---|---|
| `src/services/tool-execution/tool-execution-service.ts:3` | `import { spawn, ChildProcess } from 'child_process'` | Should use `import { spawn } from "../util/process"` and `import type { ChildProcess } from "child_process"` |
| `src/agent-manager/git-transfer.ts:3` | `import * as cp from "child_process"` | Should use wrappers from `../util/process` |
| `src/agent-manager/shell-env.ts:14` | `import { type ExecFileOptionsWithStringEncoding } from "child_process"` | Type-only import — acceptable |
| `src/services/cli-backend/server-manager.ts:1` | `import { type ChildProcess } from "child_process"` | Type-only import — acceptable |

**Fix**: Replace value imports from `child_process` with the wrappers in `src/util/process.ts`. Type-only imports are fine.

---

### (d-2) `@opencode-ai/ui/icons/provider` import

| File | Import |
|---|---|
| `webview-ui/src/components/settings/provider-catalog.ts:1` | `import { iconNames, type IconName } from "@opencode-ai/ui/icons/provider"` |

This is a workspace package (`@opencode-ai/ui` → `packages/ui/`). It will break outside the monorepo.

**Fix options:**
1. Add `paths` mapping in webview `tsconfig.json`
2. Move the icon name list into kilo-ui or the extension itself
3. Replace with a local provider icon mapping

---

### (d-3) `@anthropic-ai/sdk` type import

| File | Import |
|---|---|
| `src/legacy-migration/sessions/lib/legacy-types.ts:1` | `import type { Anthropic } from "@anthropic-ai/sdk"` |

This is a type-only import from a package that IS in `dependencies`. It will resolve if `@anthropic-ai/sdk` is installed as a dependency. However, the `@anthropic-ai/sdk` package is quite large and this single type reference may not justify including it as a dependency.

**Fix options:**
1. Inline the required type definitions
2. Keep the dependency (it's already listed in `package.json`)

---

## Detailed File-by-File Listing

### All @kilocode/sdk imports in src/

| # | File | Import path | Symbols |
|---|---|---|---|
| 1 | `src/session-status.ts:1` | `@kilocode/sdk/v2/client` | `KiloClient`, `SessionStatus` |
| 2 | `src/review-utils.ts:4` | `@kilocode/sdk/v2/client` | `FileDiff` |
| 3 | `src/provider-actions.ts:5` | `@kilocode/sdk/v2` | `KiloClient` |
| 4 | `src/services/commit-message/index.ts:2` | `@kilocode/sdk/v2/client` | `KiloClient` |
| 5 | `src/services/browser-automation/browser-automation-service.ts:2` | `@kilocode/sdk/v2/client` | `KiloClient`, `McpStatus` |
| 6 | `src/agent-manager/types.ts:10` | `@kilocode/sdk/v2/client` | `FileDiff` |
| 7 | `src/agent-manager/AgentManagerProvider.ts:3` | `@kilocode/sdk/v2/client` | `KiloClient`, `Session` |
| 8 | `src/agent-manager/GitStatsPoller.ts:3` | `@kilocode/sdk/v2/client` | `KiloClient`, `FileDiff` |
| 9 | `src/agent-manager/host.ts:11` | `@kilocode/sdk/v2/client` | `Session` |
| 10 | `src/agent-manager/fork-session.ts:1` | `@kilocode/sdk/v2/client` | `KiloClient`, `Session` |
| 11 | `src/agent-manager/continue-in-worktree.ts:1` | `@kilocode/sdk/v2/client` | `KiloClient`, `Session` |
| 12 | `src/commands/toggle-auto-approve.ts:2` | `@kilocode/sdk/v2/client` | `KiloClient`, `Event` |
| 13 | `src/services/cli-backend/connection-utils.ts:1` | `@kilocode/sdk/v2/client` | `Event` |
| 14 | `src/services/cli-backend/sdk-sse-adapter.ts:1` | `@kilocode/sdk/v2/client` | `KiloClient`, `GlobalEvent`, `Event` |
| 15 | `src/services/cli-backend/connection-service.ts:3` | `@kilocode/sdk/v2/client` | `createKiloClient`, `KiloClient`, `Event` |
| 16 | `src/kilo-provider-utils.ts:1` | `@kilocode/sdk/v2/client` | `Session`, `Agent`, `Event`, `ProviderListResponse` |
| 17 | `src/kilo-provider/handlers/cloud-session.ts:8` | `@kilocode/sdk/v2/client` | `KiloClient`, `Session`, `TextPartInput`, `FilePartInput` |
| 18 | `src/kilo-provider/handlers/auth.ts:8` | `@kilocode/sdk/v2/client` | `KiloClient` |
| 19 | `src/kilo-provider/handlers/permission-handler.ts:8` | `@kilocode/sdk/v2/client` | `KiloClient`, `PermissionRequest` |
| 20 | `src/kilo-provider/handlers/migration.ts:8` | `@kilocode/sdk/v2/client` | `KiloClient` |
| 21 | `src/kilo-provider/handlers/question.ts:8` | `@kilocode/sdk/v2/client` | `KiloClient` |
| 22 | `src/legacy-migration/migration-service.ts:9` | `@kilocode/sdk/v2/client` | `KiloClient` |
| 23 | `src/legacy-migration/migration-service.ts:16` | `@kilocode/sdk/v2/client` | `Config`, `ProviderListResponse`, etc. |
| 24 | `src/legacy-migration/sessions/migrate.ts:2` | `@kilocode/sdk/v2/client` | `KiloClient` |
| 25 | `src/DiffViewerProvider.ts:2` | `@kilocode/sdk/v2/client` | `FileDiff` |
| 26 | `src/KiloProvider.ts:14` | `@kilocode/sdk/v2/client` | `KiloClient`, `Session`, `Event`, `Agent` |
| 27 | `src/legacy-migration/sessions/lib/parts/parts-builder.ts:1` | `@kilocode/sdk/v2` | `KilocodeSessionImportPartData` |
| 28 | `src/legacy-migration/sessions/lib/parts/parts.ts:1` | `@kilocode/sdk/v2` | `KilocodeSessionImportPartData` |
| 29 | `src/legacy-migration/sessions/lib/parts/merge-tools.ts:1` | `@kilocode/sdk/v2` | `KilocodeSessionImportPartData` |
| 30 | `src/legacy-migration/sessions/lib/messages.ts:1` | `@kilocode/sdk/v2` | `KilocodeSessionImportMessageData` |
| 31 | `src/legacy-migration/sessions/lib/session.ts:1` | `@kilocode/sdk/v2` | `KilocodeSessionImportSessionData` |
| 32 | `src/legacy-migration/sessions/lib/project.ts:1` | `@kilocode/sdk/v2` | `KilocodeSessionImportProjectData` |
| 33 | `src/legacy-migration/sessions/parser.ts:7` | `@kilocode/sdk/v2` | multiple session import types |

---

### All @kilocode/kilo-ui imports in webview-ui/

(See summary table above — 334 total import statements across 88 unique subpaths in ~70 files)

### All @kilocode/kilo-i18n imports in webview-ui/

(18 locale imports, all in `webview-ui/src/context/language.tsx`)

---

## Recommended Fix Strategy

### Priority 1: tsconfig `paths` mapping (recommended)

Add path aliases to both tsconfig files so imports resolve without the monorepo:

**`kilocode/packages/kilo-vscode/tsconfig.json`** — add `paths`:
```json
{
  "compilerOptions": {
    "paths": {
      "@kilocode/sdk/v2/client": ["../sdk/js/src/v2/client/index.ts"],
      "@kilocode/sdk/v2": ["../sdk/js/src/v2/index.ts"]
    }
  }
}
```

**`kilocode/packages/kilo-vscode/webview-ui/tsconfig.json`** — add `paths`:
```json
{
  "compilerOptions": {
    "paths": {
      "@kilocode/kilo-ui/*": ["../../kilo-ui/src/*"],
      "@kilocode/kilo-i18n/*": ["../../kilo-i18n/src/*"],
      "@kilocode/sdk/v2/client": ["../../../sdk/js/src/v2/client/index.ts"],
      "@kilocode/sdk/v2": ["../../../sdk/js/src/v2/index.ts"],
      "@opencode-ai/ui/*": ["../../ui/src/*"]
    }
  }
}
```

**esbuild.js** must also be updated to resolve these aliases at build time (esbuild does not read tsconfig `paths`).

### Priority 2: Fix direct child_process imports

Replace the two value-imports from `child_process` with the safe wrappers from `src/util/process.ts`:

- `src/services/tool-execution/tool-execution-service.ts:3` — replace `spawn` import
- `src/agent-manager/git-transfer.ts:3` — replace `cp` import

### Priority 3: Resolve @opencode-ai/ui dependency

The single `@opencode-ai/ui/icons/provider` import needs either:
- A `paths` mapping (if ui package is available)
- A local copy of the provider icon names

### Priority 4: Review @anthropic-ai/sdk dependency

Consider whether `@anthropic-ai/sdk` should remain as a runtime dependency for a single type reference in legacy migration code.

---

## Non-Issues (Confirmed Working)

- **VS Code `vscode` module**: Resolves via `@types/vscode` devDependency + esbuild `external`. Correct.
- **Relative imports**: All resolve correctly. No broken paths found.
- **Node.js built-ins** (`path`, `fs`, `fs/promises`, `os`, `url`, `crypto`, `assert`, `util`, `child_process`): All resolve correctly in the Node.js extension context.
- **Third-party npm packages** (`diff`, `fastest-levenshtein`, `friendly-words`, `ignore`, `js-tiktoken`, `lru-cache`, `openai`, `quick-lru`, `simple-git`, `solid-js`, `uri-js`, `web-tree-sitter`, `yaml`, `zod`): All listed in `dependencies` and resolve correctly.
- **vitest imports**: Only in test files (excluded from tsconfig compilation).
- **@continuedev imports**: Only in markdown docs and test fixtures, not in compiled source.
