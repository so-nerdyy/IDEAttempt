import * as vscode from "vscode"
import type { KiloConnectionService } from "../services/cli-backend"

export interface Disposable {
	dispose(): void
}

export class AgentManagerProvider implements Disposable {
	public static readonly viewType = "kilo-code.new.AgentManagerPanel"

	private sessionDirectories = new Map<string, string>()

	constructor(
		private readonly host: unknown,
		private readonly connectionService: KiloConnectionService,
	) {}

	continueFromSidebar(sessionId: string, _progress: (status: string, detail?: string, error?: string) => void): Promise<void> {
		console.log("[Kilo New] AgentManagerProvider.continueFromSidebar:", sessionId)
		return Promise.resolve()
	}

	openPanel(): void {
		console.log("[Kilo New] AgentManagerProvider.openPanel: stub")
	}

	handleMessage(_msg: Record<string, unknown>): Promise<Record<string, unknown> | null> {
		return Promise.resolve(null)
	}

	deserializePanel(_ctx: unknown): void {
		console.log("[Kilo New] AgentManagerProvider.deserializePanel: stub")
	}

	getSessionDirectories(): ReadonlyMap<string, string> {
		return this.sessionDirectories
	}

	postMessage(_msg: Record<string, unknown>): void {}

	showTerminalForCurrentSession(): void {
		console.log("[Kilo New] AgentManagerProvider.showTerminalForCurrentSession: stub")
	}

	dispose(): void {}
}
