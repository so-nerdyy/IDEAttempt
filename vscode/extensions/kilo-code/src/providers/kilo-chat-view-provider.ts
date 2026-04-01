import * as vscode from 'vscode';
import * as crypto from 'crypto';
import type { SessionService } from '../services/session-service';

export class KiloChatViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  static readonly viewType = 'kilo-code.chatView';

  private view: vscode.WebviewView | undefined;
  private readonly sessionService: SessionService;
  private readonly extensionUri: vscode.Uri;

  private readonly _onMessage = new vscode.EventEmitter<any>();
  readonly onMessage = this._onMessage.event;

  constructor(extensionUri: vscode.Uri, sessionService: SessionService) {
    this.extensionUri = extensionUri;
    this.sessionService = sessionService;

    sessionService.onSessionChange(() => {
      this.postMessage({ type: 'sessionChanged', session: this.sessionService.getActiveSession() });
    });

    sessionService.onConnectionStateChange((state) => {
      this.postMessage({ type: 'connectionState', state });
    });
  }

  async resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };

    webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(
      (message) => {
        this._onMessage.fire(message);
        this.handleWebviewMessage(message);
      },
      undefined,
    );

    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this.postMessage({ type: 'viewVisible' });
      }
    });
  }

  private async handleWebviewMessage(message: any): Promise<void> {
    switch (message.type) {
      case 'sendMessage':
        await this.handleSendMessage(message.text);
        break;
      case 'newSession':
        await this.sessionService.createSession();
        break;
      case 'stopGeneration':
        this.postMessage({ type: 'stopGeneration' });
        break;
      case 'openSettings':
        await vscode.commands.executeCommand('kilo-code.settings.open');
        break;
      case 'openProfile':
        await vscode.commands.executeCommand('kilo-code.profile.open');
        break;
    }
  }

  private async handleSendMessage(text: string): Promise<void> {
    const activeSession = this.sessionService.getActiveSession();
    if (!activeSession) {
      const newSession = await this.sessionService.createSession();
      if (!newSession) {
        this.postMessage({ type: 'error', message: 'Failed to create session' });
        return;
      }
    }

    this.postMessage({
      type: 'messageSent',
      text,
      session: this.sessionService.getActiveSession(),
    });

    this.postMessage({ type: 'streamingStart' });

    try {
      const client = await this.getKiloClient();
      if (!client) {
        this.postMessage({ type: 'error', message: 'Not connected to Kilo server' });
        return;
      }

      const session = this.sessionService.getActiveSession();
      if (!session) {
        return;
      }

      const response = await client.session.message({
        path: { sessionID: session.id },
        body: {
          parts: [{ type: 'text', text }],
        },
      });

      if (response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') {
                this.postMessage({ type: 'streamingComplete' });
                continue;
              }
              try {
                const parsed = JSON.parse(data);
                this.postMessage({ type: 'streamChunk', data: parsed });
              } catch {
                // Ignore parse errors
              }
            }
          }
        }
      }

      await this.sessionService.refreshSessions();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to send message';
      this.postMessage({ type: 'error', message });
    }
  }

  postMessage(message: any): void {
    if (this.view) {
      this.view.webview.postMessage(message);
    }
  }

  focusInput(): void {
    this.postMessage({ type: 'focusInput' });
    this.view?.show?.(true);
  }

  private async getKiloClient(): Promise<any | null> {
    try {
      const { createKiloClient } = await import('@kilocode/sdk/v2/client');
      const config = vscode.workspace.getConfiguration('kilo-code');
      config.get<string>('model.providerID', 'kilo');

      return createKiloClient({
        baseUrl: 'http://localhost:0' as any,
        headers: {
          Authorization: 'Bearer local',
        },
      });
    } catch {
      return null;
    }
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    const nonce = crypto.randomBytes(16).toString('hex');

    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview.js'),
    );

    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview.css'),
    );

    const csp = [
      `default-src 'none';`,
      `script-src 'nonce-${nonce}';`,
      `style-src ${webview.cspSource} 'nonce-${nonce}';`,
      `font-src ${webview.cspSource};`,
      `img-src ${webview.cspSource} data:;`,
      `connect-src http://localhost:*;`,
    ].join(' ');

    return `<!DOCTYPE html>
<html lang="en" data-theme="kilo-vscode">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <link rel="stylesheet" href="${styleUri}">
  <title>Kilo Code Chat</title>
  <style>
    html, body {
      margin: 0;
      padding: 0;
      height: 100%;
      overflow: hidden;
    }
    body {
      background-color: var(--vscode-sideBar-background, var(--vscode-editor-background));
      color: var(--vscode-foreground);
      font-family: var(--vscode-font-family);
    }
    #root {
      height: 100%;
    }
  </style>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  dispose(): void {
    this._onMessage.dispose();
  }
}
