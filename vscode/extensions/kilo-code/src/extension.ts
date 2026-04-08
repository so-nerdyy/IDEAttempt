import * as vscode from "vscode"
import { KiloProvider } from "./KiloProvider"
import { AgentManagerProvider } from "./agent-manager/AgentManagerProvider"
import { VscodeHost } from "./agent-manager/vscode-host"
import { DiffViewerProvider } from "./providers/DiffViewerProvider"
import { SettingsEditorProvider } from "./providers/SettingsEditorProvider"
import { SubAgentViewerProvider } from "./providers/SubAgentViewerProvider"
import { EXTENSION_DISPLAY_NAME } from "./constants"
import { KiloConnectionService } from "./services/cli-backend"
import { registerAutocompleteProvider } from "./services/autocomplete"
import { ensureBackendForAutocomplete } from "./services/autocomplete/ensure-backend"
import { AutocompleteServiceManager } from "./services/autocomplete/AutocompleteServiceManager"
import { BrowserAutomationService } from "./services/browser-automation"
import { TelemetryProxy } from "./services/telemetry"
import { registerCommitMessageService } from "./services/commit-message"
import { registerCodeActions, registerTerminalActions, KiloCodeActionProvider } from "./services/code-actions"
import { registerToggleAutoApprove } from "./commands/toggle-auto-approve"
import { createToolExecutionService } from "./services/tool-execution"

export function activate(context: vscode.ExtensionContext) {
	console.log("Kilo Code extension is now active")

	const telemetry = TelemetryProxy.getInstance()

	const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd()

	const { service: toolExecutionService, permissionService: toolPermissionService } =
		createToolExecutionService(context, workspaceRoot)

	const connectionService = new KiloConnectionService(context)

	const browserAutomationService = new BrowserAutomationService(connectionService)
	browserAutomationService.syncWithSettings()

	const unsubscribeStateChange = connectionService.onStateChange((state) => {
		if (state === "connected") {
			browserAutomationService.reregisterIfEnabled()
			const config = connectionService.getServerConfig()
			if (config) {
				telemetry.configure(config.baseUrl, config.password)
			}
			AutocompleteServiceManager.getInstance()?.load()
		}
	})

	const provider = new KiloProvider(context.extensionUri, connectionService, context)

	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(KiloProvider.viewType, provider, {
			webviewOptions: { retainContextWhenHidden: true },
		}),
	)

	ensureCommandsSkipShell(["kilo-code.new.agentManagerOpen", "kilo-code.new.agentManager.showTerminal"])

	const agentManagerHost = new VscodeHost(context.extensionUri, connectionService, context)
	const agentManagerProvider = new AgentManagerProvider(agentManagerHost, connectionService)
	context.subscriptions.push(agentManagerProvider)

	provider.setContinueInWorktreeHandler((sessionId, progress) =>
		agentManagerProvider.continueFromSidebar(sessionId, progress),
	)

	context.subscriptions.push(
		vscode.window.registerWebviewPanelSerializer(AgentManagerProvider.viewType, {
			deserializeWebviewPanel(panel: vscode.WebviewPanel) {
				const ctx = agentManagerHost.wrapExistingPanel(panel, {
					onBeforeMessage: (msg) => agentManagerProvider.handleMessage(msg),
				})
				agentManagerProvider.deserializePanel(ctx)
				return Promise.resolve()
			},
		}),
	)

	context.subscriptions.push(
		vscode.window.registerWebviewPanelSerializer("kilo-code.new.TabPanel", {
			deserializeWebviewPanel(panel: vscode.WebviewPanel) {
				const tabProvider = new KiloProvider(context.extensionUri, connectionService, context)
				tabProvider.setContinueInWorktreeHandler((sessionId, progress) =>
					agentManagerProvider.continueFromSidebar(sessionId, progress),
				)
				tabProvider.resolveWebviewPanel(panel)
				panel.onDidDispose(
					() => {
						console.log("[Kilo New] Tab panel restored from restart disposed")
						tabProvider.dispose()
					},
					null,
					context.subscriptions,
				)
				return Promise.resolve()
			},
		}),
	)

	const diffViewerProvider = new DiffViewerProvider(context.extensionUri, connectionService)
	diffViewerProvider.setCommentHandler((comments, autoSend) => {
		void provider.appendReviewComments(comments, autoSend)
	})
	context.subscriptions.push(diffViewerProvider)

	const settingsEditorProvider = new SettingsEditorProvider(context.extensionUri, connectionService, context)
	context.subscriptions.push(settingsEditorProvider)

	const subAgentViewerProvider = new SubAgentViewerProvider(context.extensionUri, connectionService, context)
	context.subscriptions.push(subAgentViewerProvider)

	const settingsViews = ["settingsPanel", "profilePanel", "marketplacePanel"] as const
	for (const suffix of settingsViews) {
		context.subscriptions.push(
			vscode.window.registerWebviewPanelSerializer(`kilo-code.new.${suffix}`, {
				deserializeWebviewPanel(panel: vscode.WebviewPanel) {
					settingsEditorProvider.deserializePanel(panel)
					return Promise.resolve()
				},
			}),
		)
	}

	context.subscriptions.push(
		vscode.window.registerWebviewPanelSerializer(DiffViewerProvider.viewType, {
			deserializeWebviewPanel(panel: vscode.WebviewPanel) {
				diffViewerProvider.deserializePanel(panel)
				return Promise.resolve()
			},
		}),
	)

	context.subscriptions.push(
		vscode.window.registerWebviewPanelSerializer("kilo-code.new.SubAgentViewerPanel", {
			deserializeWebviewPanel(panel: vscode.WebviewPanel) {
				panel.dispose()
				return Promise.resolve()
			},
		}),
	)

	context.subscriptions.push(
		vscode.commands.registerCommand("kilo-code.new.plusButtonClicked", () => {
			provider.postMessage({ type: "action", action: "plusButtonClicked" })
		}),
		vscode.commands.registerCommand("kilo-code.new.agentManagerOpen", () => {
			agentManagerProvider.openPanel()
		}),
		vscode.commands.registerCommand("kilo-code.new.marketplaceButtonClicked", (directory?: string) => {
			settingsEditorProvider.openPanel("marketplace", undefined, directory)
		}),
		vscode.commands.registerCommand("kilo-code.new.historyButtonClicked", () => {
			provider.postMessage({ type: "action", action: "historyButtonClicked" })
		}),
		vscode.commands.registerCommand("kilo-code.new.cycleAgentMode", () => {
			provider.postMessage({ type: "action", action: "cycleAgentMode" })
			agentManagerProvider.postMessage({ type: "action", action: "cycleAgentMode" })
		}),
		vscode.commands.registerCommand("kilo-code.new.cyclePreviousAgentMode", () => {
			provider.postMessage({ type: "action", action: "cyclePreviousAgentMode" })
			agentManagerProvider.postMessage({ type: "action", action: "cyclePreviousAgentMode" })
		}),
		vscode.commands.registerCommand("kilo-code.new.profileButtonClicked", () => {
			settingsEditorProvider.openPanel("profile")
		}),
		vscode.commands.registerCommand("kilo-code.new.settingsButtonClicked", (tab?: string) => {
			settingsEditorProvider.openPanel("settings", tab)
		}),
		vscode.commands.registerCommand("kilo-code.new.openMigrationWizard", () => {
			provider.postMessage({ type: "migrationState", needed: true })
		}),
		vscode.commands.registerCommand("kilo-code.new.generateTerminalCommand", async () => {
			const input = await vscode.window.showInputBox({
				prompt: "Describe the terminal command you want to generate",
				placeHolder: "e.g., find all .ts files modified in the last 24 hours",
			})
			if (!input) return
			await vscode.commands.executeCommand("kilo-code.SidebarProvider.focus")
			await provider.waitForReady()
			provider.postMessage({ type: "triggerTask", text: `Generate a terminal command: ${input}` })
		}),
		vscode.commands.registerCommand("kilo-code.new.openInTab", () => {
			return openKiloInNewTab(context, connectionService, agentManagerProvider)
		}),
		vscode.commands.registerCommand("kilo-code.new.showChanges", () => {
			diffViewerProvider.openPanel()
		}),
		vscode.commands.registerCommand("kilo-code.new.openSubAgentViewer", (sessionID: string, title?: string) => {
			subAgentViewerProvider.openPanel(sessionID, title)
		}),
		vscode.commands.registerCommand("kilo-code.new.agentManager.previousSession", () => {
			agentManagerProvider.postMessage({ type: "action", action: "sessionPrevious" })
		}),
		vscode.commands.registerCommand("kilo-code.new.agentManager.nextSession", () => {
			agentManagerProvider.postMessage({ type: "action", action: "sessionNext" })
		}),
		vscode.commands.registerCommand("kilo-code.new.agentManager.previousTab", () => {
			agentManagerProvider.postMessage({ type: "action", action: "tabPrevious" })
		}),
		vscode.commands.registerCommand("kilo-code.new.agentManager.nextTab", () => {
			agentManagerProvider.postMessage({ type: "action", action: "tabNext" })
		}),
		vscode.commands.registerCommand("kilo-code.new.agentManager.showTerminal", () => {
			agentManagerProvider.showTerminalForCurrentSession()
		}),
		vscode.commands.registerCommand("kilo-code.new.agentManager.toggleDiff", () => {
			agentManagerProvider.postMessage({ type: "action", action: "toggleDiff" })
		}),
		vscode.commands.registerCommand("kilo-code.new.agentManager.showShortcuts", () => {
			agentManagerProvider.postMessage({ type: "action", action: "showShortcuts" })
		}),

		vscode.commands.registerCommand("kilo-code.new.agentManager.newTab", () => {
			agentManagerProvider.postMessage({ type: "action", action: "newTab" })
		}),
		vscode.commands.registerCommand("kilo-code.new.agentManager.closeTab", () => {
			agentManagerProvider.postMessage({ type: "action", action: "closeTab" })
		}),
		vscode.commands.registerCommand("kilo-code.new.agentManager.newWorktree", () => {
			agentManagerProvider.postMessage({ type: "action", action: "newWorktree" })
		}),
		vscode.commands.registerCommand("kilo-code.new.agentManager.openWorktree", () => {
			agentManagerProvider.postMessage({ type: "action", action: "openWorktree" })
		}),
		vscode.commands.registerCommand("kilo-code.new.agentManager.closeWorktree", () => {
			agentManagerProvider.postMessage({ type: "action", action: "closeWorktree" })
		}),
		vscode.commands.registerCommand("kilo-code.new.agentManager.advancedWorktree", () => {
			agentManagerProvider.postMessage({ type: "action", action: "advancedWorktree" })
		}),
		...Array.from({ length: 9 }, (_, i) =>
			vscode.commands.registerCommand(`kilo-code.new.agentManager.jumpTo${i + 1}`, () => {
				agentManagerProvider.postMessage({ type: "action", action: `jumpTo${i + 1}` })
			}),
		),
	)

	context.subscriptions.push(
		vscode.commands.registerCommand("kilo-code.tool.execute", async (params: {
			sessionId: string;
			messageId: string;
			toolId: string;
			args: Record<string, unknown>;
		}) => {
			const { sessionId, messageId, toolId, args } = params
			const abortController = new AbortController()

			try {
				const result = await toolExecutionService.executeTool(
					toolId,
					args,
					sessionId,
					messageId,
					abortController.signal,
					(metadata) => {
						provider.postMessage({
							type: "tool.stream",
							sessionId,
							messageId,
							toolId,
							metadata,
						})
					},
				)

				provider.postMessage({
					type: "tool.result",
					sessionId,
					messageId,
					toolId,
					result,
				})
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : String(error)
				provider.postMessage({
					type: "tool.error",
					sessionId,
					messageId,
					toolId,
					error: errorMessage,
				})
			}
		}),
	)

	context.subscriptions.push(
		vscode.window.registerUriHandler({
			async handleUri(uri: vscode.Uri) {
				const match = uri.path.match(/^\/kilocode\/s\/([a-zA-Z0-9_-]+)$/)
				if (!match) return
				const sessionId = match[1]
				console.log("[Kilo New] URI handler: opening cloud session:", sessionId)
				await vscode.commands.executeCommand(`${KiloProvider.viewType}.focus`)
				provider.openCloudSession(sessionId)
			},
		}),
	)

	registerAutocompleteProvider(context, connectionService)

	ensureBackendForAutocomplete(connectionService)

	registerCommitMessageService(context, connectionService)

	const defaultDir = () => vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd()
	registerToggleAutoApprove(
		context,
		connectionService,
		(sessionId) => {
			if (sessionId) {
				const dir =
					provider.getSessionDirectories().get(sessionId) ?? agentManagerProvider.getSessionDirectories().get(sessionId)
				if (dir) return dir
			}
			return defaultDir()
		},
		() => {
			const dirs = new Set([defaultDir()])
			for (const dir of provider.getSessionDirectories().values()) dirs.add(dir)
			for (const dir of agentManagerProvider.getSessionDirectories().values()) dirs.add(dir)
			return [...dirs]
		},
	)

	registerCodeActions(context, provider, agentManagerProvider)
	registerTerminalActions(context, provider, agentManagerProvider)

	context.subscriptions.push(
		vscode.languages.registerCodeActionsProvider(
			{ scheme: "file" },
			new KiloCodeActionProvider(),
			KiloCodeActionProvider.metadata,
		),
	)

	context.subscriptions.push({
		dispose: () => {
			unsubscribeStateChange()
			browserAutomationService.dispose()
			provider.dispose()
			connectionService.dispose()
			toolExecutionService.dispose()
			toolPermissionService.clearState()
		},
	})
}

export function deactivate() {
	TelemetryProxy.getInstance().shutdown()
}

async function openKiloInNewTab(
	context: vscode.ExtensionContext,
	connectionService: KiloConnectionService,
	agentManagerProvider: AgentManagerProvider,
) {
	const lastCol = Math.max(...vscode.window.visibleTextEditors.map((e) => e.viewColumn || 0), 0)
	const hasVisibleEditors = vscode.window.visibleTextEditors.length > 0

	if (!hasVisibleEditors) {
		await vscode.commands.executeCommand("workbench.action.newGroupRight")
	}

	const targetCol = hasVisibleEditors ? Math.max(lastCol + 1, 1) : vscode.ViewColumn.Two

	const panel = vscode.window.createWebviewPanel("kilo-code.new.TabPanel", EXTENSION_DISPLAY_NAME, targetCol, {
		enableScripts: true,
		retainContextWhenHidden: true,
		localResourceRoots: [context.extensionUri],
	})

	panel.iconPath = {
		light: vscode.Uri.joinPath(context.extensionUri, "assets", "icons", "kilo-light.svg"),
		dark: vscode.Uri.joinPath(context.extensionUri, "assets", "icons", "kilo-dark.svg"),
	}

	const tabProvider = new KiloProvider(context.extensionUri, connectionService, context)
	tabProvider.setContinueInWorktreeHandler((sessionId, progress) =>
		agentManagerProvider.continueFromSidebar(sessionId, progress),
	)
	tabProvider.resolveWebviewPanel(panel)

	await waitForWebviewPanelToBeActive(panel)
	await vscode.commands.executeCommand("workbench.action.lockEditorGroup")

	panel.onDidDispose(
		() => {
			console.log("[Kilo New] Tab panel disposed")
			tabProvider.dispose()
		},
		null,
		context.subscriptions,
	)
}

function ensureCommandsSkipShell(commands: string[]): void {
	const config = vscode.workspace.getConfiguration("terminal.integrated")
	const info = config.inspect<string[]>("commandsToSkipShell")
	const [existing, target] = info?.workspaceFolderValue
		? [info.workspaceFolderValue, vscode.ConfigurationTarget.WorkspaceFolder]
		: info?.workspaceValue
			? [info.workspaceValue, vscode.ConfigurationTarget.Workspace]
			: [info?.globalValue ?? [], vscode.ConfigurationTarget.Global]
	const missing = commands.filter((cmd) => !existing.includes(cmd))
	if (missing.length === 0) return
	config.update("commandsToSkipShell", [...existing, ...missing], target)
}

function waitForWebviewPanelToBeActive(panel: vscode.WebviewPanel): Promise<void> {
	if (panel.active) {
		return Promise.resolve()
	}

	return new Promise((resolve) => {
		const disposable = panel.onDidChangeViewState((event) => {
			if (!event.webviewPanel.active) {
				return
			}
			disposable.dispose()
			resolve()
		})
	})
}
