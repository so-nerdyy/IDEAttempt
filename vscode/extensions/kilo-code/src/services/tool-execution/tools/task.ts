import * as vscode from 'vscode';
import { ToolDefinition, ToolResult, ToolExecutionContext } from '../tool-execution-service';

export const TaskTool: ToolDefinition = {
	id: 'task',
	name: 'Task',
	description: 'Spawn a sub-agent task. Creates a new agent session to work on a specific task.',
	parameters: [
		{ name: 'description', type: 'string', description: 'Short description of the task', required: true },
		{ name: 'prompt', type: 'string', description: 'The prompt/task for the sub-agent', required: true },
		{ name: 'subagent_type', type: 'string', description: 'The type of sub-agent to use', required: true },
		{ name: 'task_id', type: 'string', description: 'Optional task ID', required: false },
		{ name: 'command', type: 'string', description: 'Optional command to use', required: false },
	],
	async execute(args, ctx): Promise<ToolResult> {
		const description = args.description as string;
		const prompt = args.prompt as string;
		const subagentType = args.subagent_type as string;

		const permResponse = await ctx.requestPermission({
			type: 'task',
			patterns: [subagentType],
			metadata: { description },
		});

		if (permResponse === 'deny') {
			return {
				title: description,
				output: `Task denied: ${description}`,
				metadata: { denied: true },
			};
		}

		// In VS Code integration, sub-agents are delegated to the CLI backend
		// since the extension does not run its own AI agent loop.
		// This tool returns a structured task object that the parent session can track.
		const taskId = args.task_id as string || `task-${Date.now()}`;

		return {
			title: description,
			output: `Sub-agent task created: ${description}\nType: ${subagentType}\nTask ID: ${taskId}\n\nThe sub-agent will process the task and report results.`,
			metadata: { taskId, subagentType, description, status: 'created' },
		};
	},
};
