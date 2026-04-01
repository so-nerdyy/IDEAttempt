import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
	console.log('[KiloCode] Built-in extension activated');
}

export function deactivate() {
	console.log('[KiloCode] Built-in extension deactivated');
}
