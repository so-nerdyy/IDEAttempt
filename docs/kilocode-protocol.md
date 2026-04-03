# KiloCode Extension-to-CLI Communication Protocol

This document describes the communication protocol between the VS Code extension (`kilo-vscode`) and the CLI backend (`opencode`).

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     VS Code Extension Host                       │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                    KiloConnectionService                    │ │
│  │                         (Singleton)                         │ │
│  │  ┌──────────────┐  ┌─────────────┐  ┌──────────────────┐  │ │
│  │  │ServerManager │  │  KiloClient │  │  SdkSSEAdapter   │  │ │
│  │  │ (CLI spawn)  │  │ (HTTP SDK)  │  │ (Event stream)   │  │ │
│  │  └──────┬───────┘  └──────┬──────┘  └────────┬─────────┘  │ │
│  └─────────┼─────────────────┼──────────────────┼─────────────┘ │
│            │                 │                  │               │
│  ┌─────────▼─────────────────▼──────────────────▼─────────────┐ │
│  │              Shared Event Subscription System               │ │
│  │  (KiloProvider, AgentManagerProvider, webviews subscribe)  │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTP/SSE (localhost)
                              │
┌─────────────────────────────▼───────────────────────────────────┐
│                      CLI Backend Process                         │
│                     (`kilo serve --port 0`)                      │
│  ┌─────────────┐  ┌───────────────┐  ┌───────────────────────┐ │
│  │ HTTP Server │  │ SSE Streamer  │  │    Business Logic     │ │
│  │  (Hono)     │  │ (EventBus)    │  │ (Sessions, LSP, MCP)  │ │
│  └─────────────┘  └───────────────┘  └───────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

## Sequence Diagram: Extension Startup

```
┌────────┐     ┌─────────────────┐    ┌───────────────┐    ┌────────────┐
│VS Code │     │KiloConnection   │    │ServerManager  │    │CLI Process │
│        │     │Service          │    │               │    │(kilo serve)│
└───┬────┘     └───────┬─────────┘    └───────┬───────┘    └──────┬─────┘
    │                  │                      │                   │
    │ activate()       │                      │                   │
    │─────────────────>│                      │                   │
    │                  │                      │                   │
    │                  │ spawn()              │                   │
    │                  │─────────────────────>│                   │
    │                  │                      │                   │
    │                  │                      │ Generate password │
    │                  │                      │ Set KILO_SERVER_  │
    │                  │                      │ PASSWORD env      │
    │                  │                      │                   │
    │                  │                      │ fork+exec         │
    │                  │                      │──────────────────>│
    │                  │                      │                   │
    │                  │                      │     stdout: port  │
    │                  │                      │<──────────────────│
    │                  │                      │                   │
    │                  │      {port, password}│                   │
    │                  │<─────────────────────│                   │
    │                  │                      │                   │
    │                  │ Create KiloClient    │                   │
    │                  │ (with Basic Auth)    │                   │
    │                  │                      │                   │
    │                  │ GET /global/health   │                   │
    │                  │─────────────────────────────────────────>│
    │                  │                      │                   │
    │                  │ {healthy: true}      │                   │
    │                  │<─────────────────────────────────────────│
    │                  │                      │                   │
    │                  │ SSE: GET /global/event                │
    │                  │─────────────────────────────────────────>│
    │                  │                      │                   │
    │                  │<══════ SSE Stream ══════════════════════│
    │                  │                      │                   │
    │  Ready           │                      │                   │
    │<─────────────────│                      │                   │
    │                  │                      │                   │
```

## Connection Lifecycle

### ServerManager (CLI Spawning)

Location: `kilocode/packages/kilo-vscode/src/services/cli-backend/server-manager.ts`

**Process:**
1. Generate random password (32 hex chars via `randomUUID()`)
2. Fork the CLI binary: `kilo serve --port 0` 
   - Port 0 = OS assigns random available port
   - `KILO_SERVER_PASSWORD` env var set for auth
3. Capture port from stdout (regex: `port=(\d+)`)
4. 30-second startup timeout
5. On dispose: SIGTERM, then SIGKILL after 5 seconds

**Key Code:**
```typescript
const env = {
  ...process.env,
  KILO_SERVER_PASSWORD: this.password,
}
const child = spawn(binaryPath, ['serve', '--port', '0'], { env })
```

### KiloClient (HTTP SDK)

Auto-generated TypeScript client from OpenAPI spec.

**Authentication:** Basic Auth
- Username: `kilo`
- Password: Generated at spawn time
- Header: `Authorization: Basic base64(kilo:password)`

**Location:** `packages/sdk/js/`

### SdkSSEAdapter (Event Streaming)

Location: `kilocode/packages/kilo-vscode/src/services/cli-backend/sdk-sse-adapter.ts`

**Features:**
- Automatic reconnection (250ms delay)
- 15-second heartbeat timeout (server sends every 10s)
- Broadcasts events to all subscribers
- Handles backpressure via event queue

**Connection:**
```typescript
// GET /global/event with Authorization header
const stream = client.GET('/global/event', { stream: true })
```

## Authentication Model

**Mechanism:** HTTP Basic Authentication

**Flow:**
1. Extension generates random password before spawning CLI
2. Password passed via `KILO_SERVER_PASSWORD` environment variable
3. CLI server uses this password for all HTTP requests
4. Both HTTP and SSE connections require the Authorization header

**Security:**
- Password is process-local, not exposed to user
- Only localhost connections accepted
- No external network exposure

---

## HTTP API Reference

Base URL: `http://localhost:{port}`

All endpoints require `Authorization: Basic <base64(kilo:password)>` header.

### Session Routes (`/session`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List sessions (filters: directory, roots, start, search, limit) |
| GET | `/status` | Get session status for all sessions |
| GET | `/:sessionID` | Get specific session |
| GET | `/:sessionID/children` | Get child sessions |
| GET | `/:sessionID/todo` | Get session todos |
| POST | `/` | Create session |
| DELETE | `/:sessionID` | Delete session |
| PATCH | `/:sessionID` | Update session (title, archived time) |
| POST | `/:sessionID/init` | Initialize session (create AGENTS.md) |
| POST | `/:sessionID/fork` | Fork session at a message point |
| POST | `/:sessionID/abort` | Abort active session |
| POST | `/:sessionID/share` | Create shareable link |
| DELETE | `/:sessionID/share` | Remove shareable link |
| POST | `/:sessionID/summarize` | Summarize session via AI compaction |
| GET | `/:sessionID/message` | Get all messages |
| GET | `/:sessionID/message/:messageID` | Get specific message |
| DELETE | `/:sessionID/message/:messageID` | Delete message |
| POST | `/:sessionID/message` | Send message (prompt) |
| POST | `/:sessionID/prompt_async` | Send message asynchronously |
| POST | `/:sessionID/command` | Send slash command |
| POST | `/:sessionID/shell` | Run shell command |
| POST | `/:sessionID/revert` | Revert message |
| POST | `/:sessionID/unrevert` | Restore reverted messages |
| POST | `/:sessionID/permissions/:permissionID` | Respond to permission (deprecated) |
| GET | `/:sessionID/diff` | Get message diff |
| POST | `/viewed` | Set viewed session |

### Config Routes (`/config`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Get configuration |
| PATCH | `/` | Update configuration |
| GET | `/providers` | List config providers with defaults |

### Provider Routes (`/provider`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List all providers (with enabled/disabled filtering) |
| GET | `/auth` | Get provider auth methods |
| POST | `/:providerID/oauth/authorize` | Initiate OAuth flow |
| POST | `/:providerID/oauth/callback` | Handle OAuth callback |

### Global Routes (`/global`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check - returns `{healthy: true, version}` |
| GET | `/event` | **SSE global event stream** |
| GET | `/config` | Get global config |
| PATCH | `/config` | Update global config |
| POST | `/dispose` | Dispose all instances |

### Permission Routes (`/permission`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/:requestID/reply` | Respond to permission request |
| POST | `/:requestID/always-rules` | Save always-allow/deny rules |
| GET | `/` | List pending permissions |

### Question Routes (`/question`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List pending questions |
| POST | `/:requestID/reply` | Reply to question |
| POST | `/:requestID/reject` | Reject question |

### File Routes (`/file`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/find` | Search text with ripgrep |
| GET | `/find/file` | Search files by name (glob) |
| GET | `/find/symbol` | Search LSP symbols |
| GET | `/file` | List directory |
| GET | `/file/content` | Read file content |
| GET | `/file/status` | Get git status |

### MCP Routes (`/mcp`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Get MCP server status |
| POST | `/` | Add MCP server |
| POST | `/:name/auth` | Start MCP OAuth |
| POST | `/:name/auth/callback` | Complete MCP OAuth |
| POST | `/:name/auth/authenticate` | Authenticate MCP (opens browser) |
| DELETE | `/:name/auth` | Remove MCP OAuth |
| POST | `/:name/connect` | Connect MCP server |
| POST | `/:name/disconnect` | Disconnect MCP server |

### PTY Routes (`/pty`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List PTY sessions |
| POST | `/` | Create PTY session |
| GET | `/:ptyID` | Get PTY session |
| PUT | `/:ptyID` | Update PTY session |
| DELETE | `/:ptyID` | Remove PTY session |
| GET | `/:ptyID/connect` | **WebSocket connection to PTY** |

### Project Routes (`/project`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List all projects |
| GET | `/current` | Get current project |
| POST | `/git/init` | Initialize git repository |
| PATCH | `/:projectID` | Update project |

---

## SSE Event Types

All events are sent over the `/global/event` SSE connection.

### Event Format

```
event: <event-name>
data: <JSON payload>

```

### Server Lifecycle Events

| Event | Payload | Description |
|-------|---------|-------------|
| `server.connected` | `{}` | SSE connection established |
| `server.heartbeat` | `{}` | Sent every 10 seconds |
| `global.disposed` | `{}` | Instance disposed |
| `global.config.updated` | `{config: {...}}` | Config updated |

### Session Events

| Event | Payload | Description |
|-------|---------|-------------|
| `session.created` | `{session: Session}` | New session created |
| `session.updated` | `{session: Session}` | Session updated |
| `session.deleted` | `{sessionID: string}` | Session deleted |
| `session.diff` | `{sessionID, diff}` | Session diff available |
| `session.error` | `{sessionID, error}` | Session error |
| `session.turn_open` | `{sessionID}` | Turn started |
| `session.turn_close` | `{sessionID}` | Turn ended |

### Message Events

| Event | Payload | Description |
|-------|---------|-------------|
| `message.updated` | `{sessionID, message}` | Message updated |
| `message.removed` | `{sessionID, messageID}` | Message removed |
| `message.part_updated` | `{sessionID, messageID, part}` | Message part updated |
| `message.part_delta` | `{sessionID, messageID, partID, delta}` | Streaming text delta |
| `message.part_removed` | `{sessionID, messageID, partID}` | Message part removed |

### Permission Events

| Event | Payload | Description |
|-------|---------|-------------|
| `permission.updated` | `{permission}` | Permission state changed |
| `permission.asked` | `{permission}` | Permission request pending |
| `permission.replied` | `{permissionID, response}` | Permission answered |

### Question Events

| Event | Payload | Description |
|-------|---------|-------------|
| `question.asked` | `{question}` | Question pending response |
| `question.replied` | `{questionID, answer}` | Question answered |
| `question.rejected` | `{questionID}` | Question rejected |

### PTY Events

| Event | Payload | Description |
|-------|---------|-------------|
| `pty.created` | `{pty}` | PTY session created |
| `pty.updated` | `{pty}` | PTY session updated |
| `pty.exited` | `{ptyID, exitCode}` | PTY process exited |
| `pty.deleted` | `{ptyID}` | PTY session deleted |

### Other Events

| Event | Payload | Description |
|-------|---------|-------------|
| `worktree.ready` | `{worktreeID}` | Worktree ready |
| `worktree.failed` | `{worktreeID, error}` | Worktree failed |
| `todo.updated` | `{sessionID, todos}` | Todos updated |
| `session_status.status` | `{sessionID, status}` | Session status changed |
| `session_status.idle` | `{sessionID}` | Session went idle |
| `compaction.compacted` | `{sessionID}` | Session compacted |
| `project.updated` | `{project}` | Project updated |
| `vcs.branch_updated` | `{branch}` | Git branch changed |
| `lsp.updated` | `{sessionID}` | LSP state updated |
| `lsp.diagnostics` | `{sessionID, diagnostics}` | LSP diagnostics |
| `mcp.tools_changed` | `{serverName}` | MCP tools changed |
| `mcp.browser_open_failed` | `{url}` | Browser open failed |
| `ide.installed` | `{ide}` | IDE installed |
| `file.edited` | `{path}` | File edited |
| `file.watcher.updated` | `{path}` | File watcher update |
| `installation.updated` | `{version}` | Installation updated |
| `installation.update_available` | `{version}` | Update available |
| `command.executed` | `{command}` | Command executed |
| `bus.instance_disposed` | `{}` | Bus instance disposed |

---

## Webview Communication

### Provider Architecture

**KiloProvider** (Sidebar):
- Location: `kilocode/packages/kilo-vscode/src/KiloProvider.ts`
- Single session view
- Webview-based UI
- Uses shared `KiloConnectionService`

**AgentManagerProvider** (Editor Tab):
- Location: `kilocode/packages/kilo-vscode/src/agent-manager/AgentManagerProvider.ts`
- Multiple sessions with worktree isolation
- Also uses same shared connection

Both providers:
1. Subscribe to events from `SdkSSEAdapter`
2. Forward events to webview via `postMessage()`
3. Receive messages from webview via `vscode.postMessage()`
4. Make HTTP calls via `KiloClient`

### Webview Message Protocol

**Extension → Webview:**
```typescript
// SSE events forwarded directly
webview.postMessage({ type: 'event', event: 'message.part_delta', data: {...} })
```

**Webview → Extension:**
```typescript
// Request-response pattern
vscode.postMessage({ type: 'api', method: 'POST', path: '/session/123/message', body: {...} })
```

---

## VS Code API Dependencies

The extension imports from `vscode` module. Key dependencies:

### Core Modules

| Module | Usage |
|--------|-------|
| `vscode.window` | Notifications, messages, input, terminals, active editor |
| `vscode.workspace` | Workspace folders, configuration, text documents, file watchers |
| `vscode.commands` | Registering and executing commands |
| `vscode.languages` | Code actions, diagnostics, completions |
| `vscode.env` | Open external URLs, clipboard, language |
| `vscode.extensions` | Extension API, getExtension() |

### UI Components

| API | Usage |
|-----|-------|
| `window.createWebviewPanel` | Main chat/composer UI |
| `window.registerWebviewViewProvider` | Sidebar view |
| `window.createOutputChannel` | Log output |
| `window.createTextEditorDecorationType` | Inline decorations |
| `window.onDidChangeActiveTextEditor` | Track active file |
| `workspace.onDidChangeTextDocument` | Track file changes |
| `workspace.onDidChangeConfiguration` | Settings changes |

### Commands Registered

40+ commands registered including:
- `kilo-code.newSession` - Start new chat
- `kilo-code.sendMessage` - Send message
- `kilo-code.acceptDiff` - Accept code change
- `kilo-code.rejectDiff` - Reject code change
- `kilo-code.configure` - Open settings
- etc.

---

## Migration Notes for Native Integration

When integrating into VS Code's built-in extension:

1. **Replace KiloConnectionService** with direct native service calls
   - No need to spawn separate CLI process
   - Services are in-process in the extension host

2. **Preserve SSE event patterns**
   - Event types remain the same
   - Replace HTTP SSE with in-process event bus

3. **Preserve VS Code API usage**
   - All `vscode` module imports work unchanged
   - May need to register with different extension ID

4. **HTTP API can become direct function calls**
   - Session routes → `SessionService` methods
   - File routes → `FileService` methods
   - Events → `EventBus.emit()` calls

5. **Webview communication unchanged**
   - Same `postMessage` pattern
   - Same event forwarding logic
