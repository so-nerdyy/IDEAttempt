import * as vscode from 'vscode';
import * as path from 'path';
import { ChildProcess } from 'child_process';

export interface ToolParameter {
	name: string;
	type: string;
	description: string;
	required: boolean;
}

export interface ToolDefinition {
	id: string;
	name: string;
	description: string;
	parameters: ToolParameter[];
	execute(
		args: Record<string, unknown>,
		ctx: ToolExecutionContext,
	): Promise<ToolResult>;
}

export interface ToolExecutionContext {
	sessionId: string;
	messageId: string;
	abortSignal: AbortSignal;
	workspaceRoot: string;
	onMetadataUpdate: (metadata: Record<string, unknown>) => void;
	requestPermission: (permission: PermissionRequest) => Promise<PermissionResponse>;
}

export interface PermissionRequest {
	type: 'bash' | 'edit' | 'read' | 'write' | 'glob' | 'grep' | 'task' | 'webfetch' | 'websearch' | 'external_directory';
	patterns: string[];
	metadata?: Record<string, unknown>;
}

export type PermissionResponse = 'allow' | 'deny' | 'allow_always';

export interface ToolResult {
	title: string;
	output: string;
	metadata: Record<string, unknown>;
	attachments?: Array<{
		type: string;
		mime: string;
		url: string;
	}>;
}

export interface ToolExecutionEvent {
	sessionId: string;
	toolId: string;
	status: 'started' | 'streaming' | 'completed' | 'failed' | 'cancelled';
	result?: ToolResult;
	error?: string;
	timestamp: number;
}

export interface PermissionState {
	alwaysAllowed: Set<string>;
	alwaysDenied: Set<string>;
}

export class ToolPermissionService {
	private permissionState: PermissionState = {
		alwaysAllowed: new Set(),
		alwaysDenied: new Set(),
	};

	private pendingRequests = new Map<string, {
		resolve: (response: PermissionResponse) => void;
		request: PermissionRequest;
	}>();

	async requestPermission(
		requestId: string,
		permission: PermissionRequest,
	): Promise<PermissionResponse> {
		const key = `${permission.type}:${permission.patterns.join(',')}`;

		if (this.permissionState.alwaysAllowed.has(key)) {
			return 'allow';
		}

		if (this.permissionState.alwaysDenied.has(key)) {
			return 'deny';
		}

		return new Promise<PermissionResponse>((resolve) => {
			this.pendingRequests.set(requestId, { resolve, request: permission });

			const item = vscode.window.showInformationMessage(
				`${permission.type.toUpperCase()} permission requested: ${permission.patterns.join(', ')}`,
				{ modal: false },
				'Allow',
				'Deny',
				'Always Allow',
			);

			if (item) {
				item.then((selection) => {
					const pending = this.pendingRequests.get(requestId);
					if (!pending) return;

					let response: PermissionResponse;
					switch (selection) {
						case 'Always Allow':
							this.permissionState.alwaysAllowed.add(key);
							response = 'allow_always';
							break;
						case 'Allow':
							response = 'allow';
							break;
						case 'Deny':
						default:
							this.permissionState.alwaysDenied.add(key);
							response = 'deny';
							break;
					}

					pending.resolve(response);
					this.pendingRequests.delete(requestId);
				});
			}
		});
	}

	cancelPending(requestId: string): void {
		const pending = this.pendingRequests.get(requestId);
		if (pending) {
			pending.resolve('deny');
			this.pendingRequests.delete(requestId);
		}
	}

	clearState(): void {
		this.permissionState.alwaysAllowed.clear();
		this.permissionState.alwaysDenied.clear();
		for (const [_id, pending] of this.pendingRequests) {
			pending.resolve('deny');
		}
		this.pendingRequests.clear();
	}
}

export class ToolExecutionService {
	private tools = new Map<string, ToolDefinition>();
	private activeProcesses = new Map<string, ChildProcess>();
	private onExecutionEventEmitter = new vscode.EventEmitter<ToolExecutionEvent>();
	readonly onExecutionEvent = this.onExecutionEventEmitter.event;

	constructor(
		_context: vscode.ExtensionContext,
		private permissionService: ToolPermissionService,
		private workspaceRoot: string,
	) {}

	registerTool(tool: ToolDefinition): void {
		this.tools.set(tool.id, tool);
	}

	getTool(id: string): ToolDefinition | undefined {
		return this.tools.get(id);
	}

	getAllTools(): ToolDefinition[] {
		return Array.from(this.tools.values());
	}

	async executeTool(
		toolId: string,
		args: Record<string, unknown>,
		sessionId: string,
		messageId: string,
		abortSignal: AbortSignal,
		onMetadataUpdate: (metadata: Record<string, unknown>) => void,
	): Promise<ToolResult> {
		const tool = this.tools.get(toolId);
		if (!tool) {
			throw new Error(`Tool not found: ${toolId}`);
		}

		const executionId = `${sessionId}-${messageId}-${toolId}-${Date.now()}`;

		this.onExecutionEventEmitter.fire({
			sessionId,
			toolId,
			status: 'started',
			timestamp: Date.now(),
		});

		const ctx: ToolExecutionContext = {
			sessionId,
			messageId,
			abortSignal,
			workspaceRoot: this.workspaceRoot,
			onMetadataUpdate,
			requestPermission: async (permission: PermissionRequest) => {
				return this.permissionService.requestPermission(executionId, permission);
			},
		};

		if (abortSignal.aborted) {
			this.onExecutionEventEmitter.fire({
				sessionId,
				toolId,
				status: 'cancelled',
				timestamp: Date.now(),
			});
			throw new Error('Tool execution cancelled');
		}

		try {
			const result = await tool.execute(args, ctx);

			this.onExecutionEventEmitter.fire({
				sessionId,
				toolId,
				status: 'completed',
				result,
				timestamp: Date.now(),
			});

			return result;
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);

			this.onExecutionEventEmitter.fire({
				sessionId,
				toolId,
				status: 'failed',
				error: errorMessage,
				timestamp: Date.now(),
			});

			throw error;
		}
	}

	cancelExecution(executionId: string): void {
		const proc = this.activeProcesses.get(executionId);
		if (proc) {
			proc.kill('SIGTERM');
			this.activeProcesses.delete(executionId);
		}
	}

	dispose(): void {
		for (const proc of this.activeProcesses.values()) {
			proc.kill('SIGTERM');
		}
		this.activeProcesses.clear();
		this.onExecutionEventEmitter.dispose();
	}
}

export function resolvePath(filePath: string, workspaceRoot: string): string {
	if (path.isAbsolute(filePath)) {
		return filePath;
	}
	return path.resolve(workspaceRoot, filePath);
}

export function isPathWithinWorkspace(
	filePath: string,
	workspaceRoot: string,
): boolean {
	const resolved = path.resolve(filePath);
	const normalizedResolved = path.normalize(resolved);
	const normalizedWorkspace = path.normalize(workspaceRoot);
	return normalizedResolved.startsWith(normalizedWorkspace);
}
