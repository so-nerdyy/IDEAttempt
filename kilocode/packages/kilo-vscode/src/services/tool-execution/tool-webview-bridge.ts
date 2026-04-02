import * as vscode from 'vscode';
import { ToolExecutionService, ToolExecutionEvent, ToolResult } from './tool-execution-service';

export interface ToolExecutionRequest {
	type: 'tool.execute';
	sessionId: string;
	messageId: string;
	toolId: string;
	args: Record<string, unknown>;
}

export interface ToolExecutionResponse {
	type: 'tool.result';
	sessionId: string;
	messageId: string;
	toolId: string;
	executionId: string;
	status: 'started' | 'streaming' | 'completed' | 'failed' | 'cancelled';
	result?: ToolResult;
	error?: string;
}

export class ToolWebviewBridge {
	private abortControllers = new Map<string, AbortController>();

	constructor(
		private service: ToolExecutionService,
		private webview: vscode.Webview,
	) {
		this.setupExecutionListener();
	}

	private setupExecutionListener(): void {
		this.service.onExecutionEvent((event: ToolExecutionEvent) => {
			const response: ToolExecutionResponse = {
				type: 'tool.result',
				sessionId: event.sessionId,
				messageId: '',
				toolId: event.toolId,
				executionId: `${event.sessionId}-${event.toolId}-${event.timestamp}`,
				status: event.status,
				result: event.result,
				error: event.error,
			};

			this.webview.postMessage(response);
		});
	}

	async handleMessage(message: ToolExecutionRequest): Promise<void> {
		if (message.type !== 'tool.execute') {
			return;
		}

		const { sessionId, messageId, toolId, args } = message;
		const executionKey = `${sessionId}-${messageId}`;

		const abortController = new AbortController();
		this.abortControllers.set(executionKey, abortController);

		try {
			const result = await this.service.executeTool(
				toolId,
				args,
				sessionId,
				messageId,
				abortController.signal,
				(metadata: Record<string, unknown>) => {
					this.webview.postMessage({
						type: 'tool.result',
						sessionId,
						messageId,
						toolId,
						executionId: executionKey,
						status: 'streaming',
						result: {
							title: toolId,
							output: '',
							metadata,
						},
					} as ToolExecutionResponse);
				},
			);

			this.webview.postMessage({
				type: 'tool.result',
				sessionId,
				messageId,
				toolId,
				executionId: executionKey,
				status: 'completed',
				result,
			} as ToolExecutionResponse);
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);

			this.webview.postMessage({
				type: 'tool.result',
				sessionId,
				messageId,
				toolId,
				executionId: executionKey,
				status: 'failed',
				error: errorMessage,
			} as ToolExecutionResponse);
		} finally {
			this.abortControllers.delete(executionKey);
		}
	}

	cancelExecution(sessionId: string, messageId: string): void {
		const key = `${sessionId}-${messageId}`;
		const controller = this.abortControllers.get(key);
		if (controller) {
			controller.abort();
			this.abortControllers.delete(key);
		}
	}

	dispose(): void {
		for (const controller of this.abortControllers.values()) {
			controller.abort();
		}
		this.abortControllers.clear();
	}
}
