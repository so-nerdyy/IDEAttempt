import * as path from 'path';
import { ToolDefinition, ToolResult, ToolExecutionContext, resolvePath } from '../tool-execution-service';
import * as vscode from 'vscode';

export const ApplyPatchTool: ToolDefinition = {
	id: 'apply_patch',
	name: 'ApplyPatch',
	description: 'Apply a unified diff patch to one or more files. Creates new files, modifies existing ones, or deletes files.',
	parameters: [
		{ name: 'patchText', type: 'string', description: 'The unified diff patch text to apply', required: true },
	],
	async execute(args, ctx): Promise<ToolResult> {
		const patchText = args.patchText as string;

		const permResponse = await ctx.requestPermission({
			type: 'edit',
			patterns: parsePatchFiles(patchText).map((f) => path.relative(ctx.workspaceRoot, f)),
		});

		if (permResponse === 'deny') {
			return {
				title: 'apply_patch',
				output: 'Apply patch denied.',
				metadata: { denied: true },
			};
		}

		const hunks = parseUnifiedDiff(patchText);
		const results: string[] = [];

		for (const hunk of hunks) {
			const filePath = resolvePath(hunk.filePath, ctx.workspaceRoot);
			const uri = vscode.Uri.file(filePath);

			try {
				let oldContent = '';
				try {
					const bytes = await vscode.workspace.fs.readFile(uri);
					oldContent = Buffer.from(bytes).toString('utf8');
				} catch {
					// File does not exist, will be created
				}

				const newContent = applyHunk(oldContent, hunk);
				await vscode.workspace.fs.writeFile(uri, Buffer.from(newContent, 'utf8'));
				results.push(`Applied to ${hunk.filePath}`);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				results.push(`Failed to apply to ${hunk.filePath}: ${message}`);
			}
		}

		return {
			title: 'apply_patch',
			output: results.join('\n'),
			metadata: { filesModified: hunks.length },
		};
	},
};

interface PatchHunk {
	filePath: string;
	oldStart: number;
	oldCount: number;
	newStart: number;
	newCount: number;
	lines: string[];
}

function parsePatchFiles(patchText: string): string[] {
	const files = new Set<string>();
	const lines = patchText.split('\n');
	for (const line of lines) {
		if (line.startsWith('--- a/') || line.startsWith('--- /dev/null')) {
			const match = line.match(/^--- (?:a\/)?(.+)$/);
			if (match) files.add(match[1]);
		}
		if (line.startsWith('+++ b/') || line.startsWith('+++ /dev/null')) {
			const match = line.match(/^\+\+\+ (?:b\/)?(.+)$/);
			if (match) files.add(match[1]);
		}
	}
	return Array.from(files);
}

function parseUnifiedDiff(patchText: string): PatchHunk[] {
	const lines = patchText.split('\n');
	const hunks: PatchHunk[] = [];
	let currentFile = '';
	let inHunk = false;
	let currentHunk: PatchHunk | null = null;

	for (const line of lines) {
		if (line.startsWith('--- ')) {
			const match = line.match(/^--- (?:a\/)?(.+)$/);
			if (match && match[1] !== '/dev/null') {
				currentFile = match[1];
			}
		}

		if (line.startsWith('@@ ')) {
			const match = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
			if (match) {
				if (currentHunk) {
					hunks.push(currentHunk);
				}
				currentHunk = {
					filePath: currentFile,
					oldStart: parseInt(match[1], 10),
					oldCount: match[2] ? parseInt(match[2], 10) : 1,
					newStart: parseInt(match[3], 10),
					newCount: match[4] ? parseInt(match[4], 10) : 1,
					lines: [],
				};
				inHunk = true;
			}
		} else if (inHunk && currentHunk && (line.startsWith('+') || line.startsWith('-') || line.startsWith(' '))) {
			currentHunk.lines.push(line);
		}
	}

	if (currentHunk) {
		hunks.push(currentHunk);
	}

	return hunks;
}

function applyHunk(oldContent: string, hunk: PatchHunk): string {
	const lines = oldContent.split('\n');
	const result: string[] = [];
	let oldIdx = 0;
	let lineIdx = 0;

	while (oldIdx < lines.length || lineIdx < hunk.lines.length) {
		if (oldIdx < hunk.oldStart - 1) {
			result.push(lines[oldIdx]);
			oldIdx++;
			continue;
		}

		if (lineIdx >= hunk.lines.length) {
			while (oldIdx < lines.length) {
				result.push(lines[oldIdx]);
				oldIdx++;
			}
			break;
		}

		const hunkLine = hunk.lines[lineIdx];
		lineIdx++;

		if (hunkLine.startsWith('+')) {
			result.push(hunkLine.substring(1));
		} else if (hunkLine.startsWith('-')) {
			oldIdx++;
		} else if (hunkLine.startsWith(' ')) {
			result.push(hunkLine.substring(1));
			oldIdx++;
		}
	}

	return result.join('\n');
}
