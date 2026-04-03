# VS Code Extension Host Architecture for Native AI Integration

This document analyzes VS Code's extension host architecture to identify integration points for building native AI capabilities directly into VS Code.

## Extension Host Process Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           VS Code Main Process                               │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                        Workbench (UI Layer)                           │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │  │
│  │  │   Sidebar   │  │   Panels    │  │   Editor    │  │  Status Bar │  │  │
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  │  │
│  │         │                │                │                │         │  │
│  │         └────────────────┴────────────────┴────────────────┘         │  │
│  │                                    │                                 │  │
│  │                           ┌────────▼────────┐                        │  │
│  │                           │  IViewDescriptor│                        │  │
│  │                           │     Service     │                        │  │
│  │                           └────────┬────────┘                        │  │
│  └────────────────────────────────────┼────────────────────────────────────┘
│                                       │                                    │
│  ┌────────────────────────────────────▼────────────────────────────────┐  │
│  │                    Extension Service Layer                            │  │
│  │  ┌─────────────────────────────────────────────────────────────────┐│  │
│  │  │ NativeExtensionService / BrowserExtensionService                ││  │
│  │  │   - Extends AbstractExtensionService                            ││  │
│  │  │   - Manages extension lifecycle                                 ││  │
│  │  │   - Coordinates multiple extension hosts                        ││  │
│  │  └─────────────────────────────────────────────────────────────────┘│  │
│  │                                    │                                 │  │
│  │         ┌──────────────────────────┼──────────────────────────┐     │  │
│  │         │                          │                          │     │  │
│  │  ┌──────▼──────┐          ┌────────▼────────┐        ┌───────▼─────┐│  │
│  │  │   Local     │          │    Web Worker   │        │   Remote    ││  │
│  │  │   Process   │          │ Extension Host  │        │ Extension   ││  │
│  │  │ Extension   │          │                 │        │   Host      ││  │
│  │  │   Host      │          │  (Browser only) │        │ (SSH/WSL)   ││  │
│  │  └──────┬──────┘          └────────┬────────┘        └──────┬──────┘│  │
│  └─────────┼──────────────────────────┼────────────────────────┼───────┘  │
│            │                          │                          │         │
└────────────┼──────────────────────────┼──────────────────────────┼─────────┘
             │                          │                          │
             │ RPC Protocol             │ RPC Protocol             │ RPC
             │ (JSON-RPC)               │ (JSON-RPC)               │ Protocol
             │                          │                          │
┌────────────▼────────────┐  ┌──────────▼──────────┐  ┌───────────▼─────────┐
│   Extension Host        │  │  Web Worker         │  │  Remote Extension   │
│   Process (Electron)    │  │  (Browser runtime)  │  │  Host Process       │
│                         │  │                     │  │                     │
│  ┌───────────────────┐  │  │ ┌─────────────────┐ │  │ ┌─────────────────┐ │
│  │ExtHostExtension   │  │  │ │ExtHostExtension │ │  │ │ExtHostExtension │ │
│  │   Service         │  │  │ │   Service       │ │  │ │   Service       │ │
│  └─────────┬─────────┘  │  │ └────────┬────────┘ │  │ └────────┬────────┘ │
│            │            │  │          │          │  │          │          │
│  ┌─────────▼─────────┐  │  │ ┌────────▼────────┐ │  │ ┌────────▼────────┐ │
│  │ Extension API     │  │  │ │ Extension API   │ │  │ │ Extension API   │ │
│  │ (vscode.d.ts)     │  │  │ │ (vscode.d.ts)   │ │  │ │ (vscode.d.ts)   │ │
│  └───────────────────┘  │  │ └─────────────────┘ │  │ └─────────────────┘ │
│                         │  │                     │  │                     │
│  ┌───────────────────┐  │  │ ┌─────────────────┐ │  │ ┌─────────────────┐ │
│  │ User Extensions   │  │  │ │ User Extensions │ │  │ │ User Extensions │ │
│  │ (sandboxed)       │  │  │ │ (sandboxed)     │ │  │ │ (sandboxed)     │ │
│  └───────────────────┘  │  │ └─────────────────┘ │  │ └─────────────────┘ │
└─────────────────────────┘  └─────────────────────┘  └─────────────────────┘
```

## Key Integration Points for KiloCode

### 1. Extension Service Layer

**File**: `vscode/src/vs/workbench/services/extensions/common/abstractExtensionService.ts`

The `AbstractExtensionService` manages extension lifecycle:
- Extension scanning and registration
- Extension host creation and coordination
- Activation event handling
- Extension dependency resolution

**Integration Points**:
- Override `_resolveExtensions()` to inject built-in KiloCode extension
- Hook into `_initialize()` for early service initialization
- Extend `ExtensionHostKindPicker` to control where KiloCode runs

### 2. Extension Host Factory

**File**: `vscode/src/vs/workbench/services/extensions/electron-browser/nativeExtensionService.ts`

`NativeExtensionHostFactory` creates extension hosts:
```typescript
class NativeExtensionHostFactory implements IExtensionHostFactory {
    public createExtensionHost(runningLocations, runningLocation, isInitialStart): IExtensionHost | null {
        switch (runningLocation.kind) {
            case ExtensionHostKind.LocalProcess:
                return this._instantiationService.createInstance(
                    NativeLocalProcessExtensionHost,
                    runningLocation,
                    startup,
                    dataProvider
                );
            // ... other host types
        }
    }
}
```

**Integration Points**:
- Register KiloCode as a built-in extension in `product.json`
- Create custom extension host data provider for KiloCode services
- Inject native service references into extension context

### 3. IoC Container (Service Registration)

**File**: `vscode/src/vs/platform/instantiation/common/instantiation.ts`

VS Code uses dependency injection via service decorators:

```typescript
// Creating a service identifier
export const IKiloAIService = createDecorator<IKiloAIService>('kiloAIService');

// Service implementation
export class KiloAIService implements IKiloAIService {
    constructor(
        @IInstantiationService instantiationService: IInstantiationService,
        @ILogService logService: ILogService,
        // ... other dependencies
    ) {}
}

// Registering the service
registerSingleton(IKiloAIService, KiloAIService, InstantiationType.Eager);
```

**Integration Points**:
- Create service interfaces in `vscode/src/vs/platform/kilo/common/`
- Implement services in `vscode/src/vs/platform/kilo/browser/` or `electron-browser/`
- Register services via `registerSingleton()`
- Inject into existing services via constructor parameters

### 4. Views Registry (Sidebar, Panels)

**File**: `vscode/src/vs/workbench/common/views.ts`

Views are registered via the global registry:

```typescript
// Get registries from global Registry
const viewContainersRegistry = Registry.as<IViewContainersRegistry>(
    Extensions.ViewContainersRegistry
);
const viewsRegistry = Registry.as<IViewsRegistry>(Extensions.ViewsRegistry);

// Register a view container (sidebar panel)
const container = viewContainersRegistry.registerViewContainer(
    {
        id: 'kiloCode',
        title: { value: 'Kilo Code', original: 'Kilo Code' },
        icon: Codicon.hubot,
        ctorDescriptor: new SyncDescriptor(KiloCodeViewPaneContainer),
    },
    ViewContainerLocation.Sidebar
);

// Register views within the container
viewsRegistry.registerViews([
    {
        id: 'kiloChat',
        name: { value: 'Chat', original: 'Chat' },
        ctorDescriptor: new SyncDescriptor(KiloChatView),
    }
], container);
```

**View Container Locations**:
- `ViewContainerLocation.Sidebar` - Primary sidebar
- `ViewContainerLocation.Panel` - Bottom panel (terminal, output, etc.)
- `ViewContainerLocation.AuxiliaryBar` - Secondary sidebar
- `ViewContainerLocation.ChatBar` - Chat-specific bar (new in VS Code)

**Integration Points**:
- Create `KiloCodeViewPaneContainer` extending `ViewPaneContainer`
- Implement `IView` interface for custom views
- Use `WebviewView` for HTML-based UI (chat, diff viewer)

### 5. Commands Registry

**File**: `vscode/src/vs/platform/commands/common/commands.ts`

Commands are registered globally:

```typescript
// Register a command
CommandsRegistry.registerCommand({
    id: 'kilo.sendToChat',
    handler: (accessor: ServicesAccessor, ...args: any[]) => {
        const kiloService = accessor.get(IKiloAIService);
        // ... command logic
    },
    metadata: {
        description: 'Send selection to Kilo chat',
        args: [{ name: 'text', description: 'Text to send' }]
    }
});

// Register command with keybinding
KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: 'kilo.sendToChat',
    weight: KeybindingWeight.WorkbenchContrib,
    primary: KeyMod.CtrlCmd | KeyCode.KeyK,
    when: ContextKeyExpr.equals('editorFocus', true),
    handler: (accessor, ...args) => { /* ... */ }
});
```

**Keybinding Weights** (from `KeybindingsRegistry`):
```typescript
export const enum KeybindingWeight {
    EditorCore = 0,
    EditorContrib = 100,
    WorkbenchContrib = 200,
    BuiltinExtension = 300,
    ExternalExtension = 400
}
```

### 6. Webview Communication

**Files**: 
- `vscode/src/vs/workbench/api/common/extHostWebviewView.ts`
- `vscode/src/vs/workbench/api/common/extHostWebviewPanels.ts`

Webviews use message passing between main thread and extension host:

```
┌─────────────────┐                      ┌─────────────────┐
│   Main Thread   │                      │ Extension Host  │
│                 │                      │                 │
│  WebviewView    │  ◄─── $createWebviewView ───►  ExtHost  │
│  (HTML iframe)  │                      │  WebviewView    │
│                 │                      │                 │
│       ▲         │                      │       ▲         │
│       │ postMessage                       │ postMessage  │
│       ▼         │                      │       ▼         │
│  ┌─────────┐    │  ◄─── $postMessage ───────►  │    ┌─────────┐
│  │  Main   │────┼──────────────────────────────┼────│ ExtHost │
│  │ Webview │    │  ◄─── onDidReceiveMessage ──►│    │ Webview │
│  │  Proxy  │    │                              │    │  Proxy  │
│  └─────────┘    │                              │    └─────────┘
└─────────────────┘                      └─────────────────┘
```

For native integration, bypass the RPC layer:

```typescript
// Native webview view implementation
export class NativeKiloWebviewView extends Disposable implements IWebviewView {
    constructor(
        @IInstantiationService instantiationService: IInstantiationService,
        @IKiloAIService kiloService: IKiloAIService,
    ) {
        // Direct service access - no RPC needed
        this._kiloService = kiloService;
    }
    
    // Direct message handling - no serialization boundary
    public async resolveWebviewView(webviewView: WebviewView) {
        webviewView.webview.onDidReceiveMessage(message => {
            // Handle messages directly
        });
    }
}
```

### 7. Extension Points Registry

**File**: `vscode/src/vs/workbench/services/extensions/common/extensionsRegistry.ts`

Extensions can define contribution points:

```typescript
const extensionPoint = ExtensionsRegistry.registerExtensionPoint<IKiloConfig>({
    extensionPoint: 'kiloCode',
    jsonSchema: {
        type: 'object',
        properties: {
            // JSON schema for contribution
        }
    }
});

extensionPoint.setHandler((extensions) => {
    for (const extension of extensions) {
        // Process contributions
    }
});
```

## Services to Extend or Replace

### Core Services (Must Implement)

| Service | Purpose | Native Integration |
|---------|---------|-------------------|
| `IKiloAIService` | AI inference, message streaming | Direct native implementation |
| `IKiloConnectionService` | CLI lifecycle management | Replace with native service |
| `IKiloProviderService` | Sidebar state management | Integrate with ViewsRegistry |

### Platform Services (Leverage Existing)

| Service | Purpose | Usage |
|---------|---------|-------|
| `IInstantiationService` | Dependency injection | Create instances with DI |
| `ICommandService` | Command execution | Register Kilo commands |
| `IEditorService` | Editor management | Access active editor |
| `IWorkspaceContextService` | Workspace state | Get workspace folders |
| `IConfigurationService` | Settings | Read Kilo configuration |
| `IContextKeyService` | Context keys | `when` clause conditions |
| `ILogService` | Logging | Kilo logs to output channel |
| `INotificationService` | User notifications | Show progress/errors |
| `IProgressService` | Progress indicators | Long-running operations |
| `IStorageService` | Persistent storage | Save Kilo state |

### Workbench Services (UI Integration)

| Service | Purpose | Usage |
|---------|---------|-------|
| `IViewDescriptorService` | View management | Register sidebar views |
| `IPanelService` | Bottom panel | Output channel, terminal |
| `IEditorGroupsService` | Editor layout | Diff viewer integration |
| `ITextModelService` | Text models | Access document content |
| `ILanguageFeaturesService` | Language features | Code actions, completions |

## Native Registration Patterns

### Registering Commands (Native)

```typescript
// In workbench contribution
export class KiloCodeContribution extends Disposable {
    constructor(
        @IInstantiationService instantiationService: IInstantiationService,
        @ICommandService commandService: ICommandService,
    ) {
        // Register command directly
        const disposable = CommandsRegistry.registerCommand({
            id: 'kilo.openChat',
            handler: (accessor) => {
                // Access services directly via accessor
                const viewService = accessor.get(IViewsService);
                viewService.openView('kiloChat', true);
            }
        });
        this._register(disposable);
    }
}

// Register via contributions registry
Registry.as<IWorkbenchContributionsRegistry>(
    WorkbenchExtensions.Workbench
).registerWorkbenchContribution(
    KiloCodeContribution,
    LifecyclePhase.Ready
);
```

### Registering Views (Native)

```typescript
// Register view container
const VIEW_CONTAINER = Registry.as<IViewContainersRegistry>(
    Extensions.ViewContainersRegistry
).registerViewContainer(
    {
        id: 'kiloCodeSidebar',
        title: { value: 'Kilo', original: 'Kilo' },
        icon: KiloIcon,
        ctorDescriptor: new SyncDescriptor(KiloViewPaneContainer),
        order: 0,
    },
    ViewContainerLocation.Sidebar,
    { isDefault: false }
);

// Register views
const VIEWS = Registry.as<IViewsRegistry>(Extensions.ViewsRegistry);
VIEWS.registerViews([{
    id: 'kiloChatView',
    name: { value: 'Chat', original: 'Chat' },
    ctorDescriptor: new SyncDescriptor(KiloChatView),
    when: ContextKeyExpr.equals('kilo.enabled', true),
}], VIEW_CONTAINER);
```

### Registering Keybindings (Native)

```typescript
KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: 'kilo.acceptCode',
    weight: KeybindingWeight.WorkbenchContrib,
    primary: KeyMod.CtrlCmd | KeyCode.Enter,
    secondary: [KeyMod.Alt | KeyCode.Enter],
    when: ContextKeyExpr.and(
        ContextKeyExpr.equals('kilo.diffVisible', true),
        ContextKeyExpr.equals('editorFocus', true)
    ),
    handler: (accessor) => {
        const diffService = accessor.get(IKiloDiffService);
        diffService.acceptChanges();
    }
});
```

### Registering Menus (Native)

```typescript
// Via MenuRegistry
MenuRegistry.appendMenuItem(MenuId.EditorContext, {
    command: {
        id: 'kilo.explainCode',
        title: { value: 'Explain with Kilo', original: 'Explain with Kilo' }
    },
    group: 'kilo',
    when: ContextKeyExpr.equals('editorHasSelection', true),
    order: 1
});

MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
    command: {
        id: 'kilo.openSettings',
        title: { value: 'Kilo: Open Settings', original: 'Kilo: Open Settings' },
        category: { value: 'Kilo', original: 'Kilo' }
    }
});
```

## Extension Host Communication Protocol

### RPC Protocol Structure

```
Main Thread                           Extension Host
───────────                           ───────────────
                                        
IMainContext                          IMainContext
    │                                     │
    │ createProxy<T>(identifier)          │
    │ ─────────────────────────────────►  │
    │                                     │
    │        Proxy Object                 │
    │  ◄───────────────────────────────── │
    │                                     │
    │ method call on proxy                │
    │ ─────────────────────────────────►  │ $methodName(args)
    │                                     │
    │            result                   │
    │  ◄───────────────────────────────── │
    │                                     │
```

### Built-in Extension Optimization

For built-in extensions, bypass RPC entirely:

```typescript
// Instead of RPC proxy:
const mainThreadService = accessor.get(IMainThreadService);
const proxy = mainThreadService.getProxy(MainThreadKiloAPI.Shape);

// Use direct service access:
const kiloService = accessor.get(IKiloAIService);
await kiloService.sendMessage(message); // Direct call, no serialization
```

## Lifecycle Integration

### Service Initialization Order

```
1. Platform Services (InstantiationType.Eager)
   └─ Core DI container ready
   
2. Environment Services
   └─ Configuration, workspace, storage
   
3. Extension Service
   └─ Scan extensions, create extension hosts
   
4. Workbench Services
   └─ Views, editors, panels
   
5. Extension Host Ready
   └─ Extensions activate on events
   
6. LifecyclePhase.Ready
   └─ All services operational
```

### KiloCode Initialization Hook

```typescript
// Register as eager singleton
registerSingleton(IKiloAIService, KiloAIService, InstantiationType.Eager);

// Or use workbench contribution for late init
class KiloCodeInitializer implements IWorkbenchContribution {
    constructor(
        @IKiloAIService kiloService: IKiloAIService,
        @ILifecycleService lifecycleService: ILifecycleService,
    ) {
        // Wait for ready phase
        lifecycleService.when(LifecyclePhase.Ready).then(() => {
            kiloService.initialize();
        });
    }
}

Registry.as<IWorkbenchContributionsRegistry>(
    WorkbenchExtensions.Workbench
).registerWorkbenchContribution(
    KiloCodeInitializer,
    LifecyclePhase.Restored
);
```

## File Structure for Native Integration

```
vscode/src/vs/
├── platform/
│   └── kilo/                          # KiloCode platform services
│       ├── common/
│       │   ├── kilo.ts               # Service interfaces
│       │   ├── kiloAiService.ts      # AI service interface
│       │   └── kiloProtocol.ts       # Message types
│       ├── browser/
│       │   └── kiloAiService.ts      # Browser implementation
│       └── electron-browser/
│           └── kiloAiService.ts      # Electron implementation
│
├── workbench/
│   └── contrib/
│       └── kilo/                      # Workbench contributions
│           ├── browser/
│           │   ├── kilo.contribution.ts    # Main contribution
│           │   ├── kiloView.ts             # Sidebar view
│           │   ├── kiloChatView.ts         # Chat view
│           │   ├── kiloDiffView.ts         # Diff viewer
│           │   └── kiloPreferences.ts      # Settings editor
│           └── common/
│               └── kiloContextKeys.ts      # Context keys
│
└── workbench/services/
    └── extensions/
        └── electron-browser/
            └── nativeExtensionService.ts  # Hook for built-in extension
```

## Summary

For native KiloCode integration into VS Code:

1. **Register services** using `createDecorator()` and `registerSingleton()`
2. **Register views** via `Registry.as<IViewContainersRegistry>()` and `ViewsRegistry`
3. **Register commands** via `CommandsRegistry.registerCommand()`
4. **Register keybindings** via `KeybindingsRegistry.registerCommandAndKeybindingRule()`
5. **Bypass RPC** for built-in extensions by directly injecting services
6. **Use workbench contributions** for lifecycle-aware initialization
7. **Leverage existing services** for editor access, workspace state, configuration

The key advantage of native integration is direct service access without serialization/RPC overhead, enabling tighter coupling with VS Code's core functionality and better performance for AI features.
