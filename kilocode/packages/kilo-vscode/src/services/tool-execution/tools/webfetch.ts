import { ToolDefinition, ToolResult, ToolExecutionContext } from './tool-execution-service';

export const WebFetchTool: ToolDefinition = {
	id: 'webfetch',
	name: 'WebFetch',
	description: 'Fetch content from a URL. Returns content as markdown, text, or HTML.',
	parameters: [
		{ name: 'url', type: 'string', description: 'The URL to fetch content from', required: true },
		{ name: 'format', type: 'string', description: 'The format to return (markdown, text, or html). Defaults to markdown.', required: false },
		{ name: 'timeout', type: 'number', description: 'Optional timeout in seconds (max 120)', required: false },
	],
	async execute(args, ctx): Promise<ToolResult> {
		const url = args.url as string;
		const format = (args.format as string) ?? 'markdown';
		const timeout = Math.min((args.timeout as number) ?? 30, 120) * 1000;

		const permResponse = await ctx.requestPermission({
			type: 'webfetch',
			patterns: [url],
		});

		if (permResponse === 'deny') {
			return {
				title: 'webfetch',
				output: `WebFetch denied for URL: ${url}`,
				metadata: { denied: true },
			};
		}

		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), timeout);

		try {
			const response = await fetch(url, {
				signal: controller.signal,
				headers: {
					'User-Agent': 'KiloCode-WebFetch/1.0',
				},
			});

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}

			const contentType = response.headers.get('content-type') || '';
			let content: string;

			if (contentType.includes('text/html') || format === 'html') {
				content = await response.text();
			} else if (contentType.includes('application/json') || format === 'text') {
				content = await response.text();
			} else {
				content = await response.text();
			}

			// Basic HTML to markdown conversion
			if (format === 'markdown' && contentType.includes('text/html')) {
				content = htmlToMarkdown(content);
			}

			// Limit to 5MB
			if (content.length > 5 * 1024 * 1024) {
				content = content.slice(0, 5 * 1024 * 1024) + '\n\n... (content truncated at 5MB)';
			}

			return {
				title: `webfetch: ${url}`,
				output: content,
				metadata: { url, status: response.status, contentType, format },
			};
		} finally {
			clearTimeout(timeoutId);
		}
	},
};

function htmlToMarkdown(html: string): string {
	let result = html;

	// Remove script and style tags
	result = result.replace(/<script[\s\S]*?<\/script>/gi, '');
	result = result.replace(/<style[\s\S]*?<\/style>/gi, '');

	// Convert headings
	result = result.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n# $1\n');
	result = result.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n## $1\n');
	result = result.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n### $1\n');
	result = result.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '\n#### $1\n');
	result = result.replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, '\n##### $1\n');
	result = result.replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, '\n###### $1\n');

	// Convert links
	result = result.replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)');

	// Convert bold and italic
	result = result.replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, '**$1**');
	result = result.replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, '**$1**');
	result = result.replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, '*$1*');
	result = result.replace(/<i[^>]*>([\s\S]*?)<\/i>/gi, '*$1*');

	// Convert code
	result = result.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`');
	result = result.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, '\n```\n$1\n```\n');

	// Convert lists
	result = result.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '- $1\n');

	// Convert paragraphs and line breaks
	result = result.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '\n$1\n');
	result = result.replace(/<br\s*\/?>/gi, '\n');

	// Remove all remaining HTML tags
	result = result.replace(/<[^>]+>/g, '');

	// Clean up whitespace
	result = result.replace(/\n{3,}/g, '\n\n');
	result = result.trim();

	return result;
}
