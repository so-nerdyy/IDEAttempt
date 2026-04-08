import * as vscode from "vscode"
import type { KiloConnectionService } from "../services/cli-backend"

export interface PanelContext {
	panel: vscode.WebviewPanel
	webview: vscode.Webview
}

export class VscodeHost {
	constructor(
		private readonly extensionUri: vscode.Uri,
		private readonly connectionService: KiloConnectionService,
		private readonly context: vscode.ExtensionContext,
	) {}

	wrapExistingPanel(
		panel: vscode.WebviewPanel,
		_opts: {
			onBeforeMessage: (msg: Record<string, unknown>) => Promise<Record<string, unknown> | null>
		},
	): PanelContext {
		return {
			panel,
			webview: panel.webview,
		}
	}
}
