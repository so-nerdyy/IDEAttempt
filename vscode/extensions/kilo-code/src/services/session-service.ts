import * as vscode from 'vscode';

export type SessionStatus = 'idle' | 'working' | 'waiting' | 'error';

export interface SessionItem {
  id: string;
  title: string;
  updatedAt: number;
  createdAt: number;
  status: SessionStatus;
  directory?: string;
  parentID?: string | null;
}

export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'error';

export class SessionService implements vscode.Disposable {
  private readonly _onSessionChange = new vscode.EventEmitter<SessionItem | undefined>();
  private readonly _onSessionsRefreshed = new vscode.EventEmitter<void>();
  private readonly _onConnectionStateChange = new vscode.EventEmitter<ConnectionState>();

  readonly onSessionChange = this._onSessionChange.event;
  readonly onSessionsRefreshed = this._onSessionsRefreshed.event;
  readonly onConnectionStateChange = this._onConnectionStateChange.event;

  private sessions: SessionItem[] = [];
  private activeSession: SessionItem | undefined;
  private connectionState: ConnectionState = 'disconnected';
  private client: any | null = null;

  async connect(baseUrl: string, password: string): Promise<void> {
    this.connectionState = 'connecting';
    this._onConnectionStateChange.fire('connecting');

    try {
      const { createKiloClient } = await import('@kilocode/sdk/v2/client');
      this.client = createKiloClient({
        baseUrl: baseUrl as any,
        headers: {
          Authorization: `Bearer ${password}`,
        },
      });
      this.connectionState = 'connected';
      this._onConnectionStateChange.fire('connected');
      await this.refreshSessions();
    } catch {
      this.connectionState = 'error';
      this._onConnectionStateChange.fire('error');
    }
  }

  async refreshSessions(): Promise<void> {
    if (!this.client) {
      return;
    }

    try {
      const workspaceDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();
      const response = await this.client.session.list({ directory: workspaceDir });
      const sessionList = response?.sessions ?? [];

      this.sessions = sessionList.map((s: any) => ({
        id: s.id,
        title: s.title || 'Untitled Session',
        updatedAt: new Date(s.time.updated).getTime(),
        createdAt: new Date(s.time.created).getTime(),
        status: this.getSessionStatus(s),
        directory: s.directory,
        parentID: s.parentID,
      }));

      this.sessions.sort((a, b) => b.updatedAt - a.updatedAt);
      this._onSessionsRefreshed.fire();
    } catch {
      this.connectionState = 'error';
      this._onConnectionStateChange.fire('error');
    }
  }

  getSessions(): SessionItem[] {
    return this.sessions;
  }

  getActiveSession(): SessionItem | undefined {
    return this.activeSession;
  }

  async setActiveSession(session: SessionItem | undefined): Promise<void> {
    this.activeSession = session;
    this._onSessionChange.fire(session);
  }

  async createSession(): Promise<SessionItem | undefined> {
    if (!this.client) {
      return;
    }

    try {
      const workspaceDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();
      const response = await this.client.session.create({ directory: workspaceDir });
      const newSession: SessionItem = {
        id: response.id,
        title: response.title || 'New Session',
        updatedAt: new Date(response.time.updated).getTime(),
        createdAt: new Date(response.time.created).getTime(),
        status: 'idle',
        directory: response.directory,
        parentID: response.parentID,
      };
      this.sessions.unshift(newSession);
      this.activeSession = newSession;
      this._onSessionChange.fire(newSession);
      this._onSessionsRefreshed.fire();
      return newSession;
    } catch {
      return;
    }
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    if (!this.client) {
      return false;
    }

    try {
      await this.client.session.delete({ path: { sessionID: sessionId } });
      this.sessions = this.sessions.filter(s => s.id !== sessionId);
      if (this.activeSession?.id === sessionId) {
        this.activeSession = this.sessions[0];
      }
      this._onSessionChange.fire(this.activeSession);
      this._onSessionsRefreshed.fire();
      return true;
    } catch {
      return false;
    }
  }

  async forkSession(sessionId: string): Promise<SessionItem | undefined> {
    if (!this.client) {
      return;
    }

    try {
      const response = await this.client.session.fork({
        path: { sessionID: sessionId },
      });
      const forkedSession: SessionItem = {
        id: response.id,
        title: response.title || 'Forked Session',
        updatedAt: new Date(response.time.updated).getTime(),
        createdAt: new Date(response.time.created).getTime(),
        status: 'idle',
        directory: response.directory,
        parentID: sessionId,
      };
      this.sessions.unshift(forkedSession);
      this.activeSession = forkedSession;
      this._onSessionChange.fire(forkedSession);
      this._onSessionsRefreshed.fire();
      return forkedSession;
    } catch {
      return;
    }
  }

  async searchSessions(query: string): Promise<SessionItem[]> {
    if (!query.trim()) {
      return this.sessions;
    }
    const lowerQuery = query.toLowerCase();
    return this.sessions.filter(s =>
      s.title.toLowerCase().includes(lowerQuery)
    );
  }

  getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  dispose() {
    this._onSessionChange.dispose();
    this._onSessionsRefreshed.dispose();
    this._onConnectionStateChange.dispose();
  }

  private getSessionStatus(session: any): SessionStatus {
    if (session.status === 'busy') {
      return 'working';
    }
    if (session.status === 'waiting') {
      return 'waiting';
    }
    if (session.status === 'error') {
      return 'error';
    }
    return 'idle';
  }
}
