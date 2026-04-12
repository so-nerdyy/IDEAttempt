import { ToolDefinition, ToolResult, ToolExecutionContext } from '../tool-execution-service';

export const BatchTool: ToolDefinition = {
	id: 'batch',
	name: 'Batch',
	description: 'Execute multiple tool calls in parallel. Returns results for all calls.',
	parameters: [
		{ name: 'tool_calls', type: 'array', description: 'Array of tool calls to execute. Each item has {tool: string, parameters: object}', required: true },
	],
	async execute(args, ctx): Promise<ToolResult> {
		const toolCalls = (args.tool_calls as Array<{ tool: string; parameters: Record<string, unknown> }>) ?? [];

		if (toolCalls.length > 25) {
			throw new Error('Batch tool supports a maximum of 25 tool calls.');
		}

		// Filter out disallowed tools
		const disallowed = new Set(['batch', 'plan_exit']);
		const allowed = toolCalls.filter((tc) => !disallowed.has(tc.tool));

		if (allowed.length === 0) {
			return {
				title: 'batch',
				output: 'No valid tool calls to execute.',
				metadata: { count: 0 },
			};
		}

		// Note: In the VS Code integration, batch execution is handled by the
		// ToolExecutionService which manages parallel execution.
		// This tool returns the batch structure for the parent to orchestrate.
		const output = allowed
			.map((tc, i) => `${i + 1}. ${tc.tool}: ${JSON.stringify(tc.parameters)}`)
			.join('\n');

		return {
			title: 'batch',
			output: `Batch of ${allowed.length} tool calls queued:\n${output}`,
			metadata: { count: allowed.length, calls: allowed.map((tc) => tc.tool) },
		};
	},
};
