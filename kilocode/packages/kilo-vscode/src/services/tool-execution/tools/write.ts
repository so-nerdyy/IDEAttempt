import * as vscode from 'vscode';
import * as path from 'path';
import { ToolDefinition, ToolResult, ToolExecutionContext, resolvePath } from './tool-execution-service';

export const WriteTool: ToolDefinition = {
	id: 'write',
	name: 'Write',
	description: 'Write content to a file. Creates the file if it does not exist, overwrites if it does. Creates parent directories as needed.',
	parameters: [
		{ name: 'filePath', type: 'string', description: 'The absolute or relative path to the file to write', required: true },
		{ name: 'content', type: 'string', description: 'The content to write to the file', required: true },
	],
	async execute(args, ctx): Promise<ToolResult> {
		const filePath = resolvePath(args.filePath as string, ctx.workspaceRoot);
		const content = args.content as string;

		const permResponse = await ctx.requestPermission({
			type: 'edit',
			patterns: [path.relative(ctx.workspaceRoot, filePath)],
		});

		if (permResponse === 'deny') {
			return {
				title: path.relative(ctx.workspaceRoot, filePath),
				output: `Write denied for ${filePath}`,
				metadata: { denied: true },
			};
		}

		const uri = vscode.Uri.file(filePath);
		const dirUri = vscode.Uri.file(path.dirname(filePath));

		try {
			await vscode.workspace.fs.stat(dirUri);
		} catch {
			await vscode.workspace.fs.createDirectory(dirUri);
		}

		let oldContent = '';
		try {
			const oldBytes = await vscode.workspace.fs.readFile(uri);
			oldContent = Buffer.from(oldBytes).toString('utf8');
		} catch {
			// File does not exist
		}

		await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));

		const added = content.split('\n').length;
		const removed = oldContent ? oldContent.split('\n').length : 0;

		return {
			title: path.relative(ctx.workspaceRoot, filePath),
			output: `File written successfully: ${filePath}`,
			metadata: { added, removed, type: 'write' },
		};
	},
};
