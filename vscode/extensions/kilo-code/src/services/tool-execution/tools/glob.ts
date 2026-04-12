import * as vscode from 'vscode';
import * as path from 'path';
import { ToolDefinition, ToolResult, ToolExecutionContext, resolvePath } from '../tool-execution-service';

export const GlobTool: ToolDefinition = {
	id: 'glob',
	name: 'Glob',
	description: 'Find files matching a glob pattern. Returns up to 100 results sorted by modification time.',
	parameters: [
		{ name: 'pattern', type: 'string', description: 'The glob pattern to match files against', required: true },
		{ name: 'path', type: 'string', description: 'The directory to search in (defaults to workspace root)', required: false },
	],
	async execute(args, ctx): Promise<ToolResult> {
		const pattern = args.pattern as string;
		const searchPath = args.path ? resolvePath(args.path as string, ctx.workspaceRoot) : ctx.workspaceRoot;

		const permResponse = await ctx.requestPermission({
			type: 'glob',
			patterns: [pattern],
		});

		if (permResponse === 'deny') {
			return {
				title: 'glob',
				output: `Glob denied for pattern: ${pattern}`,
				metadata: { denied: true },
			};
		}

		const globPattern = new vscode.RelativePattern(
			vscode.Uri.file(searchPath),
			pattern,
		);

		const files = await vscode.workspace.findFiles(globPattern, '**/node_modules/**', 100);

		const relativePaths = files
			.map((uri) => path.relative(ctx.workspaceRoot, uri.fsPath))
			.sort();

		const output = relativePaths.length > 0
			? relativePaths.join('\n')
			: 'No files found matching pattern.';

		return {
			title: `glob: ${pattern}`,
			output,
			metadata: { count: relativePaths.length, pattern },
		};
	},
};
