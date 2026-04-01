# VS Code Extension Architecture: Integration Points for Native AI

This document analyzes the VS Code codebase to document how extensions are loaded, how the extension API surface works, how to add built-in services, how webviews communicate, and how the workbench contributes UI parts.

---

## 1. Extension Loading and Activation (AbstractExtensionService)

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│  Main Process (Renderer)                                            │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ ExtensionService (browser/extensionService.ts)              │   │
│  │   extends AbstractExtensionService                          │   │
│  │                                                             │   │
│  │  ┌───────────────────────────────────────────────────────┐  │   │
│  │  │ AbstractExtensionService (common/abstractExtensionService.ts) │
│  │  │                                                       │  │   │
│  │  │  - Scans & registers extensions                      │  │   │
│  │  │  - Manages extension host lifecycle                   │  │   │
│  │  │  - Handles activation events                          │  │   │
│  │  │  - Delta extensions (install/uninstall)               │  │   │
│  │  └───────────────────────────────────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐ │
│  │ Local Ext Host   │  │ Web Worker Ext   │  │ Remote Ext Host  │ │
│  │ (process)        │  │ Host (worker)    │  │ (remote server)  │ │
│  │                  │  │                  │  │                  │ │
│  │ ExtensionHost    │  │ WebWorkerExtHost │  │ RemoteExtHost    │ │
│  │ Manager          │  │ Manager          │  │ Manager          │ │
│  └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘ │
└───────────┼─────────────────────┼─────────────────────┼────────────┘
            │ RPC Protocol        │ RPC Protocol        │ RPC Protocol
            ▼                     ▼                     ▼
```

### Key Files

| File | Purpose |
|------|---------|
| `services/extensions/common/abstractExtensionService.ts` | Core extension lifecycle management |
| `services/extensions/browser/extensionService.ts` | Browser-specific implementation |
| `services/extensions/common/extensions.ts` | `IExtensionService` interface definition |
| `services/extensions/common/extensionHostManager.ts` | Manages individual extension host processes |
| `services/extensions/browser/webWorkerExtensionHost.ts` | Web Worker extension host |

### Extension Loading Flow

1. **Scanning**: `ExtensionService._initialize()` scans for extensions from multiple sources:
   - Built-in extensions (`product.json` bundled extensions)
   - Installed extensions (user extensions directory)
   - Development extensions (`--extensionDevelopmentPath`)
   - Remote extensions (if connected to remote)

2. **Registration**: Extensions are registered via `ExtensionDescriptionRegistry`:
   ```typescript
   // abstractExtensionService.ts
   this._registry = new LockableExtensionDescriptionRegistry(this._activationEventReader);
   ```

3. **Extension Host Creation**: `IExtensionHostFactory` creates extension hosts based on extension kind:
   - **Local Process** (Electron only): Runs in a separate Node.js process
   - **Web Worker**: Runs in a browser Web Worker
   - **Remote**: Runs on the remote server

4. **Startup Types** (`ExtensionHostStartup` enum):
   - `EagerAutoStart` (1): Launched immediately, auto-starts
   - `EagerManualStart` (2): Launched immediately, needs `$startExtensionHost` call
   - `LazyAutoStart` (3): Launched only when it has extensions to host

### Activation Flow

Extensions are activated by **events**:

```typescript
// abstractExtensionService.ts
async activateByEvent(activationEvent: string, activationKind?: ActivationKind): Promise<void>
```

Common activation events:
- `onLanguage:<language>` — When a file of a specific language is opened
- `onCommand:<command>` — When a command is invoked
- `onView:<viewId>` — When a view is opened
- `onFileSystem:<scheme>` — When a file system provider is needed
- `*` — Eager activation (startup)
- `onStartupFinished` — After startup completes

### Extension Point System

Extensions contribute functionality via **extension points** defined in `extensionsRegistry.ts`:

```typescript
// ExtensionsRegistry handles package.json contribution points
// Examples: commands, views, keybindings, languages, grammars, themes
const extensionPoints = ExtensionsRegistry;
```

The `AbstractExtensionService._doHandleExtensionPoints()` processes all contribution points when extensions are registered or delta-changed.

---

## 2. Extension API Surface (vscode.d.ts)

### API Factory

The extension API is created by `createApiFactoryAndRegisterActors()` in `api/common/extHost.api.impl.ts`:

```typescript
export function createApiFactoryAndRegisterActors(accessor: ServicesAccessor): IExtensionApiFactory {
  // All extHost services are resolved via accessor
  const initData = accessor.get(IExtHostInitDataService);
  const rpcProtocol = accessor.get(IExtHostRpcService);
  // ... 80+ services registered
  
  // Return the factory that creates the vscode API object per extension
  return function(extension, extensionInfo, configProvider): typeof vscode {
    return {
      // All API namespaces
      commands: extHostCommands.commands,
      window: extHostWindow.window,
      workspace: extHostWorkspace.workspace,
      languages: extHostLanguages.languages,
      // ... etc
    };
  };
}
```

### Key API Namespaces

| Namespace | ExtHost Class | Purpose |
|-----------|--------------|---------|
| `vscode.commands` | `ExtHostCommands` | Register/execute commands |
| `vscode.window` | Multiple (ExtHostWindow, ExtHostTreeViews, ExtHostWebviews, etc.) | UI interactions |
| `vscode.workspace` | `ExtHostWorkspace` | File/workspace operations |
| `vscode.languages` | `ExtHostLanguageFeatures` | Language server integration |
| `vscode.env` | `ExtHostEnv` | Environment info |
| `vscode.extensions` | `ExtHostExtensionService` | Extension management |
| `vscode.chat` | `ExtHostChatAgents2` | Chat agent API |
| `vscode.lm` | `ExtHostLanguageModels` | Language model API |
| `vscode.notebooks` | `ExtHostNotebookController` | Notebook operations |
| `vscode.scm` | `ExtHostSCM` | Source control |
| `vscode.debug` | `ExtHostDebugService` | Debug adapter protocol |
| `vscode.tasks` | `ExtHostTask` | Task execution |
| `vscode.test` | `ExtHostTesting` | Test runner |

### RPC Protocol

Communication between extension host and main thread uses a proxy-based RPC system:

```
Extension Host                    Main Thread
─────────────                    ───────────
ExtHostTreeViews  ───$registerTreeViewDataProvider──▶  MainThreadTreeViews
                  ◀──────────$getChildren─────────────
                  ────$setExpanded───────────────────▶
                  ────$setVisible────────────────────▶
```

- **Proxy identifiers**: Each main/ext pair has a `ProxyIdentifier` (e.g., `MainThreadTreeViews`, `ExtHostTreeViews`)
- **Protocol file**: `api/common/extHost.protocol.ts` defines all RPC interfaces
- **Decorators**: `@extHostNamedCustomer(MainContext.MainThreadTreeViews)` registers main thread handlers

---

## 3. Adding Built-in Services to VS Code's IoC Container

### Service Registration

VS Code uses a custom dependency injection system in `platform/instantiation/`:

```typescript
// Step 1: Define the service interface with a decorator
export const IMyService = createDecorator<IMyService>('myService');

export interface IMyService {
  readonly _serviceBrand: undefined;
  doSomething(): void;
}

// Step 2: Register the singleton
import { InstantiationType, registerSingleton } from '../../platform/instantiation/common/extensions.js';

registerSingleton(IMyService, MyServiceImpl, InstantiationType.Delayed);
// or InstantiationType.Eager for immediate instantiation
```

### Instantiation Types

- **`InstantiationType.Eager`**: Service is created immediately when the service accessor is created
- **`InstantiationType.Delayed`**: Service is created lazily on first access

### Service Collection

Services are stored in a `ServiceCollection`:

```typescript
// platform/instantiation/common/serviceCollection.ts
const services = new ServiceCollection();
services.set(IMyService, new SyncDescriptor(MyServiceImpl));
```

### Dependency Injection

Services declare dependencies via constructor parameters:

```typescript
export class MyServiceImpl implements IMyService {
  declare readonly _serviceBrand: undefined;

  constructor(
    @IInstantiationService instantiationService: IInstantiationService,
    @ILogService logService: ILogService,
    @IConfigurationService configService: IConfigurationService,
  ) {
    // Dependencies are automatically injected
  }
}
```

### Key Platform Services

| Service | Purpose |
|---------|---------|
| `IInstantiationService` | Core DI container |
| `IConfigurationService` | Settings management |
| `IStorageService` | Persistent storage (profile/workspace) |
| `ICommandService` | Command execution |
| `IKeybindingService` | Keyboard shortcut management |
| `IContextMenuService` | Context menu display |
| `IThemeService` | Theming and colors |
| `IContextKeyService` | Context key evaluation (when clauses) |
| `IMenuService` | Menu contribution management |
| `INotificationService` | User notifications |
| `IFileService` | File system operations |
| `IWorkspaceContextService` | Workspace information |

### Workbench-Level Services

Workbench services are registered similarly but live in `workbench/services/`:

```typescript
// Example: IViewsService
registerSingleton(IViewsService, ViewsService, InstantiationType.Delayed);
```

---

## 4. Webviews: Creation and Communication

### Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Main Thread (Renderer)                                      │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ IWebviewService (contrib/webview/browser/webview.ts)   │ │
│  │                                                        │ │
│  │  createWebviewElement() → IWebviewElement              │ │
│  │  createWebviewOverlay() → IOverlayWebview              │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ <iframe> with sandboxed content                        │ │
│  │  - src: vscode-webview://<uuid>/index.html            │ │
│  │  - csp: strict content security policy                │ │
│  │  - origin: unique per webview                          │ │
│  └────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
         │ postMessage() / window.addEventListener('message')
         ▼
┌──────────────────────────────────────────────────────────────┐
│  Extension Host                                              │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ ExtHostWebviews                                        │ │
│  │  - Manages webview lifecycle                          │ │
│  │  - Routes messages between extension and webview      │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ Extension's WebviewViewProvider / CustomEditorProvider │ │
│  │  - Receives messages via webview.onDidReceiveMessage   │ │
│  │  - Sends messages via webview.postMessage()            │ │
│  └────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

### Key Files

| File | Purpose |
|------|---------|
| `contrib/webview/browser/webview.ts` | `IWebviewService` interface, webview creation |
| `contrib/webview/browser/webviewElement.ts` | Actual iframe DOM element management |
| `contrib/webview/browser/overlayWebview.ts` | Lazily-rendered overlay webviews |
| `contrib/webview/browser/webviewMessages.d.ts` | Message type definitions |
| `contrib/webview/browser/resourceLoading.ts` | Resource loading from extensions |
| `api/common/extHostWebview.ts` | Extension host webview API |
| `api/browser/mainThreadWebviews.ts` | Main thread webview handler |

### Webview Types

- **`WebviewContentPurpose.NotebookRenderer`**: Notebook cell output
- **`WebviewContentPurpose.CustomEditor`**: Custom editor views
- **`WebviewContentPurpose.WebviewView`**: Webview-based sidebar views
- **`WebviewContentPurpose.ChatOutputItem`**: Chat response items

### Message Protocol

Webviews communicate via a structured message system:

```typescript
// Main thread → Extension host
// Via RPC: $onMessage(webviewHandle, message)

// Webview iframe → Main thread
// Via postMessage to the host page
// Handled by webviewElement.ts event listeners

// Extension → Webview
// webview.postMessage() → RPC → $postMessage(webviewHandle, message)
```

### Resource Loading

Webviews load resources through a custom protocol:
- `vscode-webview://<uuid>/<path>` — Webview's own resources
- `vscode-resource://<path>` — Extension resources (deprecated, use webview-asWebviewUri)
- Resources are served through `IWebviewResourceLoader`

---

## 5. Workbench UI Parts: Sidebar, Panels, Views

### ViewContainer and ViewDescriptor System

#### Core Types (`workbench/common/views.ts`)

**ViewContainer** — Top-level UI unit (Explorer, Search, Source Control, etc.):
```typescript
interface IViewContainerDescriptor {
  readonly id: string;                           // Unique identifier
  readonly title: ILocalizedString;              // Display name
  readonly icon?: ThemeIcon | URI;              // Activity bar icon
  readonly order?: number;                      // Sort order in activity bar
  readonly ctorDescriptor: SyncDescriptor<IViewPaneContainer>;  // View class
  readonly openCommandActionDescriptor?: {...}; // Command to open
  readonly hideIfEmpty?: boolean;               // Auto-hide when no views
  readonly extensionId?: ExtensionIdentifier;   // Contributing extension
  readonly windowVisibility?: WindowVisibility; // Which window(s)
}
```

**ViewDescriptor** — Individual view within a container:
```typescript
interface IViewDescriptor {
  readonly id: string;                           // Unique identifier
  readonly name: ILocalizedString;              // Display name
  readonly ctorDescriptor: SyncDescriptor<IView>;  // View class
  readonly when?: ContextKeyExpression;         // Visibility condition
  readonly order?: number;                      // Sort order in container
  readonly collapsed?: boolean;                 // Initial state
  readonly canToggleVisibility?: boolean;       // User can show/hide
  readonly hideByDefault?: boolean;             // Start hidden
  readonly workspace?: boolean;                 // Workspace-scoped visibility
  readonly containerIcon?: ThemeIcon | URI;     // Override container icon
  readonly containerTitle?: string;             // Override container title
}
```

**ViewContainerLocation** — Where containers appear:
```typescript
enum ViewContainerLocation {
  Sidebar,       // Left/right sidebar (Explorer, Search, etc.)
  Panel,         // Bottom panel (Terminal, Output, Problems, etc.)
  AuxiliaryBar,  // Right sidebar (Secondary Side Bar)
  ChatBar,       // Chat-specific bar
}
```

#### Registries

Two global registries manage all UI components:

```typescript
// workbench/common/views.ts
export namespace Extensions {
  export const ViewContainersRegistry = 'workbench.registry.view.containers';
  export const ViewsRegistry = 'workbench.registry.view';
}

Registry.add(Extensions.ViewContainersRegistry, new ViewContainersRegistryImpl());
Registry.add(Extensions.ViewsRegistry, new ViewsRegistry());
```

- **`IViewContainersRegistry`**: Manages ViewContainers, organized by `ViewContainerLocation`
- **`IViewsRegistry`**: Manages ViewDescriptors, organized by parent ViewContainer

### How Views Are Registered

#### Native Registration (Built-in)

```typescript
// 1. Register ViewContainer
const container = Registry.as<IViewContainersRegistry>(Extensions.ViewContainersRegistry)
  .registerViewContainer({
    id: 'explorer',
    title: localize2('explorer', 'Explorer'),
    icon: Codicon.files,
    ctorDescriptor: new SyncDescriptor(ViewletViewContainer),
    order: 0,
  }, ViewContainerLocation.Sidebar);

// 2. Register Views within the container
Registry.as<IViewsRegistry>(Extensions.ViewsRegistry)
  .registerViews([{
    id: 'workbench.explorer.fileView',
    name: localize2('files', 'Files'),
    ctorDescriptor: new SyncDescriptor(FilesView),
    when: ContextKeyExpr.true(),
    order: 0,
  }], container);
```

#### Extension Point Registration

Extensions contribute via `package.json`:

```json
{
  "contributes": {
    "viewsContainers": {
      "activitybar": [{ "id": "myContainer", "title": "My Feature", "icon": "icon.svg" }]
    },
    "views": {
      "myContainer": [
        { "id": "myView", "name": "My View", "when": "myContextKey" }
      ]
    }
  }
}
```

Processing flow:
1. `AbstractExtensionService._doHandleExtensionPoints()` processes contribution points
2. `MainThreadTreeViews.$registerTreeViewDataProvider()` connects extension's TreeDataProvider
3. Main thread creates `TreeViewDataProvider` wrapper that RPCs back to extension host

### TreeViewDataProvider: Extension Host ↔ Main Thread

#### Architecture

```
Extension Host                          Main Thread
──────────────                          ───────────
vscode.TreeDataProvider ───getChildren──▶ ExtHostTreeViews
                                              │
                                    $getChildren (RPC)
                                              │
                                              ▼
                                    MainThreadTreeViews
                                              │
                                    TreeViewDataProvider (wrapper)
                                              │
                                    ITreeView (actual tree widget)
                                              │
                                    ViewPane (renders in UI)
```

#### Key Classes

| Class | Location | Purpose |
|-------|----------|---------|
| `MainThreadTreeViews` | `api/browser/mainThreadTreeViews.ts` | Main thread bridge for tree views |
| `ExtHostTreeViews` | `api/common/extHostTreeViews.ts` | Extension host tree view manager |
| `TreeViewDataProvider` | `mainThreadTreeViews.ts` (inner class) | Main thread wrapper that RPCs to extension |
| `ITreeView` | `common/views.ts` | Interface for actual tree widget |
| `ITreeItem` | `common/views.ts` | Serialized tree node data |

#### Data Flow

1. Extension calls `vscode.window.registerTreeDataProvider(viewId, provider)`
2. `ExtHostTreeViews` sends `$registerTreeViewDataProvider` RPC to main thread
3. `MainThreadTreeViews` creates `TreeViewDataProvider` wrapper
4. When tree needs children:
   - `TreeViewDataProvider.getChildren()` → RPC `$getChildren` → Extension's provider
   - Results serialized as `ITreeItem[]` → sent back to main thread
5. `ITreeView.refresh()` updates the UI

#### Key RPC Methods

| Method | Direction | Purpose |
|--------|-----------|---------|
| `$registerTreeViewDataProvider` | Ext → Main | Register a tree data provider |
| `$getChildren` | Main → Ext | Request child nodes |
| `$setExpanded` | Ext → Main | Node expanded/collapsed |
| `$setVisible` | Ext → Main | View visibility changed |
| `$setSelectionAndFocus` | Ext → Main | Selection/focus changed |
| `$changeCheckboxState` | Ext → Main | Checkbox state changed |
| `$refresh` | Ext → Main | Refresh tree data |
| `$reveal` | Ext → Main | Reveal a specific item |

### Workbench Parts Structure

```
┌─────────────────────────────────────────────────────────────────┐
│ TitlebarPart                                                    │
├─────────┬───────────────────────────────────────┬───────────────┤
│         │                                       │               │
│Activity │  SidebarPart                          │ AuxiliaryBar  │
│ Bar     │  (ViewContainerLocation.Sidebar)      │ Part          │
│ Part    │                                       │               │
│         │  ┌─────────────────────────────────┐  │               │
│ [icon]  │  │ ViewPaneContainer               │  │               │
│ [icon]  │  │  ┌───────────────────────────┐  │  │               │
│ [icon]  │  │  │ ViewPane (IView)          │  │  │               │
│ [icon]  │  │  │ ViewPane (IView)          │  │  │               │
│ [icon]  │  │  │ ViewPane (IView)          │  │  │               │
│         │  │  └───────────────────────────┘  │  │               │
│         │  └─────────────────────────────────┘  │               │
│         ├───────────────────────────────────────┤               │
│         │  PanelPart                            │               │
│         │  (ViewContainerLocation.Panel)        │               │
│         │  ┌─────────────────────────────────┐  │               │
│         │  │ ViewPaneContainer               │  │               │
│         │  │  ┌───────────────────────────┐  │  │               │
│         │  │  │ Terminal / Output / etc   │  │  │               │
│         │  │  └───────────────────────────┘  │  │               │
│         │  └─────────────────────────────────┘  │               │
├─────────┴───────────────────────────────────────┴───────────────┤
│ StatusbarPart                                                   │
└─────────────────────────────────────────────────────────────────┘
```

#### Key Part Classes

| Class | File | Purpose |
|-------|------|---------|
| `SidebarPart` | `browser/parts/sidebar/sidebarPart.ts` | Renders sidebar, extends `AbstractPaneCompositePart` |
| `PanelPart` | `browser/parts/panel/panelPart.ts` | Renders bottom panel |
| `ActivitybarPart` | `browser/parts/activitybar/activitybarPart.ts` | Activity bar icons and menu |
| `AbstractPaneCompositePart` | `browser/parts/paneCompositePart.ts` | Base class for all pane composite parts |
| `PaneCompositeBar` | `browser/parts/paneCompositeBar.ts` | Tab/icon bar for view containers |
| `ViewPaneContainer` | `browser/parts/views/viewPaneContainer.ts` | Container holding multiple ViewPanes |
| `ViewPane` | `browser/parts/views/viewPane.ts` | Individual collapsible pane |
| `PaneCompositePartService` | `browser/parts/paneCompositePartService.ts` | Maps locations to parts |

### Service Relationships

```
┌──────────────────────────────────────────────────────────────┐
│  Global Registries                                           │
│  ┌──────────────────────┐  ┌────────────────────────────┐   │
│  │ IViewContainersRegistry │ │ IViewsRegistry             │   │
│  │ (all containers)     │  │ (all view descriptors)     │   │
│  └──────────┬───────────┘  └─────────────┬──────────────┘   │
└─────────────┼────────────────────────────┼──────────────────┘
              │                            │
              ▼                            ▼
┌──────────────────────────────────────────────────────────────┐
│  IViewDescriptorService                                      │
│  - Bridges registries with runtime state                     │
│  - Creates ViewContainerModel per container                  │
│  - Manages context keys for when clauses                     │
│  - Handles user customization (drag-and-drop reordering)     │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ ViewContainerModel (per ViewContainer)                 │ │
│  │  - allViewDescriptors  (registered)                    │ │
│  │  - activeViewDescriptors  (when clause matches)        │ │
│  │  - visibleViewDescriptors  (active + user-visible)     │ │
│  │  - collapsed/size/order state                          │ │
│  └────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
              │
              ▼
┌──────────────────────────────────────────────────────────────┐
│  IViewsService                                               │
│  - High-level API for opening/closing views                  │
│  - Delegates to PaneCompositePartService for rendering       │
│  - Uses IViewDescriptorService for location/visibility       │
└──────────────────────────────────────────────────────────────┘
              │
              ▼
┌──────────────────────────────────────────────────────────────┐
│  PaneCompositePartService                                    │
│  - Creates SidebarPart, PanelPart, AuxiliaryBarPart          │
│  - Maps ViewContainerLocation → IPaneCompositePart           │
│  - Manages active/visible pane composites                    │
└──────────────────────────────────────────────────────────────┘
```

### How to Register a New View Container, View, and Activity Bar Item Natively

#### Step 1: Create the View Class

```typescript
// workbench/contrib/myFeature/browser/myViewPane.ts
import { ViewPane } from '../../../browser/parts/views/viewPane.js';
import { IViewletViewOptions } from '../../../browser/parts/views/viewsViewlet.js';

export class MyViewPane extends ViewPane {
  constructor(
    options: IViewletViewOptions,
    @IKeybindingService keybindingService: IKeybindingService,
    @IContextMenuService contextMenuService: IContextMenuService,
    @IConfigurationService configurationService: IConfigurationService,
    @IContextKeyService contextKeyService: IContextKeyService,
    @IViewDescriptorService viewDescriptorService: IViewDescriptorService,
    @IInstantiationService instantiationService: IInstantiationService,
    @IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
    @IThemeService themeService: IThemeService,
  ) {
    super(options, keybindingService, contextMenuService, configurationService,
          contextKeyService, viewDescriptorService, instantiationService,
          layoutService, themeService);
  }

  override renderBody(container: HTMLElement): void {
    super.renderBody(container);
    // Render your view content here
  }

  override layoutBody(height: number, width: number): void {
    super.layoutBody(height, width);
    // Handle resize
  }
}
```

#### Step 2: Register the View Container and Views

```typescript
// workbench/contrib/myFeature/browser/myFeature.contribution.ts
import { Registry } from '../../../../platform/registry/common/platform.js';
import { Extensions, IViewContainersRegistry, IViewsRegistry, ViewContainerLocation } from '../../../common/views.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { localize2 } from '../../../../nls.js';
import { MyViewPane } from './myViewPane.js';
import { ViewPaneContainer } from '../../../browser/parts/views/viewPaneContainer.js';

// Register ViewContainer (creates activity bar item automatically)
const myContainer = Registry.as<IViewContainersRegistry>(Extensions.ViewContainersRegistry)
  .registerViewContainer({
    id: 'myFeature',
    title: localize2('myFeature', 'My Feature'),
    icon: myFeatureIcon,  // A registered ThemeIcon
    ctorDescriptor: new SyncDescriptor(ViewPaneContainer),
    order: 10,  // Position in activity bar
  }, ViewContainerLocation.Sidebar);

// Register Views within the container
Registry.as<IViewsRegistry>(Extensions.ViewsRegistry)
  .registerViews([{
    id: 'myFeature.myView',
    name: localize2('myView', 'My View'),
    ctorDescriptor: new SyncDescriptor(MyViewPane),
    when: ContextKeyExpr.has('myFeatureEnabled'),
    order: 1,
    collapsed: false,
  }], myContainer);
```

#### Step 3: Register Commands and Keybindings

```typescript
import { registerAction2, Action2, MenuId } from '../../../../platform/actions/common/actions.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { KeyMod, KeyCode } from '../../../../base/common/keyCodes.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { localize2 } from '../../../../nls.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';

registerAction2(class extends Action2 {
  constructor() {
    super({
      id: 'myFeature.openView',
      title: localize2('openView', 'Open My View'),
      category: Categories.View,
      menu: [{ id: MenuId.CommandPalette }],
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyM,
      },
    });
  }
  run(accessor: ServicesAccessor): void {
    const viewsService = accessor.get(IViewsService);
    viewsService.openView('myFeature.myView', true);
  }
});
```

#### Activity Bar Item

The activity bar item is **automatically created** when you register a ViewContainer with an icon. The `ActivitybarPart` reads from `IViewContainersRegistry` and creates an action for each container via `ActivityBarCompositeBar`. No separate registration needed.

### Extension vs Native Registration Comparison

| Aspect | Extension Contributed | Native Registration |
|--------|----------------------|---------------------|
| **Declaration** | `package.json` `contributes.viewsContainers` + `contributes.views` | `Registry.as().registerViewContainer()` + `registerViews()` |
| **View Class** | Extension provides `TreeDataProvider` implementation | Direct `SyncDescriptor<IView>` class reference |
| **Activation** | Lazy — activated when view becomes visible | Eager — registered at workbench startup |
| **RPC** | Cross-process (extHost ↔ main thread) | Same process, direct method calls |
| **Performance** | Slower (serialization + IPC) | Fast (direct instantiation) |
| **Tree Data** | `getChildren()` via RPC `$getChildren` | Direct `ITreeViewDataProvider.getChildren()` |
| **Visibility** | Controlled by extension's `when` clause + package.json | Controlled by `ContextKeyExpression` + `IViewDescriptorService` |

---

## 6. Key Integration Points for KiloCode

### Where to Hook In

1. **New ViewContainer**: Register via `IViewContainersRegistry.registerViewContainer()` with `ViewContainerLocation.Sidebar` or `ChatBar` for AI-related views

2. **Custom Views**: Extend `ViewPane` for native views, or use `ITreeView` for tree-based content

3. **Commands**: Use `registerAction2(Action2)` for commands, `MenuId.CommandPalette` for palette entries

4. **Keybindings**: Define in `keybinding` property of `Action2` options, or via `IKeybindings` in view descriptors

5. **Context Keys**: Define `when` clauses using `ContextKeyExpr` to control view visibility

6. **Service Extension**: Register new services via `registerSingleton()` in `platform/instantiation/common/extensions.js`

### Services to Extend or Replace

| Service | Recommendation | Reason |
|---------|---------------|--------|
| `IViewsService` | Use as-is | Already provides open/close/view query APIs |
| `IViewDescriptorService` | Use as-is | Handles view state, location, visibility |
| `IExtensionService` | Extend for native activation | May need to bypass extension host for built-in AI features |
| `AbstractExtensionService` | Extend, don't replace | Core lifecycle — modifications affect all extensions |
| `IWebviewService` | Use as-is | Handles webview creation, messaging, resource loading |
| `ICommandService` | Use as-is | Command execution is already generic |
| `IKeybindingService` | Use as-is | Keybinding registration works for native code |

### What NOT to Replace

- **The registry system** (`IViewContainersRegistry`, `IViewsRegistry`) — extend, don't replace
- **The `ViewContainerModel`** — handles complex state management, persistence, context keys
- **The `PaneCompositePartService`** — manages the physical parts (sidebar, panel, auxiliary bar)
- **The RPC protocol** — well-tested cross-process communication layer
- **The `InstantiationService`** — core DI container, deeply integrated throughout

### Recommended Integration Approach

For native AI features that currently run as extensions:

1. **Register views natively**: Use `IViewContainersRegistry` + `IViewsRegistry` instead of `package.json` contributions
2. **Implement views directly**: Extend `ViewPane` rather than using `TreeDataProvider` with RPC overhead
3. **Use existing services**: Leverage `IViewsService`, `ICommandService`, `IKeybindingService` as-is
4. **Add new services**: Register AI-specific services via `registerSingleton()` for chat, code generation, etc.
5. **Keep webviews where needed**: For complex UI (chat interface), webviews are still appropriate — use `IWebviewService` natively

---

## 7. Extension Host Process Lifecycle Details

### Spawn Phase

The extension host is spawned as a separate Node.js process via `IExtensionHostStarter` (Electron `UtilityProcess`). The transport is determined by `ExtHostConnectionType`:

| Transport | Use Case | Setup |
|-----------|----------|-------|
| **MessagePort** | Electron sandbox mode | Parent sends `MessagePortMain` to child |
| **Socket** | Remote/desktop mode | Socket handle via `process.send` |
| **Named Pipe** | Local mode | `net.createConnection(pipeName)` |

Environment variables set on the extension host process:

```
VSCODE_ESM_ENTRYPOINT=vs/workbench/api/node/extensionHostProcess
VSCODE_HANDLES_UNCAUGHT_ERRORS=true
```

### Init Phase

1. Extension host sends `MessageType.Ready` to main thread
2. Main thread sends `IExtensionHostInitData` (JSON-serialized workspace, extensions, environment, telemetry, remote info)
3. Extension host validates commit/version match with main process
4. Starts watchdog (`process.kill(parentPid, 0)` every second + native `@vscode/native-watchdog`)
5. Extension host sends `MessageType.Initialized` back
6. Main thread instantiates all "customers" (main thread services)

### Ready Phase

Main thread's `ExtensionHostManager._createExtensionHostCustomers()`:

1. Creates `RPCProtocol` wrapping the `IMessagePassingProtocol`
2. Builds `IExtHostContext` wrapping the RPC protocol
3. Iterates `ExtHostCustomersRegistry.getNamedCustomers()` — for each:
   - Creates instance via `_instantiationService.createInstance(ctor, extHostContext)`
   - Registers with `rpcProtocol.set(id, instance)`
4. Validates all expected named proxies are registered via `assertRegistered()`

### ExtHost Customers

"Customers" are main-thread services that act as the **main-thread half** of a split API. Each customer:

- Lives in the main thread (renderer/Electron process)
- Is decorated with `@extHostNamedCustomer(MainContext.SomeShape)` or `@extHostCustomer`
- Receives `IExtHostContext` in its constructor
- Uses `context.getProxy(ExtHostContext.SomeShape)` to get a proxy to the extension-host-side counterpart
- Implements a `MainThread*Shape` interface whose `$`-prefixed methods are called by the extension host via RPC

There are ~80+ main thread customers covering every VS Code API surface. They are registered via **side-effect imports** in `extensionHost.contribution.ts`.

### RPC Protocol Details

`RPCProtocol` (`services/extensions/common/rpcProtocol.ts`) provides bidirectional RPC:

- **Proxy creation** (`getProxy`): Uses JavaScript `Proxy` objects. Calling `proxy.$someMethod(args)` serializes into a message with `rpcId` (numeric identifier), `methodName`, and serialized args
- **Local registration** (`set`): Stores instances in `this._locals[rpcId]`. Incoming requests dispatch to `this._locals[rpcId][methodName](...args)`
- **Message types**: `RequestJSONArgs`, `RequestMixedArgs`, `ReplyOKEmpty`, `ReplyOKJSON`, `ReplyErrError`, `Cancel`, `Acknowledged`
- **Serialization**: Supports pure JSON, mixed args (strings + VSBuffers + `SerializableObjectWithBuffers`), and efficient binary buffer transfer
- **Cancellation**: Supports `CancellationToken` — separate `Cancel` message aborts in-flight requests
- **Responsiveness tracking**: Fires `ResponsiveState.Unresponsive` after 3 seconds of unacknowledged requests

### ProxyIdentifier

Each proxy-able interface gets a `ProxyIdentifier` with a string `sid` (debug name) and auto-incremented numeric `nid`. The `nid` is used as the array index in `_locals` and `_proxies` for O(1) dispatch.

```typescript
// extHost.protocol.ts
export const MainContext = {
  MainThreadCommands: createProxyIdentifier<MainThreadCommandsShape>('MainThreadCommands'),
  MainThreadTreeViews: createProxyIdentifier<MainThreadTreeViewsShape>('MainThreadTreeViews'),
  // ... 80+ more
};

export const ExtHostContext = {
  ExtHostCommands: createProxyIdentifier<ExtHostCommandsShape>('ExtHostCommands'),
  ExtHostTreeViews: createProxyIdentifier<ExtHostTreeViewsShape>('ExtHostTreeViews'),
  // ... 50+ more
};
```

---

## 8. IExtHostContext Interface

```typescript
export interface IExtHostContext extends IRPCProtocol {
  readonly remoteAuthority: string | null;
  readonly extensionHostKind: ExtensionHostKind;
}

export interface IInternalExtHostContext extends IExtHostContext {
  readonly internalExtensionService: IInternalExtensionService;
  _setExtensionHostProxy(value: IExtensionHostProxy): void;
  _setAllMainProxyIdentifiers(value: ProxyIdentifier<unknown>[]): void;
}
```

**Role**: `IExtHostContext` is the **bridge object** passed to every main-thread customer constructor. It provides:

- `getProxy<T>(identifier)` — returns a typed proxy to call methods on the extension host side
- `set(identifier, instance)` — registers a local object so the extension host can call back
- `dispose()` / `drain()` / `assertRegistered()` — lifecycle and validation utilities
- `remoteAuthority` / `extensionHostKind` — metadata about which extension host (local process, web worker, or remote)

---

## 9. Webview Messaging Protocol Details

### Transport: MessagePort (not direct postMessage)

When the iframe loads, it sends a `webview-ready` message with a `MessagePort` transfer. All subsequent communication uses this port.

### Main Thread → Webview Channels

| Channel | Purpose | Triggered By |
|---------|---------|-------------|
| `content` | HTML content update | `webview.html = "..."` |
| `message` | Extension `postMessage()` data | `webview.postMessage(data)` |
| `did-load-resource` | Resource loading response | Resource request completion |
| `styles` | CSS style updates | Theme change |
| `set-title` | Document title | Title change |
| `focus` | Focus the webview | `webview.focus()` |
| `find` | Find-in-page | Search operations |

### Webview → Main Thread Channels

| Channel | Purpose | Triggered By |
|---------|---------|-------------|
| `onmessage` | `acquireVsCodeApi().postMessage()` | Extension webview script |
| `did-click-link` | Link clicked | User interaction |
| `did-focus` / `did-blur` | Focus changes | User interaction |
| `did-scroll` | Scroll position | User scrolling |
| `load-resource` | Resource loading request | Webview resource request |
| `fatal-error` | Unrecoverable error | Webview crash |
| `did-context-menu` | Right-click context menu | User interaction |
| `did-keydown` / `did-keyup` | Keyboard events | User typing |
| `drag` | Drag-and-drop | User drag |
| `updated-intrinsic-content-size` | Size change | Content resize |

### Serialization

`extHostWebviewMessaging.ts` handles ArrayBuffer extraction with `$$vscode_array_buffer_reference$$` placeholders for efficient binary transfer. Messages are deserialized with typed array reconstruction on the receiving end.

---

## 10. Native Command, View, and Keybinding Registration Patterns

### Commands via Action2

The preferred pattern for native command registration is `Action2`:

```typescript
import { registerAction2, Action2 } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { localize2 } from '../../../../nls.js';
import { MenuId } from '../../../../platform/actions/common/actions.js';

registerAction2(class OpenMyFeatureAction extends Action2 {
  constructor() {
    super({
      id: 'myFeature.open',
      title: localize2('myFeature.open', 'Open My Feature'),
      category: localize2('myFeature.category', 'My Feature'),
      f1: true, // Command Palette (F1)
      precondition: MyContextKey,
      menu: [
        { id: MenuId.CommandPalette, when: MyContextKey },
        { id: MenuId.EditorContext, when: MyContextKey, group: 'navigation', order: 1 },
      ],
      keybinding: {
        primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyM,
        when: MyContextKey,
      },
    });
  }

  run(accessor: ServicesAccessor, ...args: any[]): void {
    const myService = accessor.get(IMyService);
    myService.doSomething(...args);
  }
});
```

### Keybindings via KeybindingsRegistry

For more complex keybinding rules:

```typescript
import { KeybindingsRegistry, KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';

KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: 'myFeature.doSomething',
  weight: KeybindingWeight.WorkbenchContrib,
  when: ContextKeyExpr.and(MyContextKey, ContextKeyExpr.equals('resourceLangId', 'typescript')),
  primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyM,
  mac: { primary: KeyMod.WinCtrl | KeyMod.Shift | KeyCode.KeyM },
  handler: MyCommandHandler,
});
```

### Menu Items via MenuRegistry

```typescript
import { MenuRegistry, MenuId } from '../../../../platform/actions/common/actions.js';

MenuRegistry.appendMenuItem(MenuId.EditorContext, {
  command: {
    id: 'myFeature.doSomething',
    title: localize2('myFeature.doSomething', 'Do Something'),
  },
  when: MyContextKey,
  group: 'navigation',
  order: 1,
});
```

### Common MenuId Values

| MenuId | Location |
|--------|----------|
| `MenuId.CommandPalette` | Command palette (F1) |
| `MenuId.EditorContext` | Editor right-click menu |
| `MenuId.EditorTitle` | Editor tab title bar |
| `MenuId.ExplorerContext` | Explorer right-click menu |
| `MenuId.ViewTitle` | View panel title bar |
| `MenuId.ViewItemContext` | Tree view item right-click menu |
| `MenuId.TerminalContext` | Terminal right-click menu |
| `MenuId.SCMTitle` | Source control title bar |
| `MenuId.SCMResourceContext` | SCM resource group context menu |

### Context Keys

```typescript
import { ContextKeyExpr, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';

// Define
export const MyContextKey = new RawContextKey<boolean>('myFeature.enabled', false);

// Set
constructor(@IContextKeyService contextKeyService: IContextKeyService) {
  const myKey = MyContextKey.bindTo(contextKeyService.createScoped());
  myKey.set(true);
}

// Use in when clauses
when: ContextKeyExpr.and(MyContextKey, ContextKeyExpr.equals('resourceLangId', 'typescript')),
```

---

## 7. Extension Host Process Lifecycle Details

### Spawn Phase

The extension host is spawned as a separate Node.js process via `IExtensionHostStarter` (Electron `UtilityProcess`). The transport is determined by `ExtHostConnectionType`:

| Transport | Use Case | Setup |
|-----------|----------|-------|
| **MessagePort** | Electron sandbox mode | Parent sends `MessagePortMain` to child |
| **Socket** | Remote/desktop mode | Socket handle via `process.send` |
| **Named Pipe** | Local mode | `net.createConnection(pipeName)` |

Environment variables set on the extension host process:

```
VSCODE_ESM_ENTRYPOINT=vs/workbench/api/node/extensionHostProcess
VSCODE_HANDLES_UNCAUGHT_ERRORS=true
```

### Init Phase

1. Extension host sends `MessageType.Ready` to main thread
2. Main thread sends `IExtensionHostInitData` (JSON-serialized workspace, extensions, environment, telemetry, remote info)
3. Extension host validates commit/version match with main process
4. Starts watchdog (`process.kill(parentPid, 0)` every second + native `@vscode/native-watchdog`)
5. Extension host sends `MessageType.Initialized` back
6. Main thread instantiates all "customers" (main thread services)

### Ready Phase

Main thread's `ExtensionHostManager._createExtensionHostCustomers()`:

1. Creates `RPCProtocol` wrapping the `IMessagePassingProtocol`
2. Builds `IExtHostContext` wrapping the RPC protocol
3. Iterates `ExtHostCustomersRegistry.getNamedCustomers()` — for each:
   - Creates instance via `_instantiationService.createInstance(ctor, extHostContext)`
   - Registers with `rpcProtocol.set(id, instance)`
4. Validates all expected named proxies are registered via `assertRegistered()`

### ExtHost Customers

"Customers" are main-thread services that act as the **main-thread half** of a split API. Each customer:

- Lives in the main thread (renderer/Electron process)
- Is decorated with `@extHostNamedCustomer(MainContext.SomeShape)` or `@extHostCustomer`
- Receives `IExtHostContext` in its constructor
- Uses `context.getProxy(ExtHostContext.SomeShape)` to get a proxy to the extension-host-side counterpart
- Implements a `MainThread*Shape` interface whose `$`-prefixed methods are called by the extension host via RPC

There are ~80+ main thread customers covering every VS Code API surface. They are registered via **side-effect imports** in `extensionHost.contribution.ts`.

### RPC Protocol Details

`RPCProtocol` (`services/extensions/common/rpcProtocol.ts`) provides bidirectional RPC:

- **Proxy creation** (`getProxy`): Uses JavaScript `Proxy` objects. Calling `proxy.$someMethod(args)` serializes into a message with `rpcId` (numeric identifier), `methodName`, and serialized args
- **Local registration** (`set`): Stores instances in `this._locals[rpcId]`. Incoming requests dispatch to `this._locals[rpcId][methodName](...args)`
- **Message types**: `RequestJSONArgs`, `RequestMixedArgs`, `ReplyOKEmpty`, `ReplyOKJSON`, `ReplyErrError`, `Cancel`, `Acknowledged`
- **Serialization**: Supports pure JSON, mixed args (strings + VSBuffers + `SerializableObjectWithBuffers`), and efficient binary buffer transfer
- **Cancellation**: Supports `CancellationToken` — separate `Cancel` message aborts in-flight requests
- **Responsiveness tracking**: Fires `ResponsiveState.Unresponsive` after 3 seconds of unacknowledged requests

### ProxyIdentifier

Each proxy-able interface gets a `ProxyIdentifier` with a string `sid` (debug name) and auto-incremented numeric `nid`. The `nid` is used as the array index in `_locals` and `_proxies` for O(1) dispatch.

```typescript
// extHost.protocol.ts
export const MainContext = {
  MainThreadCommands: createProxyIdentifier<MainThreadCommandsShape>('MainThreadCommands'),
  MainThreadTreeViews: createProxyIdentifier<MainThreadTreeViewsShape>('MainThreadTreeViews'),
  // ... 80+ more
};

export const ExtHostContext = {
  ExtHostCommands: createProxyIdentifier<ExtHostCommandsShape>('ExtHostCommands'),
  ExtHostTreeViews: createProxyIdentifier<ExtHostTreeViewsShape>('ExtHostTreeViews'),
  // ... 50+ more
};
```

---

## 8. IExtHostContext Interface

```typescript
export interface IExtHostContext extends IRPCProtocol {
  readonly remoteAuthority: string | null;
  readonly extensionHostKind: ExtensionHostKind;
}

export interface IInternalExtHostContext extends IExtHostContext {
  readonly internalExtensionService: IInternalExtensionService;
  _setExtensionHostProxy(value: IExtensionHostProxy): void;
  _setAllMainProxyIdentifiers(value: ProxyIdentifier<unknown>[]): void;
}
```

**Role**: `IExtHostContext` is the **bridge object** passed to every main-thread customer constructor. It provides:

- `getProxy<T>(identifier)` — returns a typed proxy to call methods on the extension host side
- `set(identifier, instance)` — registers a local object so the extension host can call back
- `dispose()` / `drain()` / `assertRegistered()` — lifecycle and validation utilities
- `remoteAuthority` / `extensionHostKind` — metadata about which extension host (local process, web worker, or remote)

---

## 9. Webview Messaging Protocol Details

### Transport: MessagePort (not direct postMessage)

When the iframe loads, it sends a `webview-ready` message with a `MessagePort` transfer. All subsequent communication uses this port.

### Main Thread → Webview Channels

| Channel | Purpose | Triggered By |
|---------|---------|-------------|
| `content` | HTML content update | `webview.html = "..."` |
| `message` | Extension `postMessage()` data | `webview.postMessage(data)` |
| `did-load-resource` | Resource loading response | Resource request completion |
| `styles` | CSS style updates | Theme change |
| `set-title` | Document title | Title change |
| `focus` | Focus the webview | `webview.focus()` |
| `find` | Find-in-page | Search operations |

### Webview → Main Thread Channels

| Channel | Purpose | Triggered By |
|---------|---------|-------------|
| `onmessage` | `acquireVsCodeApi().postMessage()` | Extension webview script |
| `did-click-link` | Link clicked | User interaction |
| `did-focus` / `did-blur` | Focus changes | User interaction |
| `did-scroll` | Scroll position | User scrolling |
| `load-resource` | Resource loading request | Webview resource request |
| `fatal-error` | Unrecoverable error | Webview crash |
| `did-context-menu` | Right-click context menu | User interaction |
| `did-keydown` / `did-keyup` | Keyboard events | User typing |
| `drag` | Drag-and-drop | User drag |
| `updated-intrinsic-content-size` | Size change | Content resize |

### Serialization

`extHostWebviewMessaging.ts` handles ArrayBuffer extraction with `$$vscode_array_buffer_reference$$` placeholders for efficient binary transfer. Messages are deserialized with typed array reconstruction on the receiving end.

---

## 10. Native Command, View, and Keybinding Registration Patterns

### Commands via Action2

The preferred pattern for native command registration is `Action2`:

```typescript
import { registerAction2, Action2 } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { localize2 } from '../../../../nls.js';
import { MenuId } from '../../../../platform/actions/common/actions.js';

registerAction2(class OpenMyFeatureAction extends Action2 {
  constructor() {
    super({
      id: 'myFeature.open',
      title: localize2('myFeature.open', 'Open My Feature'),
      category: localize2('myFeature.category', 'My Feature'),
      f1: true, // Command Palette (F1)
      precondition: MyContextKey,
      menu: [
        { id: MenuId.CommandPalette, when: MyContextKey },
        { id: MenuId.EditorContext, when: MyContextKey, group: 'navigation', order: 1 },
      ],
      keybinding: {
        primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyM,
        when: MyContextKey,
      },
    });
  }

  run(accessor: ServicesAccessor, ...args: any[]): void {
    const myService = accessor.get(IMyService);
    myService.doSomething(...args);
  }
});
```

### Keybindings via KeybindingsRegistry

For more complex keybinding rules:

```typescript
import { KeybindingsRegistry, KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';

KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: 'myFeature.doSomething',
  weight: KeybindingWeight.WorkbenchContrib,
  when: ContextKeyExpr.and(MyContextKey, ContextKeyExpr.equals('resourceLangId', 'typescript')),
  primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyM,
  mac: { primary: KeyMod.WinCtrl | KeyMod.Shift | KeyCode.KeyM },
  handler: MyCommandHandler,
});
```

### Menu Items via MenuRegistry

```typescript
import { MenuRegistry, MenuId } from '../../../../platform/actions/common/actions.js';

MenuRegistry.appendMenuItem(MenuId.EditorContext, {
  command: {
    id: 'myFeature.doSomething',
    title: localize2('myFeature.doSomething', 'Do Something'),
  },
  when: MyContextKey,
  group: 'navigation',
  order: 1,
});
```

### Common MenuId Values

| MenuId | Location |
|--------|----------|
| `MenuId.CommandPalette` | Command palette (F1) |
| `MenuId.EditorContext` | Editor right-click menu |
| `MenuId.EditorTitle` | Editor tab title bar |
| `MenuId.ExplorerContext` | Explorer right-click menu |
| `MenuId.ViewTitle` | View panel title bar |
| `MenuId.ViewItemContext` | Tree view item right-click menu |
| `MenuId.TerminalContext` | Terminal right-click menu |
| `MenuId.SCMTitle` | Source control title bar |
| `MenuId.SCMResourceContext` | SCM resource group context menu |

### Context Keys

```typescript
import { ContextKeyExpr, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';

// Define
export const MyContextKey = new RawContextKey<boolean>('myFeature.enabled', false);

// Set
constructor(@IContextKeyService contextKeyService: IContextKeyService) {
  const myKey = MyContextKey.bindTo(contextKeyService.createScoped());
  myKey.set(true);
}

// Use in when clauses
when: ContextKeyExpr.and(MyContextKey, ContextKeyExpr.equals('resourceLangId', 'typescript')),
```
