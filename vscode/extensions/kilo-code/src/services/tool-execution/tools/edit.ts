import * as vscode from 'vscode';
import * as path from 'path';
import { ToolDefinition, ToolResult, resolvePath } from '../tool-execution-service';

function detectLineEnding(text: string): '\n' | '\r\n' {
	return text.includes('\r\n') ? '\r\n' : '\n';
}

function normalizeLineEndings(text: string): string {
	return text.replaceAll('\r\n', '\n');
}

function convertToLineEnding(text: string, ending: '\n' | '\r\n'): string {
	if (ending === '\n') return text;
	return text.replaceAll('\n', '\r\n');
}

export const EditTool: ToolDefinition = {
	id: 'edit',
	name: 'Edit',
	description: 'Edit a file by replacing oldString with newString. Supports replaceAll for multiple occurrences.',
	parameters: [
		{ name: 'filePath', type: 'string', description: 'The absolute or relative path to the file to edit', required: true },
		{ name: 'oldString', type: 'string', description: 'The text to replace', required: true },
		{ name: 'newString', type: 'string', description: 'The text to replace it with', required: true },
		{ name: 'replaceAll', type: 'boolean', description: 'Replace all occurrences of oldString (default false)', required: false },
	],
	async execute(args, ctx): Promise<ToolResult> {
		const filePath = resolvePath(args.filePath as string, ctx.workspaceRoot);
		const oldString = args.oldString as string;
		const newString = args.newString as string;
		const replaceAll = (args.replaceAll as boolean) ?? false;

		if (oldString === newString) {
			throw new Error('No changes to apply: oldString and newString are identical.');
		}

		const permResponse = await ctx.requestPermission({
			type: 'edit',
			patterns: [path.relative(ctx.workspaceRoot, filePath)],
		});

		if (permResponse === 'deny') {
			return {
				title: path.relative(ctx.workspaceRoot, filePath),
				output: `Edit denied for ${filePath}`,
				metadata: { denied: true },
			};
		}

		const uri = vscode.Uri.file(filePath);

		const oldBytes = await vscode.workspace.fs.readFile(uri);
		const contentOld = Buffer.from(oldBytes).toString('utf8');

		const ending = detectLineEnding(contentOld);
		const old = convertToLineEnding(normalizeLineEndings(oldString), ending);
		const next = convertToLineEnding(normalizeLineEndings(newString), ending);

		let contentNew: string;
		if (replaceAll) {
			contentNew = contentOld.replaceAll(old, next);
		} else {
			const index = contentOld.indexOf(old);
			if (index === -1) {
				throw new Error('Could not find oldString in the file. It must match exactly, including whitespace, indentation, and line endings.');
			}
			contentNew = contentOld.substring(0, index) + next + contentOld.substring(index + old.length);
		}

		await vscode.workspace.fs.writeFile(uri, Buffer.from(contentNew, 'utf8'));

		const oldLines = contentOld.split('\n').length;
		const newLines = contentNew.split('\n').length;

		return {
			title: path.relative(ctx.workspaceRoot, filePath),
			output: 'Edit applied successfully.',
			metadata: {
				diff: generateDiff(contentOld, contentNew, filePath),
				additions: Math.max(0, newLines - oldLines),
				deletions: Math.max(0, oldLines - newLines),
			},
		};
	},
};

function generateDiff(oldContent: string, newContent: string, filePath: string): string {
	const oldLines = oldContent.split('\n');
	const newLines = newContent.split('\n');
	const diff: string[] = [
		`--- ${filePath}`,
		`+++ ${filePath}`,
	];

	// _maxLen computed but not currently used
	// const _maxLen = Math.max(oldLines.length, newLines.length);
	let oldIdx = 0;
	let newIdx = 0;

	while (oldIdx < oldLines.length || newIdx < newLines.length) {
		if (oldIdx >= oldLines.length) {
			diff.push(`+${newLines[newIdx]}`);
			newIdx++;
		} else if (newIdx >= newLines.length) {
			diff.push(`-${oldLines[oldIdx]}`);
			oldIdx++;
		} else if (oldLines[oldIdx] === newLines[newIdx]) {
			diff.push(` ${oldLines[oldIdx]}`);
			oldIdx++;
			newIdx++;
		} else {
			diff.push(`-${oldLines[oldIdx]}`);
			diff.push(`+${newLines[newIdx]}`);
			oldIdx++;
			newIdx++;
		}
	}

	return diff.join('\n');
}
