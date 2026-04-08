import * as path from 'path';
import { ToolDefinition, ToolResult, ToolExecutionContext, resolvePath } from '../tool-execution-service';
import { spawn } from '../../../../util/process';

export const GrepTool: ToolDefinition = {
	id: 'grep',
	name: 'Grep',
	description: 'Search file contents using regular expressions. Uses ripgrep for fast searching.',
	parameters: [
		{ name: 'pattern', type: 'string', description: 'The regex pattern to search for', required: true },
		{ name: 'path', type: 'string', description: 'The directory to search in (defaults to workspace root)', required: false },
		{ name: 'include', type: 'string', description: 'File pattern to include (e.g. "*.ts")', required: false },
	],
	async execute(args, ctx): Promise<ToolResult> {
		const pattern = args.pattern as string;
		const searchPath = args.path ? resolvePath(args.path as string, ctx.workspaceRoot) : ctx.workspaceRoot;
		const include = args.include as string | undefined;

		const permResponse = await ctx.requestPermission({
			type: 'grep',
			patterns: [pattern],
		});

		if (permResponse === 'deny') {
			return {
				title: 'grep',
				output: `Grep denied for pattern: ${pattern}`,
				metadata: { denied: true },
			};
		}

		const grepArgs = ['--line-number', '--column', '--no-heading', '--color=never', pattern, searchPath];

		if (include) {
			grepArgs.push('--glob', include);
		}

		return new Promise<ToolResult>((resolve, reject) => {
			let output = '';
			const proc = spawn('rg', grepArgs, {
				cwd: searchPath,
				stdio: ['ignore', 'pipe', 'pipe'],
			});

			proc.stdout?.on('data', (chunk: Buffer) => {
				output += chunk.toString('utf8');
			});

			proc.stderr?.on('data', (_chunk: Buffer) => {
				// Ignore stderr from ripgrep
			});

			proc.on('close', (code: number) => {
				if (code === 0 || code === 1) {
					// 0 = matches found, 1 = no matches
					const lines = output.trim().split('\n').filter(Boolean);
					const formatted = lines.map((line) => {
						const match = line.match(/^(.+?):(\d+):(\d+):(.*)$/);
						if (match) {
							const [, file, lineNum, colNum, content] = match;
							const relPath = path.relative(ctx.workspaceRoot, file);
							return `${relPath}:${lineNum}:${colNum}|${content}`;
						}
						return line;
					});

					resolve({
						title: `grep: ${pattern}`,
						output: formatted.length > 0
							? formatted.join('\n')
							: 'No matches found.',
						metadata: { count: formatted.length, pattern },
					});
				} else {
					reject(new Error(`grep failed with exit code ${code}`));
				}
			});

			proc.on('error', (error: Error) => {
				reject(error);
			});
		});
	},
};
