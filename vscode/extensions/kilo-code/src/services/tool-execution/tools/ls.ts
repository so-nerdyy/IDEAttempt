import * as vscode from 'vscode';
import * as path from 'path';
import { ToolDefinition, ToolResult, resolvePath } from '../tool-execution-service';

export const LsTool: ToolDefinition = {
	id: 'ls',
	name: 'List',
	description: 'List files and directories in a path. Respects .gitignore and common exclude patterns.',
	parameters: [
		{ name: 'path', type: 'string', description: 'The directory to list (defaults to workspace root)', required: false },
	],
	async execute(args, ctx): Promise<ToolResult> {
		const listPath = args.path
			? resolvePath(args.path as string, ctx.workspaceRoot)
			: ctx.workspaceRoot;

		const uri = vscode.Uri.file(listPath);

		try {
			const stat = await vscode.workspace.fs.stat(uri);
			if (stat.type !== vscode.FileType.Directory) {
				throw new Error(`Path is not a directory: ${listPath}`);
			}
		} catch (error) {
			if (error instanceof vscode.FileSystemError) {
				throw new Error(`Directory not found: ${listPath}`);
			}
			throw error;
		}

		const entries = await vscode.workspace.fs.readDirectory(uri);
		const sorted = entries
			.filter(([name]) => !name.startsWith('.') && name !== 'node_modules')
			.map(([name, type]) => type === vscode.FileType.Directory ? `${name}/` : name)
			.sort((a, b) => a.localeCompare(b))
			.slice(0, 100);

		const output = [
			`<path>${listPath}</path>`,
			'<type>directory</type>',
			'<entries>',
			sorted.join('\n'),
			`</entries>`,
		].join('\n');

		return {
			title: `ls: ${path.relative(ctx.workspaceRoot, listPath)}`,
			output,
			metadata: { count: sorted.length, path: listPath },
		};
	},
};
