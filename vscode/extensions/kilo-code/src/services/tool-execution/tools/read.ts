import * as vscode from 'vscode';
import * as path from 'path';
import { ToolDefinition, ToolResult, resolvePath } from '../tool-execution-service';

export const ReadTool: ToolDefinition = {
	id: 'read',
	name: 'Read',
	description: 'Read a file or directory. Supports offset/limit for large files. Returns file contents with line numbers or directory listing.',
	parameters: [
		{ name: 'filePath', type: 'string', description: 'The absolute or relative path to the file or directory to read', required: true },
		{ name: 'offset', type: 'number', description: 'The line number to start reading from (1-indexed)', required: false },
		{ name: 'limit', type: 'number', description: 'The maximum number of lines to read (defaults to 2000)', required: false },
	],
	async execute(args, ctx): Promise<ToolResult> {
		const filePath = resolvePath(args.filePath as string, ctx.workspaceRoot);
		const offset = (args.offset as number) ?? 1;
		const limit = (args.limit as number) ?? 2000;

		const permResponse = await ctx.requestPermission({
			type: 'read',
			patterns: [filePath],
		});

		if (permResponse === 'deny') {
			return {
				title: path.relative(ctx.workspaceRoot, filePath),
				output: `Read denied for ${filePath}`,
				metadata: { denied: true },
			};
		}

		const uri = vscode.Uri.file(filePath);

		try {
			const stat = await vscode.workspace.fs.stat(uri);

			if (stat.type === vscode.FileType.Directory) {
				const entries = await vscode.workspace.fs.readDirectory(uri);
				const sorted = entries
					.map(([name, type]) => type === vscode.FileType.Directory ? `${name}/` : name)
					.sort((a, b) => a.localeCompare(b));

				const start = offset - 1;
				const sliced = sorted.slice(start, start + limit);
				const truncated = start + sliced.length < sorted.length;

				const output = [
					`<path>${filePath}</path>`,
					'<type>directory</type>',
					'<entries>',
					sliced.join('\n'),
					truncated
						? `\n(Showing ${sliced.length} of ${sorted.length} entries. Use 'offset' parameter to read beyond entry ${offset + sliced.length})`
						: `\n(${sorted.length} entries)`,
					'</entries>',
				].join('\n');

				return {
					title: path.relative(ctx.workspaceRoot, filePath),
					output,
					metadata: { preview: sliced.slice(0, 20).join('\n'), truncated, type: 'directory' },
				};
			}

			const bytes = await vscode.workspace.fs.readFile(uri);
			const content = Buffer.from(bytes).toString('utf8');
			const lines = content.split('\n');

			const start = offset - 1;
			const sliced = lines.slice(start, start + limit);
			const truncated = start + sliced.length < lines.length;

			const numbered = sliced.map((line, i) => `${i + offset}: ${line}`);
			const output = [
				`<path>${filePath}</path>`,
				'<type>file</type>',
				'<content>',
				numbered.join('\n'),
				truncated
					? `\n\n(Showing lines ${offset}-${offset + sliced.length - 1} of ${lines.length}. Use offset=${offset + sliced.length} to continue.)`
					: `\n\n(End of file - total ${lines.length} lines)`,
				'</content>',
			].join('\n');

			return {
				title: path.relative(ctx.workspaceRoot, filePath),
				output,
				metadata: { preview: sliced.slice(0, 20).join('\n'), truncated, type: 'file', totalLines: lines.length },
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			if (message.includes('File not found') || message.includes('ENOENT')) {
				throw new Error(`File not found: ${filePath}`);
			}
			throw error;
		}
	},
};
