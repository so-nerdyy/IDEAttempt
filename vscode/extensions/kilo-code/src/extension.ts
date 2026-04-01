import * as vscode from 'vscode';
import { SessionService } from './services/session-service';
import { SessionTreeDataProvider } from './providers/session-tree-data-provider';
import { KiloChatViewProvider } from './providers/kilo-chat-view-provider';
import { ServerManager } from './services/server-manager';

export function activate(context: vscode.ExtensionContext) {
  console.log('[KiloCode] Built-in extension activated');

  const sessionService = new SessionService();
  context.subscriptions.push(sessionService);

  const sessionTreeProvider = new SessionTreeDataProvider(sessionService);
  context.subscriptions.push(sessionTreeProvider);

  const sessionTreeView = vscode.window.createTreeView('kilo-code.sessionTree', {
    treeDataProvider: sessionTreeProvider,
    showCollapseAll: false,
  });
  context.subscriptions.push(sessionTreeView);

  const chatViewProvider = new KiloChatViewProvider(context.extensionUri, sessionService);
  context.subscriptions.push(chatViewProvider);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(KiloChatViewProvider.viewType, chatViewProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('kilo-code.session.new', async () => {
      const newSession = await sessionService.createSession();
      if (newSession) {
        await sessionTreeView.reveal(
          new vscode.TreeItem(newSession.title),
          { select: true, focus: true, expand: false },
        );
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('kilo-code.session.delete', async (item?: vscode.TreeItem) => {
      const sessionId = item?.id;
      if (!sessionId) {
        return;
      }

      const confirmation = await vscode.window.showWarningMessage(
        'Delete this session?',
        { modal: true },
        'Delete',
      );

      if (confirmation === 'Delete') {
        const success = await sessionService.deleteSession(sessionId);
        if (!success) {
          await vscode.window.showErrorMessage('Failed to delete session');
        }
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('kilo-code.session.fork', async (item?: vscode.TreeItem) => {
      const sessionId = item?.id;
      if (!sessionId) {
        return;
      }

      const forkedSession = await sessionService.forkSession(sessionId);
      if (forkedSession) {
        await vscode.window.showInformationMessage(`Session forked: ${forkedSession.title}`);
      } else {
        await vscode.window.showErrorMessage('Failed to fork session');
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('kilo-code.session.search', async () => {
      const query = await vscode.window.showInputBox({
        prompt: 'Search sessions',
        placeHolder: 'Enter search term...',
      });

      if (query !== undefined) {
        sessionTreeProvider.setSearchQuery(query);
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('kilo-code.session.select', async (session: any) => {
      await sessionService.setActiveSession(session);
      chatViewProvider.focusInput();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('kilo-code.settings.open', () => {
      void vscode.commands.executeCommand('workbench.action.openSettings', 'kilo-code');
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('kilo-code.profile.open', () => {
      void vscode.commands.executeCommand('kilo-code.settings.open');
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('kilo-code.new.plusButtonClicked', () => {
      void vscode.commands.executeCommand('kilo-code.session.new');
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('kilo-code.new.focusChatInput', () => {
      chatViewProvider.focusInput();
    }),
  );

  async function ensureConnected(): Promise<boolean> {
    if (sessionService.getConnectionState() === 'connected') {
      return true;
    }

    const workspaceDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();

    try {
      const serverManager = new ServerManager(context);
      const info = await serverManager.start(workspaceDir);
      context.subscriptions.push({ dispose: () => serverManager.stop() });
      await sessionService.connect(`http://localhost:${info.port}`, 'local');
      return true;
    } catch {
      await vscode.window.showErrorMessage('Failed to connect to Kilo Code backend');
      return false;
    }
  }

  void ensureConnected().then((connected) => {
    if (connected) {
      void sessionService.refreshSessions();
    }
  });
}

export function deactivate() {
  console.log('[KiloCode] Built-in extension deactivated');
}
