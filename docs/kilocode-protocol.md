# KiloCode Extension-to-CLI Communication Protocol

This document describes how the KiloCode VS Code extension (`packages/kilo-vscode/`) communicates with the CLI backend (`packages/opencode/`) — the HTTP/SSE protocol, API endpoints, event types, and VS Code API dependencies.

## Architecture Overview

All KiloCode products are thin clients over the **CLI** (`packages/opencode/`, published as `@kilocode/cli`). The CLI is a fork of upstream OpenCode with Kilo-specific additions (gateway auth, telemetry, migration, code review, branding). It contains the full AI agent runtime, tool execution, session management, provider integrations (500+ models), and an HTTP API server.

```
                        @kilocode/cli  (packages/opencode/)
                     ┌────────────────────────────────┐
                     │  AI agents, tools, sessions,    │
                     │  providers, config, MCP, LSP    │
                     │  Hono HTTP server + SSE         │
                     └──┬──────────┬──────────┬───────┘
                        │          │          │
                ┌───────┴──┐ ┌────┴────┐ ┌───┴──────────┐
                │ TUI      │ │ VS Code │ │ Desktop / Web│
                │ (builtin)│ │Extension│ │              │
                └──────────┘ └─────────┘ └──────────────┘
```

The VS Code extension bundles its own CLI binary at `bin/kilo` and spawns `kilo serve --port 0` as a child process. Communication is over HTTP REST + SSE using the auto-generated `@kilocode/sdk`.

## Sequence Diagram: Extension-CLI Communication

```
Extension Host (Node.js)                          CLI Backend (child process)
┌──────────────────────────┐                      ┌──────────────────────┐
│                          │                      │                      │
│ 1. activate()            │                      │                      │
│    ├─ new KiloConnection │                      │                      │
│    ├─ new KiloProvider   │                      │                      │
│    └─ register commands  │                      │                      │
│                          │                      │                      │
│ 2. Webview connects      │                      │                      │
│    connectionService     │                      │                      │
│    .connect(workspaceDir)│                      │                      │
│         │                │                      │                      │
│         ├─ ServerManager │                      │                      │
│         │  .getServer()  │                      │                      │
│         │    │           │                      │                      │
│         │    ├─ generate │                      │                      │
│         │    │  password │                      │                      │
│         │    │           │                      │                      │
│         │    ├─ spawn    │─── spawn ──────────> │ kilo serve --port 0  │
│         │    │  "kilo    │   env:               │   env:               │
│         │    │  serve    │   KILO_SERVER_       │   KILO_SERVER_       │
│         │    │  --port 0"│   PASSWORD=<rand>    │   PASSWORD=<rand>    │
│         │    │           │   KILO_CLIENT=vscode │   KILO_CLIENT=vscode │
│         │    │           │                      │                      │
│         │    │<── stdout ─│───────────────────── │ "Server on :<port>"  │
│         │    │  ":<port>"│                      │                      │
│         │    │           │                      │                      │
│         │    └─ return   │                      │                      │
│         │      {port,    │                      │                      │
│         │       password}│                      │                      │
│         │                │                      │                      │
│         ├─ createKilo    │                      │                      │
│         │  Client()      │                      │                      │
│         │  Basic Auth:   │                      │                      │
│         │  kilo:<pass>   │                      │                      │
│         │                │                      │                      │
│         ├─ new SdkSSE    │                      │                      │
│         │  Adapter(client)                      │                      │
│         │                │                      │                      │
│         ├─ sseClient     │── GET /event ──────> │ SSE stream open      │
│         │  .connect()    │   <───────────────── │ server.connected     │
│         │                │                      │                      │
│         ├─ startHealth   │                      │                      │
│         │  Poll()        │── GET /global/health─>│ {healthy:true}       │
│         │  (every 10s)   │   <───────────────── │ 200 OK               │
│         │                │                      │                      │
│         └─ setState      │                      │                      │
│            "connected"   │                      │                      │
│                          │                      │                      │
│ 3. Webview requests      │                      │                      │
│    "newSession"          │                      │                      │
│         │                │                      │                      │
│         ├─ POST          │── POST /session/ ──> │ Create session       │
│         │  /session/     │   <───────────────── │ {id, ...}            │
│         │                │                      │                      │
│         ├─ POST          │── POST /session/:id/─>│ Stream AI response   │
│         │  /session/:id/ │  message (stream)    │ (JSON stream)        │
│         │  message       │                      │                      │
│         │                │                      │                      │
│         │<── SSE events ─│───────────────────── │ session.created      │
│         │                │                      │ message.part.delta   │
│         │                │                      │ message.updated      │
│         │                │                      │ permission.asked     │
│         │                │                      │ todo.updated         │
│         │                │                      │                      │
│         └─ webview.      │                      │                      │
│            postMessage() │── postMessage ─────> │ Webview (Solid.js)   │
│                          │                      │                      │
│ 4. User grants           │                      │                      │
│    permission            │                      │                      │
│         │                │                      │                      │
│    webview               │                      │                      │
│    postMessage()         │<── onMessage ─────── │ {type:"permission    │
│    {type:"permission     │                      │  response",...}      │
│    response"}            │                      │                      │
│         │                │                      │                      │
│         ├─ POST          │── POST /permission/  │ Reply to permission  │
│         │  /permission/  │  :id/reply ────────> │                      │
│         │  :id/reply     │                      │                      │
│         │                │                      │                      │
│ 5. Disconnect/dispose    │                      │                      │
│         │                │                      │                      │
│         ├─ sseClient     │                      │                      │
│         │  .dispose()    │── abort ───────────> │ SSE stream closed    │
│         │                │                      │                      │
│         ├─ serverManager │                      │                      │
│         │  .dispose()    │── SIGTERM ──────────>│ Graceful shutdown    │
│         │                │── SIGKILL (5s) ────> │ Force kill if needed │
│         │                │                      │                      │
└──────────────────────────┘                      └──────────────────────┘
```

## 1. KiloConnectionService — CLI Backend Lifecycle

**File:** `src/services/cli-backend/connection-service.ts`

`KiloConnectionService` is a singleton shared across all webview providers (sidebar, Agent Manager, tab panels). It owns the server process, SDK client, and SSE adapter.

### Lifecycle

| Phase | Method | Description |
|-------|--------|-------------|
| **Spawn** | `doConnect(workspaceDir)` | Calls `ServerManager.getServer()` which spawns `bin/kilo serve --port 0` as a detached child process with a random 64-char hex password via `KILO_SERVER_PASSWORD` env var. Port is parsed from stdout. |
| **Connect** | `connect(workspaceDir)` | Creates SDK client with Basic Auth (`kilo:<password>`), creates `SdkSSEAdapter`, calls `sseClient.connect()`, waits for SSE to reach "connected" state. Multiple callers share the same promise. |
| **Health Check** | `startHealthPoll()` | Polls `GET /global/health` every 10 seconds. If health fails while connected, forces SSE reconnect. Timer is unref'd so it doesn't keep the extension host alive. |
| **Disconnect** | `dispose()` | Stops health poll, disposes SSE adapter, kills server process (SIGTERM, then SIGKILL after 5s), clears all listeners. |

### ServerManager Process Spawning

**File:** `src/services/cli-backend/server-manager.ts`

- Binary path: `<extensionPath>/bin/kilo` (or `kilo.exe` on Windows)
- Command: `kilo serve --port 0` (port 0 = OS assigns a free port)
- Env vars passed to CLI:
  - `KILO_SERVER_PASSWORD` — random 64-char hex string
  - `KILO_CLIENT` — `"vscode"`
  - `KILO_ENABLE_QUESTION_TOOL` — `"true"`
  - `KILOCODE_FEATURE` — `"vscode-extension"`
  - `KILO_TELEMETRY_LEVEL` — `"all"` or `"off"` (from `vscode.env.isTelemetryEnabled`)
  - `KILO_APP_NAME` — `"kilo-code"`
  - `KILO_EDITOR_NAME` — `vscode.env.appName`
  - `KILO_PLATFORM` — `"vscode"`
  - `KILO_MACHINE_ID` — `vscode.env.machineId`
  - `KILO_APP_VERSION` — extension version from package.json
  - `KILO_VSCODE_VERSION` — `vscode.version`
- Startup timeout: 30 seconds
- Process group kill: negative PID on Unix (kills entire group), direct kill on Windows
- Graceful shutdown: SIGTERM, then SIGKILL after 5s

### SdkSSEAdapter

**File:** `src/services/cli-backend/sdk-sse-adapter.ts`

- Consumes `client.global.event()` AsyncGenerator from the SDK
- Reconnection loop: outer `while (!aborted)` with per-attempt AbortController
- Heartbeat timeout: 15 seconds (server sends heartbeats every 10s)
- Reconnect delay: 250ms
- SDK internal retries disabled (`sseMaxRetryAttempts: 1`) — the adapter handles reconnection itself
- States: `connecting` → `connected` → `disconnected` (or `error`)

### Event Subscription Model

```
KiloConnectionService
├── onEvent(listener)              — raw SSE events to all listeners
├── onEventFiltered(filter, fn)    — filtered SSE events
├── onStateChange(listener)        — connection state changes
├── onNotificationDismissed(fn)    — cross-provider notification dismiss
├── onLanguageChanged(fn)          — cross-provider language changes
├── onProfileChanged(fn)           — cross-provider profile changes
└── onMigrationComplete(fn)        — cross-provider migration complete
```

### Session ID Resolution

**File:** `src/services/cli-backend/connection-utils.ts`

`resolveEventSessionId(event)` extracts the session ID from each SSE event type. For `message.part.updated`, it falls back to a `messageID -> sessionID` mapping cache built from `message.updated` events.

## 2. SSE Event Protocol

Events flow from CLI to extension via two SSE endpoints:

| Endpoint | Scope | Description |
|----------|-------|-------------|
| `GET /event` | Per-instance (project directory) | Events for a single project workspace |
| `GET /global/event` | Global (all projects) | Events from all projects, wrapped as `{ directory, payload: Event }` |

The extension uses `GET /event` (per-instance) via `client.global.event()`.

### SSE Event Types Handled by Extension

| Event Type | Webview Message Type | Description |
|------------|---------------------|-------------|
| `session.created` | `sessionCreated` | New session created |
| `session.updated` | `sessionUpdated` | Session properties changed |
| `session.status` | `sessionStatus` | Session is busy/idle/retry |
| `session.idle` | (ignored) | Deprecated |
| `session.error` | `sessionError` | Session encountered an error |
| `message.updated` | `messageCreated` | Message completed with all parts |
| `message.part.updated` | `partUpdated` | Message part state changed |
| `message.part.delta` | `partUpdated` (with delta) | Streaming text delta |
| `message.removed` | `messageRemoved` | Message deleted |
| `permission.asked` | `permissionRequest` | Tool requires user approval |
| `permission.replied` | `permissionResolved` | Permission was answered |
| `question.asked` | `questionRequest` | Question tool needs user input |
| `question.replied` | `questionResolved` | Question was answered |
| `question.rejected` | `questionResolved` | Question was rejected |
| `todo.updated` | `todoUpdated` | Todo list changed |
| `global.disposed` | (handled internally) | Server shutting down |
| `global.config.updated` | (handled internally) | Global config changed |
| `server.instance.disposed` | (handled internally) | Instance disposed |
| `server.connected` | (handled internally) | SSE connection established |
| `server.heartbeat` | (handled internally) | Keepalive every 10s |

### SSE → Webview Message Mapping

**File:** `src/kilo-provider-utils.ts` — `mapSSEEventToWebviewMessage()`

SSE events are transformed into `WebviewMessage` objects and sent to webviews via `webview.postMessage()`. The mapping handles:

- **Delta coalescing**: `message.part.delta` events include a `delta: { type: "text-delta", textDelta }` field for streaming text rendering
- **Session scoping**: Events are filtered per-webview via `trackedSessionIds` Set
- **Foreign project filtering**: Events from other projects (different `projectID`) are dropped
- **Null safety**: Events that can't be mapped to a session return `null` and are dropped

## 3. OpenAPI SDK Client

The SDK at `@kilocode/sdk/v2/client` is auto-generated from the OpenAPI spec. The extension creates a client via `createKiloClient({ baseUrl, headers })`.

### HTTP Endpoints Called by Extension

#### Session Endpoints

| SDK Method | HTTP Request | Purpose |
|------------|-------------|---------|
| `client.session.create()` | `POST /session/` | Create a new session |
| `client.session.get(id)` | `GET /session/:sessionID` | Get session details |
| `client.session.messages(id)` | `GET /session/:sessionID/message` | Get all messages in a session |
| `client.session.delete(id)` | `DELETE /session/:sessionID` | Delete a session |
| `client.session.update(id, data)` | `PATCH /session/:sessionID` | Update session title/archive |
| `client.session.promptAsync(id, data)` | `POST /session/:sessionID/prompt_async` | Send prompt asynchronously |
| `client.session.command(id, data)` | `POST /session/:sessionID/command` | Execute a command |
| `client.session.abort(id)` | `POST /session/:sessionID/abort` | Abort active session |
| `client.session.revert(id, data)` | `POST /session/:sessionID/revert` | Revert a message (undo changes) |
| `client.session.unrevert(id)` | `POST /session/:sessionID/unrevert` | Restore reverted messages |
| `client.session.summarize(id, data)` | `POST /session/:sessionID/summarize` | Generate AI summary |
| `client.session.status()` | `GET /session/status` | Get status of all sessions |

#### Config Endpoints

| SDK Method | HTTP Request | Purpose |
|------------|-------------|---------|
| `client.config.get()` | `GET /config/` | Get project configuration |
| `client.global.config.get()` | `GET /global/config` | Get global configuration |
| `client.global.config.update(data)` | `PATCH /global/config` | Update global configuration |
| `client.global.dispose()` | `POST /global/dispose` | Dispose all instances |

#### Provider/Agent Endpoints

| SDK Method | HTTP Request | Purpose |
|------------|-------------|---------|
| `client.provider.list()` | `GET /provider/` | List all AI providers |
| `client.app.agents()` | `GET /agent` | List all available agents |
| `client.app.skills()` | `GET /skill` | List all available skills |
| `client.command.list()` | `GET /command` | List all available commands |

#### MCP Endpoints

| SDK Method | HTTP Request | Purpose |
|------------|-------------|---------|
| `client.mcp.status()` | `GET /mcp/` | Get MCP server status |
| `client.mcp.connect(name)` | `POST /mcp/:name/connect` | Connect an MCP server |
| `client.mcp.disconnect(name)` | `POST /mcp/:name/disconnect` | Disconnect an MCP server |

#### Kilo Cloud Endpoints

| SDK Method | HTTP Request | Purpose |
|------------|-------------|---------|
| `client.kilo.profile()` | `GET /kilo/profile` | Get user profile |
| `client.kilo.notifications()` | `GET /kilo/notifications` | Get notifications |

#### Kilocode Endpoints

| SDK Method | HTTP Request | Purpose |
|------------|-------------|---------|
| `client.kilocode.removeSkill(data)` | `POST /kilocode/skill/remove` | Remove a skill |
| `client.kilocode.removeAgent(data)` | `POST /kilocode/agent/remove` | Remove a custom agent |

#### Utility Endpoints

| SDK Method | HTTP Request | Purpose |
|------------|-------------|---------|
| `client.find.files(query)` | `GET /find/file?query=` | Search for files by name |
| `client.enhancePrompt.enhance(data)` | `POST /enhance-prompt/` | Rewrite/enhance a prompt |
| `client.instance.dispose()` | `POST /instance/dispose` | Dispose current instance |

#### SSE Endpoint

| SDK Method | HTTP Request | Purpose |
|------------|-------------|---------|
| `client.global.event()` | `GET /global/event` | SSE event stream (used by SdkSSEAdapter) |

## 4. Webview Event Subscription

### Extension → Webview

The extension sends messages to webviews via `vscode.Webview.postMessage()`:

```
KiloProvider.postMessage(message)
  → webview.postMessage(message)
    → window.addEventListener("message", handler)  [in webview]
      → VSCodeProvider.onMessage(handler)  [Solid.js context]
        → Component consumes via useVSCode()
```

**Key messages sent to webview:**

| Message Type | Trigger |
|-------------|---------|
| `partUpdated` | SSE `message.part.updated` or `message.part.delta` |
| `messageCreated` | SSE `message.updated` |
| `messageRemoved` | SSE `message.removed` |
| `sessionStatus` | SSE `session.status` |
| `sessionCreated` | SSE `session.created` |
| `sessionUpdated` | SSE `session.updated` |
| `sessionError` | SSE `session.error` |
| `permissionRequest` | SSE `permission.asked` |
| `permissionResolved` | SSE `permission.replied` |
| `permissionError` | Permission reply failed |
| `questionRequest` | SSE `question.asked` |
| `questionResolved` | SSE `question.replied` or `question.rejected` |
| `todoUpdated` | SSE `todo.updated` |
| `sessionsLoaded` | HTTP `GET /session/` response |
| `providersLoaded` | HTTP `GET /provider/` response (cached) |
| `agentsLoaded` | HTTP `GET /agent` response (cached) |
| `skillsLoaded` | HTTP `GET /skill` response (cached) |
| `commandsLoaded` | HTTP `GET /command` response (cached) |
| `configLoaded` | HTTP `GET /config/` response (cached) |
| `mcpStatusLoaded` | HTTP `GET /mcp/` response (cached) |
| `notificationsLoaded` | HTTP `GET /kilo/notifications` response |
| `connectionStateChanged` | Connection state change |
| `workspaceDirectoryChanged` | Project directory changed |
| `error` | Error conditions |

### Webview → Extension

The webview sends messages to the extension via `acquireVsCodeApi().postMessage()`:

```
Webview: acquireVsCodeApi().postMessage(message)
  → webview.onDidReceiveMessage(handler)  [in KiloProvider]
    → handleWebviewMessage(message)
```

**Key messages received from webview:**

| Message Type | Handler Action |
|-------------|---------------|
| `newSession` | Create new session via HTTP |
| `sendMessage` | Send prompt to session |
| `cancelRequest` | Abort session |
| `loadMessages` | Load session message history |
| `loadSession` | Load session details |
| `deleteSession` | Delete session |
| `requestSessions` | List all sessions |
| `requestProviders` | List AI providers |
| `requestAgents` | List agents |
| `requestSkills` | List skills |
| `requestCommands` | List commands |
| `requestConfig` | Get configuration |
| `updateConfig` | Update configuration |
| `requestMcpStatus` | Get MCP status |
| `connectMcpServer` | Connect MCP server |
| `disconnectMcpServer` | Disconnect MCP server |
| `permissionResponse` | Reply to permission request |
| `questionResponse` | Answer question |
| `questionReject` | Reject question |
| `revertChange` | Revert a message |
| `unrevertChange` | Restore reverted messages |
| `summarizeSession` | Generate summary |
| `deleteMessage` | Delete a message |
| `enhancePrompt` | Enhance prompt text |
| `requestNotifications` | Get notifications |
| `dismissNotification` | Dismiss a notification |
| `login` / `logout` | Auth operations |
| `requestProfileData` | Get profile info |
| `requestCloudSessions` | Get cloud sessions |
| `importCloudSession` | Import from cloud |
| Various `request*` | Fetch cached data |

### Webview UI Architecture

**Framework:** Solid.js (not React) — JSX compiles via `esbuild-plugin-solid`

**Provider hierarchy** (`webview-ui/src/App.tsx`):
```
ThemeProvider → I18nProvider → DialogProvider → MarkedProvider 
  → VSCodeProvider → ServerProvider → ProviderProvider → SessionProvider
```

**VS Code API wrapper** (`webview-ui/src/context/vscode.tsx`):
- Wraps `acquireVsCodeApi()` global
- Provides `postMessage()`, `onMessage()`, `getState()`, `setState()`
- Registers `window.addEventListener("message")` for incoming extension messages

**Builds:** Two separate esbuild targets:
- Extension (Node/CJS): `src/extension.ts` → `dist/extension.js`
- Webview (browser/IIFE): `webview-ui/src/index.tsx` → `dist/webview.js`
- Agent Manager (browser/IIFE): `webview-ui/agent-manager/index.tsx` → `dist/agent-manager.js`

## 5. KiloProvider vs AgentManagerProvider

### KiloProvider

**File:** `src/KiloProvider.ts`

| Aspect | Detail |
|--------|--------|
| **View type** | `kilo-code.SidebarProvider` (sidebar) and `kilo-code.new.TabPanel` (editor tabs) |
| **Registration** | `vscode.window.registerWebviewViewProvider()` for sidebar; `vscode.window.createWebviewPanel()` for tabs |
| **Connection** | Subscribes to `KiloConnectionService.onEvent()` for SSE events |
| **Event filtering** | Uses `trackedSessionIds` Set to filter events per-webview |
| **Session model** | Single active session at a time (`currentSession`) |
| **HTTP calls** | Makes all SDK calls directly (sessions, config, providers, agents, MCP, etc.) |
| **Caching** | Cached messages for providers, agents, skills, commands, config, MCP status — served to webview immediately before HTTP round-trip |
| **State persistence** | No dedicated state file — relies on CLI backend |
| **Features** | Chat, permissions, questions, todos, sessions, providers, agents, skills, MCP, auth, cloud sessions, marketplace, notifications, autocomplete settings, browser settings |

### AgentManagerProvider

**File:** `src/agent-manager/AgentManagerProvider.ts`

| Aspect | Detail |
|--------|--------|
| **View type** | `kilo-code.new.AgentManagerPanel` (editor panel) |
| **Registration** | `VscodeHost` creates `vscode.WebviewPanel` instances |
| **Connection** | Subscribes to `KiloConnectionService.onEvent()` for SSE events (same shared connection) |
| **Event filtering** | Filters events by its own managed session IDs |
| **Session model** | Multiple parallel sessions with tabbed UI |
| **HTTP calls** | Makes SDK calls for its sessions (messages, diffs, status) |
| **State persistence** | `.kilo/agent-manager.json` via `WorktreeStateManager` |
| **Git isolation** | Each session can get its own git worktree branch |
| **Terminals** | Dedicated VS Code terminal per session via `SessionTerminalManager` |
| **Setup scripts** | Configurable `.kilo/setup-script` runs per worktree |
| **Multi-version** | Up to 4 parallel worktrees with the same prompt |
| **Features** | Worktree management, session forking, diff viewing, terminal management, setup scripts, git operations |

### Key Difference: Connection Sharing

Both providers share the **single `kilo serve` process** managed by `KiloConnectionService`. No separate server is spawned per provider. Session isolation comes from directory scoping — worktree sessions pass the worktree path to the CLI backend, which creates a session scoped to that directory.

```
KiloConnectionService (singleton)
├── ServerManager (one child process: kilo serve --port 0)
├── KiloClient (one SDK client)
├── SdkSSEAdapter (one SSE connection)
│
├── KiloProvider (sidebar) — subscribes to events
├── KiloProvider (tab panel) — subscribes to events
├── AgentManagerProvider — subscribes to events
├── DiffViewerProvider — subscribes to events
├── SettingsEditorProvider — subscribes to events
└── SubAgentViewerProvider — subscribes to events
```

## 6. VS Code API Dependencies

The extension uses the following VS Code APIs. All must be preserved for a compatible replacement.

### vscode.window

| API | Usage |
|-----|-------|
| `registerWebviewViewProvider` | Register sidebar panel (`kilo-code.SidebarProvider`) |
| `registerWebviewPanelSerializer` | Restore panels on VS Code restart (Agent Manager, tabs, settings, diff) |
| `createWebviewPanel` | Create editor tab panels (Open in Tab, Agent Manager, settings, diff, sub-agent) |
| `showInformationMessage` | User notifications |
| `showWarningMessage` | User warnings |
| `showErrorMessage` | Error notifications |
| `showInputBox` | User text input (e.g., terminal command generation) |
| `withProgress` | Progress reporting for long operations |
| `registerUriHandler` | Deep link handling (`vscode://kilocode.kilo-code/kilocode/s/{sessionId}`) |
| `activeTextEditor` | Get active editor for context |
| `visibleTextEditors` | Get visible editors for column calculation |
| `onDidChangeTextEditorSelection` | Track editor selection changes |
| `createOutputChannel` | Logging (Kilo Code, Agent Manager) |
| `createTerminal` | Per-session terminals in Agent Manager |
| `registerCodeActionsProvider` | Register code action provider |

### vscode.workspace

| API | Usage |
|-----|-------|
| `getConfiguration` | Read extension settings |
| `onDidChangeConfiguration` | React to settings changes |
| `onDidChangeTextDocument` | Track document changes |
| `openTextDocument` | Open files |
| `showTextDocument` | Show files in editor |
| `asRelativePath` | Convert absolute paths to workspace-relative |
| `workspaceFolders` | Get workspace root directories |
| `fs.readDirectory` | Read directory contents |
| `fs.writeFile` | Write files |
| `fs.createDirectory` | Create directories |
| `fs.delete` | Delete files/directories |
| `getDiagnostics` | Get editor diagnostics (errors/warnings) |

### vscode.commands

| API | Usage |
|-----|-------|
| `registerCommand` | Register all `kilo-code.new.*` commands |
| `executeCommand` | Execute built-in and extension commands |
| `registerCodeActionsProvider` | Register code actions (lightbulb quick fixes) |

### vscode.languages

| API | Usage |
|-----|-------|
| `registerCodeActionsProvider` | Register code action provider for all file schemes |
| `getDiagnostics` | Get language diagnostics |

### vscode.env

| API | Usage |
|-----|-------|
| `appName` | Editor name (passed to CLI as `KILO_EDITOR_NAME`) |
| `language` | UI language |
| `machineId` | Machine ID (passed to CLI as `KILO_MACHINE_ID`) |
| `isTelemetryEnabled` | Telemetry toggle |
| `shell` | User's default shell |
| `openExternal` | Open URLs in browser (OAuth flows) |
| `clipboard` | Clipboard access |

### vscode.extensions

| API | Usage |
|-----|-------|
| `getExtension` | Get self (for version), Git extension |

### vscode.Uri

| API | Usage |
|-----|-------|
| `file` | Create file URIs |
| `joinPath` | Build paths relative to extension URI |
| `parse` | Parse URI strings |

### vscode.ConfigurationTarget

| API | Usage |
|-----|-------|
| `Global` | User-level settings |
| `Workspace` | Workspace-level settings |
| `WorkspaceFolder` | Folder-level settings |

### vscode.Position / vscode.Range

| API | Usage |
|-----|-------|
| `Position` | Editor cursor positions |
| `Range` | Selection ranges for code context |

### vscode.ViewColumn

| API | Usage |
|-----|-------|
| `ViewColumn.One`, `Two`, etc. | Panel positioning in editor groups |

### vscode.Disposable

| API | Usage |
|-----|-------|
| `Disposable` | Resource cleanup pattern |

### vscode.ExtensionContext

| API | Usage |
|-----|-------|
| `subscriptions` | Register disposables for cleanup |
| `extensionPath` | Extension install directory (finds `bin/kilo`) |
| `extensionUri` | Extension URI (for webview resource roots) |
| `globalState` | Persistent extension state |
| `secrets` | Secure storage (OAuth tokens, API keys) |
| `globalStorageUri` | Persistent storage directory |

## 7. CLI Server API Endpoint Reference

**Framework:** Hono (HTTP server on Bun.serve)
**OpenAPI spec:** Available at `GET /doc`

### Authentication Model

Three layers:

1. **Server-level Basic Auth** (optional): Controlled by `KILO_SERVER_PASSWORD` and `KILO_SERVER_USERNAME` (default: `"kilo"`) env vars. If no password is set, auth is skipped. The extension always uses Basic Auth with username `kilo` and the randomly generated password.

2. **Provider Auth** (per-AI-Provider): Stored in `~/.local/share/kilo/data/auth.json` (file permissions `0o600`). Three types: `oauth` (OAuth tokens), `api` (API key), `wellknown` (pre-configured token). Set via `PUT /auth/:providerID`.

3. **MCP OAuth**: MCP servers can have their own OAuth flows via `/mcp/:name/auth/*` endpoints.

### Middleware Pipeline

1. **Error Handler** — Maps errors to HTTP status codes
2. **CORS Preflight Bypass** — OPTIONS requests skip auth
3. **Request Logger** — Logs method + path + duration
4. **CORS** — Allows `localhost:*`, `127.0.0.1:*`, `tauri://localhost`, `*.opencode.ai` (https only)
5. **Workspace/Instance Context** — Extracts `workspace` and `directory` params, wraps in `WorkspaceContext` and `Instance.provide` for per-project lazy singleton state
6. **Query Validator** — Validates `directory` and `workspace` query params

### Complete Route Reference

#### Global Routes (`/global`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/global/health` | Health check — `{ healthy: true, version }` |
| GET | `/global/event` | SSE stream of global events (all projects). Heartbeat every 10s |
| GET | `/global/config` | Get global configuration |
| PATCH | `/global/config` | Update global configuration |
| POST | `/global/dispose` | Dispose all instances, reset config |

#### Auth Routes

| Method | Path | Description |
|--------|------|-------------|
| PUT | `/auth/:providerID` | Set auth for a provider (oauth/api/wellknown) |
| DELETE | `/auth/:providerID` | Remove auth for a provider |

#### Project Routes (`/project`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/project/` | List all projects |
| GET | `/project/current` | Get current project |
| POST | `/project/git/init` | Initialize git repo |
| PATCH | `/project/:projectID` | Update project properties |

#### PTY Routes (`/pty`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/pty/` | List active PTY sessions |
| POST | `/pty/` | Create PTY session |
| GET | `/pty/:ptyID` | Get PTY session info |
| PUT | `/pty/:ptyID` | Update PTY session |
| DELETE | `/pty/:ptyID` | Remove PTY session |
| GET | `/pty/:ptyID/connect` | **WebSocket** — real-time PTY I/O |

#### MCP Routes (`/mcp`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/mcp/` | Status of all MCP servers |
| POST | `/mcp/` | Add MCP server |
| POST | `/mcp/:name/auth` | Start OAuth for MCP server |
| POST | `/mcp/:name/auth/callback` | Complete OAuth callback |
| POST | `/mcp/:name/auth/authenticate` | Start OAuth and wait for completion |
| DELETE | `/mcp/:name/auth` | Remove MCP OAuth credentials |
| POST | `/mcp/:name/connect` | Connect MCP server |
| POST | `/mcp/:name/disconnect` | Disconnect MCP server |

#### File Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/find?pattern=` | Text search via ripgrep |
| GET | `/find/file?query=` | File/directory search by name |
| GET | `/find/symbol?query=` | Workspace symbol search via LSP |
| GET | `/file?path=` | List files at path |
| GET | `/file/content?path=` | Read file content |
| GET | `/file/status` | Git status of all files |

#### Config Routes (`/config`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/config/` | Get project configuration |
| PATCH | `/config/` | Update project configuration |
| GET | `/config/providers` | List providers with default models |

#### Session Routes (`/session`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/session/` | List sessions |
| GET | `/session/status` | Status of all sessions |
| GET | `/session/:sessionID` | Get session details |
| GET | `/session/:sessionID/children` | Get child sessions |
| GET | `/session/:sessionID/todo` | Get todo list |
| GET | `/session/:sessionID/message` | Get all messages |
| GET | `/session/:sessionID/message/:messageID` | Get specific message |
| POST | `/session/` | Create new session |
| POST | `/session/:sessionID/init` | Initialize with AGENTS.md |
| POST | `/session/:sessionID/fork` | Fork session at message |
| POST | `/session/:sessionID/abort` | Abort active session |
| POST | `/session/:sessionID/share` | Create shareable link |
| POST | `/session/:sessionID/summarize` | Generate AI summary |
| POST | `/session/:sessionID/prompt_async` | Send prompt async (204) |
| POST | `/session/:sessionID/command` | Execute command |
| POST | `/session/:sessionID/shell` | Execute shell command |
| POST | `/session/:sessionID/revert` | Revert message (undo changes) |
| POST | `/session/:sessionID/unrevert` | Restore reverted messages |
| POST | `/session/:sessionID/message` | **Streaming** — send prompt, stream AI response |
| PATCH | `/session/:sessionID` | Update session properties |
| DELETE | `/session/:sessionID` | Delete session |
| DELETE | `/session/:sessionID/message/:messageID` | Delete message |
| DELETE | `/session/:sessionID/message/:messageID/part/:partID` | Delete message part |
| DELETE | `/session/:sessionID/share` | Remove shareable link |
| PATCH | `/session/:sessionID/message/:messageID/part/:partID` | Update message part |
| GET | `/session/:sessionID/diff?messageID=` | Get file diff from message |
| POST | `/session/viewed` | Set currently viewed session |

#### Permission Routes (`/permission`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/permission/` | List pending permission requests |
| POST | `/permission/:requestID/reply` | Approve/deny permission (`once`/`always`/`reject`) |
| POST | `/permission/:requestID/always-rules` | Save always-allow/deny rules |

#### Question Routes (`/question`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/question/` | List pending question requests |
| POST | `/question/:requestID/reply` | Answer question |
| POST | `/question/:requestID/reject` | Reject question |

#### Provider Routes (`/provider`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/provider/` | List all AI providers |
| GET | `/provider/auth` | Get auth methods for all providers |
| POST | `/provider/:providerID/oauth/authorize` | Initiate OAuth |
| POST | `/provider/:providerID/oauth/callback` | Handle OAuth callback |

#### Other Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/agent` | List all agents |
| GET | `/skill` | List all skills |
| GET | `/command` | List all commands |
| GET | `/path` | Get path info (home, state, config, etc.) |
| GET | `/vcs` | Get VCS info (branch) |
| GET | `/lsp` | LSP server status |
| GET | `/formatter` | Formatter status |
| GET | `/doc` | OpenAPI documentation |
| POST | `/instance/dispose` | Dispose current instance |
| POST | `/log` | Write log entry |
| POST | `/telemetry/capture` | Forward telemetry to PostHog |
| POST | `/enhance-prompt/` | Rewrite/enhance a prompt |
| POST | `/commit-message/` | Generate commit message from diff |
| POST | `/kilocode/skill/remove` | Remove a skill |
| POST | `/kilocode/agent/remove` | Remove a custom agent |
| GET | `/event` | SSE — per-instance event stream |
| POST | `/remote/enable` | Enable WebSocket relay |
| POST | `/remote/disable` | Disable WebSocket relay |
| GET | `/remote/status` | Remote connection status |

### SSE Event Types (Server Side)

#### Server Events

| Event Type | Properties |
|------------|-----------|
| `server.connected` | `{}` — sent on SSE connect |
| `server.heartbeat` | `{}` — sent every 10s |
| `server.instance.disposed` | `{ directory }` |

#### Session Events

| Event Type | Properties |
|------------|-----------|
| `session.created` | `{ info: Session.Info }` |
| `session.updated` | `{ info: Session.Info }` |
| `session.deleted` | `{ info: Session.Info }` |
| `session.error` | `{ sessionID?, error }` |
| `session.status` | `{ sessionID, status: SessionStatus.Info }` |
| `session.idle` | `{ sessionID }` (deprecated) |
| `session.compacted` | `{ sessionID }` |
| `session.diff` | `{ sessionID, diff: FileDiff[] }` |
| `session.turn.open` | `{ sessionID }` |
| `session.turn.close` | `{ sessionID, reason }` |

#### Message Events

| Event Type | Properties |
|------------|-----------|
| `message.updated` | `{ info: MessageV2.Info }` |
| `message.removed` | `{ sessionID, messageID }` |
| `message.part.updated` | `{ part: MessageV2.Part }` |
| `message.part.delta` | `{ sessionID, messageID, partID, field, delta }` |
| `message.part.removed` | `{ sessionID, messageID, partID }` |

#### Todo Events

| Event Type | Properties |
|------------|-----------|
| `todo.updated` | `{ sessionID, todos: Todo.Info[] }` |

#### Permission Events

| Event Type | Properties |
|------------|-----------|
| `permission.asked` | `{ ...PermissionNext.Request }` |
| `permission.replied` | `{ sessionID, requestID, reply }` |
| `permission.updated` | `{ ...Permission.Info }` |

#### Question Events

| Event Type | Properties |
|------------|-----------|
| `question.asked` | `{ ...Question.Request }` |
| `question.replied` | `{ sessionID, requestID, answers }` |
| `question.rejected` | `{ sessionID, requestID }` |

#### PTY Events

| Event Type | Properties |
|------------|-----------|
| `pty.created` | `{ info: Pty.Info }` |
| `pty.updated` | `{ info: Pty.Info }` |
| `pty.exited` | `{ id, exitCode }` |
| `pty.deleted` | `{ id }` |

#### File Events

| Event Type | Properties |
|------------|-----------|
| `file.edited` | `{ file }` |
| `file.watcher.updated` | `{ file, event: "add"\|"change"\|"unlink" }` |

#### MCP Events

| Event Type | Properties |
|------------|-----------|
| `mcp.tools.changed` | `{ server }` |
| `mcp.browser.open.failed` | `{ mcpName, url }` |

#### Global Events

| Event Type | Properties |
|------------|-----------|
| `global.disposed` | `{}` |
| `global.config.updated` | `{}` |

#### Other Events

| Event Type | Properties |
|------------|-----------|
| `project.updated` | `{ ...Project.Info }` |
| `vcs.branch.updated` | `{ branch? }` |
| `worktree.ready` | `{ name, branch }` |
| `worktree.failed` | `{ message }` |
| `workspace.ready` | `{ name }` |
| `workspace.failed` | `{ message }` |
| `lsp.updated` | `{}` |
| `lsp.client.diagnostics` | `{ serverID, path }` |
| `command.executed` | `{ name, sessionID, arguments, messageID }` |
| `tui.prompt.append` | `{ text }` |
| `tui.toast.show` | `{ title?, message, variant, duration? }` |
| `installation.updated` | `{ version }` |
| `ide.installed` | `{ ide }` |

## 8. Key Architectural Patterns

### Per-Instance State

The server wraps each request in `Instance.provide()` using `AsyncLocalStorage`. This creates a lazy singleton per project directory, meaning the same server can serve multiple projects simultaneously with isolated state.

### Two-Tier Event Bus

- **Bus** (per-instance): Uses `AsyncLocalStorage`-scoped subscriptions. Events published here are also forwarded to GlobalBus.
- **GlobalBus** (global): A Node.js `EventEmitter` receiving all events from all instances. `GET /global/event` subscribes to this.

### Cached Message Pattern

The extension caches the last response for frequently-requested data (providers, agents, skills, commands, config, MCP status). When a webview requests this data, it gets the cached value immediately without waiting for an HTTP round-trip. This prevents UI flicker on webview refresh.

### Streaming Responses

`POST /session/:sessionID/message` uses Hono's `stream()` to return a JSON stream (not SSE) for the AI response. The SSE endpoint (`GET /event`) is for event notifications only.

### Foreign Project Filtering

When the extension resolves the workspace's `projectID` (from the first session's `projectID`), it filters out SSE events from other projects by checking `event.properties.info.projectID` against the expected value.
