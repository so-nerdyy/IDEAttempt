import * as vscode from 'vscode';
import { ToolDefinition, ToolResult, ToolExecutionContext } from '../tool-execution-service';

interface TodoItem {
	content: string;
	status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
}

const todoState = new Map<string, TodoItem[]>();

export const TodoWriteTool: ToolDefinition = {
	id: 'todowrite',
	name: 'TodoWrite',
	description: 'Write or update the todo list for the current session.',
	parameters: [
		{ name: 'todos', type: 'array', description: 'Array of todo items with content and status', required: true },
	],
	async execute(args, ctx): Promise<ToolResult> {
		const todos = (args.todos as Array<{ content: string; status: string }>) ?? [];

		const validated = todos.map((t) => ({
			content: t.content,
			status: (['pending', 'in_progress', 'completed', 'cancelled'].includes(t.status)
				? t.status
				: 'pending') as TodoItem['status'],
		}));

		todoState.set(ctx.sessionId, validated);

		const output = validated.map((t, i) => `${i + 1}. [${t.status}] ${t.content}`).join('\n');

		return {
			title: 'todowrite',
			output: output || 'Todo list cleared.',
			metadata: { count: validated.length },
		};
	},
};

export const TodoReadTool: ToolDefinition = {
	id: 'todoread',
	name: 'TodoRead',
	description: 'Read the current todo list for the session.',
	parameters: [],
	async execute(_args, ctx): Promise<ToolResult> {
		const todos = todoState.get(ctx.sessionId) ?? [];

		const output = todos.length > 0
			? todos.map((t, i) => `${i + 1}. [${t.status}] ${t.content}`).join('\n')
			: 'No todos.';

		return {
			title: 'todoread',
			output,
			metadata: { count: todos.length },
		};
	},
};
