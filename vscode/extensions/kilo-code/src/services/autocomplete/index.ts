import * as vscode from "vscode"
import type { KiloConnectionService } from "../cli-backend"

export function registerAutocompleteProvider(
	_context: vscode.ExtensionContext,
	_connectionService: KiloConnectionService,
): void {
	console.log("[Kilo New] registerAutocompleteProvider: stub")
}
