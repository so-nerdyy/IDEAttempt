import { ToolDefinition, ToolResult } from '../tool-execution-service';

export const InvalidTool: ToolDefinition = {
	id: 'invalid',
	name: 'Invalid',
	description: 'Handles invalid tool calls. Returns an error message describing what went wrong.',
	parameters: [
		{ name: 'tool', type: 'string', description: 'The name of the invalid tool', required: true },
		{ name: 'error', type: 'string', description: 'The error message', required: true },
	],
	async execute(args, _ctx): Promise<ToolResult> {
		const tool = args.tool as string;
		const error = args.error as string;

		return {
			title: `invalid: ${tool}`,
			output: `Invalid tool call: ${tool}\nError: ${error}`,
			metadata: { tool, error },
		};
	},
};
