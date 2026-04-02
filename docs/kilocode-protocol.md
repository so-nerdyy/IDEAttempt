# KiloCode Extension-to-CLI Communication Protocol

This document describes how the KiloCode VS Code extension communicates with its CLI backend.

## Architecture Overview

The extension spawns the CLI as a child process and communicates via HTTP REST and Server-Sent Events (SSE) over localhost. Authentication uses HTTP Basic Auth with a randomly generated password.

```
┌─────────────────────┐         ┌─────────────────────┐
│   VS Code Extension │  HTTP   │    CLI Backend      │
│                     │◄───────►│  (opencode server)  │
│  ┌───────────────┐  │  SSE    │                     │
│  │ KiloProvider  │  │         │  ┌───────────────┐  │
│  │ (sidebar)     │  │         │  │ Hono Server   │  │
│  ├───────────────┤  │         │  │ (port: auto)  │  │
│  │ AgentManager  │  │         │  └───────────────┘  │
│  │ Provider      │  │         │                     │
│  └───────────────┘  │         │                     │
│         │           │         │                     │
│         ▼           │         │                     │
│  ┌───────────────┐  │         │                     │
│  │ KiloConnection│  │         │                     │
│  │ Service       │  │         │                     │
│  │ (singleton)   │  │         │                     │
│  └───────────────┘  │         │                     │
└─────────────────────┘         └─────────────────────┘
```

## Server Lifecycle Management

### Process Spawning (ServerManager)

The `ServerManager` class spawns the CLI backend as a child process:

```typescript
// Command
bin/kilo serve --port 0

// Process options
{
  cwd: workspacePath,
  windowsHide: true,  // Windows compatibility
  env: {
    ...process.env,
    KILO_SERVER_PASSWORD: <32-byte-hex>,
    KILO_CLIENT: 'vscode',
    KILO_ENABLE_QUESTION_TOOL: 'true',
    KILOCODE_FEATURE: 'vscode-extension',
    KILO_TELEMETRY_LEVEL: <level>,
    KILO_APP_NAME: 'kilo-code',
    KILO_EDITOR_NAME: <editor>,
    KILO_PLATFORM: 'vscode',
    KILO_MACHINE_ID: <machine-id>,
    KILO_APP_VERSION: <version>,
    KILO_VSCODE_VERSION: <vscode-version>
  }
}
```

### Startup Sequence

1. Generate 32-byte hex password
2. Spawn CLI process with environment variables
3. Capture port from stdout via regex: `/port:\s*(\d+)/`
4. 30-second startup timeout
5. Initialize HTTP client with Basic Auth (username: "kilo", password: generated)

### Process Termination

- SIGTERM sent to process group
- If process survives > 5 seconds, send SIGKILL
- Handles Windows process termination appropriately

## Authentication Model

| Field | Value |
|-------|-------|
| Method | HTTP Basic Auth |
| Username | `kilo` |
| Password | 32-byte hex from `KILO_SERVER_PASSWORD` env var |

CORS allows:
- `localhost`, `127.0.0.1`
- `tauri://localhost`
- `*.opencode.ai`
- Configured whitelist domains

## SSE Event Protocol

### Connection Architecture (SdkSSEAdapter)

The SSE adapter wraps the SDK's `client.global.event()` AsyncGenerator:

```
┌─────────────────────────────────────────────────────────┐
│                    SdkSSEAdapter                        │
│  ┌─────────────┐    ┌─────────────┐    ┌────────────┐ │
│  │  Connect    │───►│  Heartbeat  │───►│ Reconnect  │ │
│  │  (async)    │    │  Monitor    │    │  (250ms)   │ │
│  └─────────────┘    └─────────────┘    └────────────┘ │
│         │                  │                   │       │
│         ▼                  ▼                   ▼       │
│  AbortController     15s timeout         New attempt  │
└─────────────────────────────────────────────────────────┘
```

### Configuration

| Parameter | Value | Purpose |
|-----------|-------|---------|
| Heartbeat timeout | 15 seconds | Detect stale connections |
| Server heartbeat interval | 10 seconds | Keep-alive from server |
| Reconnection delay | 250ms | Delay before reconnect attempt |
| SDK retry attempts | 1 | Disable SDK-internal retries |

### Event Types

#### Server Lifecycle Events

| Event | Payload | Description |
|-------|---------|-------------|
| `server.connected` | `{}` | SSE connection established |
| `server.heartbeat` | `{}` | Keep-alive ping (every 10s) |

#### Global Events

| Event | Payload | Description |
|-------|---------|-------------|
| `global.disposed` | `{}` | Server instance disposed |
| `global.config.updated` | `{ config }` | Config updated without restart |

#### Session Events

| Event | Payload | Description |
|-------|---------|-------------|
| `session.created` | `{ session }` | New session created |
| `session.updated` | `{ session }` | Session properties changed |
| `session.deleted` | `{ sessionId }` | Session removed |
| `session.status` | `{ sessionId, status }` | Processing status change |

#### Message Events

| Event | Payload | Description |
|-------|---------|-------------|
| `message.part.updated` | `{ sessionId, messageId, part }` | Message part complete |
| `message.part.delta` | `{ sessionId, messageId, part, delta }` | Streaming text chunk |

## HTTP API Endpoints

### Global Routes (`/global`)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/global/health` | Health check (used for polling) |
| GET | `/global/event` | SSE event stream |
| POST | `/global/config` | Update configuration |
| POST | `/global/dispose` | Dispose server instance |

### Session Routes (`/session`)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/session` | List all sessions |
| POST | `/session` | Create new session |
| GET | `/session/:id` | Get session details |
| PUT | `/session/:id` | Update session |
| DELETE | `/session/:id` | Delete session |
| POST | `/session/:id/message` | Send message to session |
| POST | `/session/:id/fork` | Fork session |
| POST | `/session/:id/abort` | Abort current operation |
| POST | `/session/:id/revert` | Revert to checkpoint |

### Project Routes (`/project`)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/project` | List projects |
| GET | `/project/current` | Get current project |
| POST | `/project/git/init` | Initialize git repository |

### Provider Routes (`/provider`)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/provider` | List available providers |
| GET | `/provider/:id/auth-methods` | Get auth methods for provider |
| GET | `/provider/:id/oauth` | Initiate OAuth flow |
| GET | `/provider/:id/oauth/callback` | OAuth callback handler |

### Config Routes (`/config`)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/config` | Get project configuration |
| PUT | `/config` | Update project configuration |
| GET | `/config/providers` | List configured providers |

### Permission Routes (`/permission`)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/permission` | List pending permissions |
| POST | `/permission/reply` | Respond to permission request |
| POST | `/permission/always-rules` | Save always-allow rules |

### Question Routes (`/question`)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/question` | List pending questions |
| POST | `/question/reply` | Answer a question |
| POST | `/question/reject` | Reject a question |

### MCP Routes (`/mcp`)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/mcp/status` | Get MCP server status |
| POST | `/mcp/add` | Add MCP server |
| POST | `/mcp/:id/connect` | Connect to MCP server |
| POST | `/mcp/:id/disconnect` | Disconnect from MCP server |
| GET | `/mcp/:id/oauth` | Initiate MCP OAuth |

### File Routes (`/file`)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/file/find-text` | Search text in files |
| POST | `/file/find-files` | Find files by pattern |
| POST | `/file/read` | Read file contents |
| GET | `/file/status` | Get file status |

### Auth Routes

| Method | Endpoint | Purpose |
|--------|----------|---------|
| PUT | `/auth/:providerId` | Store auth credentials |
| DELETE | `/auth/:providerId` | Remove auth credentials |

### Utility Routes

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/path` | Get paths (home, state, config, worktree) |
| GET | `/vcs` | Get VCS info (current branch) |
| POST | `/log` | Write log entry |
| GET | `/agent` | List available agents |
| GET | `/skill` | List available skills |
| GET | `/command` | List available commands |
| GET | `/lsp` | List LSP servers |
| GET | `/formatter` | List formatters |

### Kilocode-specific Routes

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/enhance-prompt` | Enhance user prompt |
| POST | `/commit-message` | Generate commit message |
| POST | `/remote` | Remote operations |
| POST | `/telemetry` | Telemetry events |
| GET | `/kilo/*` | Kilo Gateway routes (auth, profile) |
| GET | `/kilocode/*` | Kilocode-specific routes |

## Connection Service Architecture

### KiloConnectionService (Singleton)

The `KiloConnectionService` is a singleton that manages the connection to the CLI backend:

```typescript
class KiloConnectionService {
  // Singleton instance
  private static instance: KiloConnectionService;
  
  // Connection state
  private serverManager: ServerManager;
  private sseAdapter: SdkSSEAdapter;
  private client: KiloClient;  // SDK client
  
  // Health monitoring
  private healthPollInterval: 10000;  // 10 seconds
  
  // Session tracking
  private messageSessionIdsByMessageId: Map<string, string>;
}
```

### Health Monitoring

- Polls `GET /global/health` every 10 seconds
- Reconnects SSE on connection failure
- Tracks connection state for webview consumers

### Event Filtering

Webviews can filter events using `onEventFiltered()`:

```typescript
onEventFiltered(
  callback: (event: ServerEvent) => void,
  filter: { sessionIds?: Set<string> }
): vscode.Disposable
```

## Provider Comparison

### KiloProvider (Sidebar)

| Aspect | Details |
|--------|---------|
| Location | VS Code sidebar |
| Activation | Cmd+Shift+K |
| Sessions | Single session per workspace |
| State | Per-workspace state |
| Scope | Current workspace only |

### AgentManagerProvider (Editor Panel)

| Aspect | Details |
|--------|---------|
| Location | Editor tab |
| Activation | Cmd+Shift+M |
| Sessions | Multiple parallel sessions |
| State | `.kilo/agent-manager.json` |
| Scope | Multiple worktrees with isolation |
| Components | `WorktreeManager`, `GitStatsPoller`, `WorktreeStateManager` |

### Shared Components

Both providers share:
- `KiloConnectionService` singleton
- Same CLI backend process
- Same SSE event stream
- Same HTTP client

### Session Isolation (AgentManager)

The AgentManager achieves session isolation via:

1. **Worktree Paths**: Each session has a unique directory path
2. **Session Directories Map**: `{ sessionId: worktreePath }`
3. **Directory-Scoped Operations**: File operations target specific worktree

## Sequence Diagram

```
┌────────┐     ┌────────┐     ┌────────┐     ┌────────┐
│VS Code │     │Extension│    │CLI     │     │LLM API │
└───┬────┘     └───┬────┘     └───┬────┘     └───┬────┘
    │              │              │              │
    │ User opens   │              │              │
    │ sidebar      │              │              │
    │─────────────►│              │              │
    │              │              │              │
    │              │ Spawn CLI    │              │
    │              │─────────────►│              │
    │              │              │              │
    │              │ Port: 45678  │              │
    │              │◄─────────────│              │
    │              │              │              │
    │              │ GET /global/health          │
    │              │─────────────►│              │
    │              │              │              │
    │              │ 200 OK       │              │
    │              │◄─────────────│              │
    │              │              │              │
    │              │ GET /global/event (SSE)     │
    │              │─────────────►│              │
    │              │              │              │
    │              │ event: server.connected     │
    │              │◄─────────────│              │
    │              │              │              │
    │ User types   │              │              │
    │ message      │              │              │
    │─────────────►│              │              │
    │              │              │              │
    │              │ POST /session/:id/message   │
    │              │─────────────►│              │
    │              │              │              │
    │              │              │ Stream to LLM│
    │              │              │─────────────►│
    │              │              │              │
    │              │              │ SSE chunks   │
    │              │              │◄─────────────│
    │              │              │              │
    │              │ SSE: message.part.delta     │
    │              │◄─────────────│              │
    │              │              │              │
    │ Update       │              │              │
    │ webview      │              │              │
    │◄─────────────│              │              │
    │              │              │              │
    │              │ SSE: server.heartbeat       │
    │              │◄─────────────│              │
    │              │ (every 10s)  │              │
    │              │              │              │
```

## VS Code API Dependencies

### Required APIs

| API | Usage | Priority |
|-----|-------|----------|
| `vscode.window` | Message display, input, webview panels | Critical |
| `vscode.workspace` | Workspace folders, configuration, file system | Critical |
| `vscode.commands` | Command registration and execution | Critical |
| `vscode.env` | Open external URLs, app info | Critical |
| `vscode.extensions` | Extension metadata | High |
| `vscode.languages` | Language features, diagnostics | High |
| `vscode.debug` | Debug session integration | Medium |
| `vscode.scm` | Source control integration | Medium |
| `vscode.tasks` | Task runner integration | Low |
| `vscode.terminal` | Integrated terminal | Low |

### Critical Extension Points

1. **WebviewViewProvider**: Sidebar panel implementation
2. **CustomEditorProvider**: Agent Manager editor tab
3. **TextDocumentContentProvider**: Virtual document handling
4. **FileSystemProvider**: Custom file system operations
5. **AuthenticationProvider**: OAuth flow integration

### Configuration Access

```typescript
// Extension configuration namespace
const config = vscode.workspace.getConfiguration('kilocode');

// Key configuration points
- kilocode.apiKey
- kilocode.baseUrl
- kilocode.defaultModel
- kilocode.enableTelemetry
```

### Command Contributions

| Command | Purpose |
|---------|---------|
| `kilocode.openSidebar` | Open sidebar panel |
| `kilocode.openAgentManager` | Open Agent Manager |
| `kilocode.sendMessage` | Send message to active session |
| `kilocode.abortSession` | Abort current operation |
| `kilocode.forkSession` | Fork current session |

## Error Handling

### Connection Errors

1. **Startup Failure**: Retry with exponential backoff, show error notification
2. **Health Check Failure**: Attempt SSE reconnection
3. **SSE Disconnect**: Automatic reconnection with 250ms delay

### Error Propagation

```
CLI Error → SDK Client → Connection Service → Provider → Webview
                                     │
                                     └──► VS Code Error Notification
```

## Implementation Notes

### Threading Model

- Extension runs on VS Code extension host (single thread)
- CLI backend runs as separate process (multi-threaded)
- SSE events processed asynchronously
- UI updates via `vscode.window.withProgress`

### State Management

- Extension state: `vscode.ExtensionContext.globalState`
- Workspace state: `vscode.ExtensionContext.workspaceState`
- Agent Manager state: `.kilo/agent-manager.json`

### Performance Considerations

- SSE heartbeat prevents connection timeout
- Health polling validates server availability
- Message deduplication via `messageSessionIdsByMessageId`
- Session filtering reduces unnecessary webview updates
