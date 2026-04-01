import * as vscode from 'vscode';
import type { SessionItem, SessionService } from '../services/session-service';

export class SessionTreeDataProvider implements vscode.TreeDataProvider<vscode.TreeItem>, vscode.Disposable {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<SessionItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private readonly sessionService: SessionService;
  private searchQuery: string = '';

  constructor(sessionService: SessionService) {
    this.sessionService = sessionService;

    sessionService.onSessionsRefreshed(() => {
      this._onDidChangeTreeData.fire(undefined);
    });

    sessionService.onSessionChange(() => {
      this._onDidChangeTreeData.fire(undefined);
    });
  }

  setSearchQuery(query: string): void {
    this.searchQuery = query;
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
    if (element) {
      return [];
    }

    let sessions = this.sessionService.getSessions();

    if (this.searchQuery.trim()) {
      sessions = await this.sessionService.searchSessions(this.searchQuery);
    }

    const activeSession = this.sessionService.getActiveSession();

    if (sessions.length === 0) {
      const emptyItem = new vscode.TreeItem('No sessions');
      emptyItem.description = 'Click + to create a new session';
      emptyItem.command = {
        command: 'kilo-code.session.new',
        title: 'New Session',
      };
      return [emptyItem];
    }

    return sessions.map(session => this.createSessionTreeItem(session, session.id === activeSession?.id));
  }

  private createSessionTreeItem(session: SessionItem, isActive: boolean): vscode.TreeItem {
    const statusIcon = this.getStatusIcon(session.status);
    const activeIndicator = isActive ? '\u25cf ' : '';

    const item = new vscode.TreeItem(
      `${activeIndicator}${statusIcon} ${session.title}`,
      vscode.TreeItemCollapsibleState.None
    );

    item.id = session.id;
    item.contextValue = 'session';
    item.description = this.formatTimestamp(session.updatedAt);

    item.command = {
      command: 'kilo-code.session.select',
      title: 'Select Session',
      arguments: [session],
    };

    item.tooltip = `${session.title}\nStatus: ${session.status}\nUpdated: ${new Date(session.updatedAt).toLocaleString()}`;

    return item;
  }

  private getStatusIcon(status: SessionItem['status']): string {
    switch (status) {
      case 'working':
        return '$(sync~spin)';
      case 'waiting':
        return '$(debug-pause)';
      case 'error':
        return '$(error)';
      default:
        return '$(circle-outline)';
    }
  }

  private formatTimestamp(ts: number): string {
    const now = Date.now();
    const diff = now - ts;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  }

  dispose() {
    this._onDidChangeTreeData.dispose();
  }
}
