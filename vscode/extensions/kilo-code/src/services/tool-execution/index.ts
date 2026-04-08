import * as vscode from "vscode"

export function createToolExecutionService(
	_context: vscode.ExtensionContext,
	_workspaceRoot: string,
) {
	const service = {
		dispose() {
			console.log("[Kilo New] ToolExecutionService.dispose: stub")
		},
		async executeTool(
			_toolId: string,
			_args: Record<string, unknown>,
			_sessionId: string,
			_messageId: string,
			_signal: AbortSignal,
			_onMetadata: (metadata: unknown) => void,
		): Promise<unknown> {
			console.log("[Kilo New] ToolExecutionService.executeTool: stub")
			return { status: "stub", output: "" }
		},
	}

	const permissionService = {
		clearState() {
			console.log("[Kilo New] ToolPermissionService.clearState: stub")
		},
	}

	return { service, permissionService }
}
