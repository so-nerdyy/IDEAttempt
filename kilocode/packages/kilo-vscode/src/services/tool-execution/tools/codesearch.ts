import { ToolDefinition, ToolResult, ToolExecutionContext } from '../tool-execution-service';

export const CodeSearchTool: ToolDefinition = {
	id: 'codesearch',
	name: 'CodeSearch',
	description: 'Search for relevant code context using Exa AI. Returns code snippets related to the query.',
	parameters: [
		{ name: 'query', type: 'string', description: 'The code search query', required: true },
		{ name: 'tokensNum', type: 'number', description: 'Number of tokens to return (1000-50000, default 5000)', required: false },
	],
	async execute(args, ctx): Promise<ToolResult> {
		const query = args.query as string;
		const tokensNum = Math.max(1000, Math.min(50000, (args.tokensNum as number) ?? 5000));

		const response = await fetch('https://mcp.exa.ai/mcp', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				jsonrpc: '2.0',
				id: 1,
				method: 'tools/call',
				params: {
					name: 'get_code_context_exa',
					arguments: {
						query,
						tokensNum,
					},
				},
			}),
		});

		if (!response.ok) {
			throw new Error(`CodeSearch failed: HTTP ${response.status}`);
		}

		const data = await response.json();
		const content = data.result?.content?.[0]?.text || 'No code context found.';

		return {
			title: `codesearch: ${query}`,
			output: content,
			metadata: { query, tokensNum },
		};
	},
};
