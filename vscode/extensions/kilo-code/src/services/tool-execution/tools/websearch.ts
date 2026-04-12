import { ToolDefinition, ToolResult, ToolExecutionContext } from '../tool-execution-service';

export const WebSearchTool: ToolDefinition = {
	id: 'websearch',
	name: 'WebSearch',
	description: 'Search the web using Exa AI. Returns relevant search results with titles, URLs, and snippets.',
	parameters: [
		{ name: 'query', type: 'string', description: 'The search query', required: true },
		{ name: 'numResults', type: 'number', description: 'Number of results to return (default 8)', required: false },
	],
	async execute(args, ctx): Promise<ToolResult> {
		const query = args.query as string;
		const numResults = (args.numResults as number) ?? 8;

		const permResponse = await ctx.requestPermission({
			type: 'websearch',
			patterns: [query],
		});

		if (permResponse === 'deny') {
			return {
				title: 'websearch',
				output: `WebSearch denied for query: ${query}`,
				metadata: { denied: true },
			};
		}

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
					name: 'web_search_exa',
					arguments: {
						query,
						numResults,
					},
				},
			}),
		});

		if (!response.ok) {
			throw new Error(`WebSearch failed: HTTP ${response.status}`);
		}

		const data = await response.json();
		const results = data.result?.content?.[0]?.text
			? JSON.parse(data.result.content[0].text)
			: [];

		const output = Array.isArray(results)
			? results.map((r: any, i: number) =>
				`${i + 1}. **${r.title || 'Untitled'}**\n   URL: ${r.url}\n   ${r.text || r.snippet || ''}`
			).join('\n\n')
			: 'No results found.';

		return {
			title: `websearch: ${query}`,
			output,
			metadata: { query, count: Array.isArray(results) ? results.length : 0 },
		};
	},
};
