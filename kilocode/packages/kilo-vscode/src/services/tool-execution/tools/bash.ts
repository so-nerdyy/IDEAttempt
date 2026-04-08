import * as path from 'path';
import { ToolDefinition, ToolResult, ToolExecutionContext, resolvePath } from '../tool-execution-service';
import { spawn } from '../../../util/process';

export const BashTool: ToolDefinition = {
	id: 'bash',
	name: 'Bash',
	description: 'Execute a bash command. Returns stdout and stderr output. Supports timeout and working directory.',
	parameters: [
		{ name: 'command', type: 'string', description: 'The bash command to execute', required: true },
		{ name: 'timeout', type: 'number', description: 'Optional timeout in milliseconds', required: false },
		{ name: 'workdir', type: 'string', description: 'The working directory to run the command in', required: false },
		{ name: 'description', type: 'string', description: 'Clear, concise description of what this command does in 5-10 words', required: true },
	],
	async execute(args, ctx): Promise<ToolResult> {
		const command = args.command as string;
		const timeout = (args.timeout as number) ?? 120000;
		const workdir = args.workdir
			? resolvePath(args.workdir as string, ctx.workspaceRoot)
			: ctx.workspaceRoot;
		const description = args.description as string;

		const permResponse = await ctx.requestPermission({
			type: 'bash',
			patterns: [command],
			metadata: { workdir },
		});

		if (permResponse === 'deny') {
			return {
				title: description,
				output: `Bash command denied: ${command}`,
				metadata: { denied: true },
			};
		}

		return new Promise<ToolResult>((resolve, reject) => {
			let output = '';
			let timedOut = false;
			let aborted = false;

			ctx.onMetadataUpdate({
				output: '',
				description,
			});

			const proc = spawn(command, [], {
				shell: true,
				cwd: workdir,
				env: process.env as NodeJS.ProcessEnv,
				stdio: ['ignore', 'pipe', 'pipe'],
			});

			const timeoutTimer = setTimeout(() => {
				timedOut = true;
				proc.kill('SIGTERM');
			}, timeout);

			const abortHandler = () => {
				aborted = true;
				proc.kill('SIGTERM');
			};

			ctx.abortSignal.addEventListener('abort', abortHandler, { once: true });

			proc.stdout?.on('data', (chunk: Buffer) => {
				output += chunk.toString('utf8');
				ctx.onMetadataUpdate({
					output: output.length > 30000 ? output.slice(0, 30000) + '\n\n...' : output,
					description,
				});
			});

			proc.stderr?.on('data', (chunk: Buffer) => {
				output += chunk.toString('utf8');
				ctx.onMetadataUpdate({
					output: output.length > 30000 ? output.slice(0, 30000) + '\n\n...' : output,
					description,
				});
			});

			proc.on('close', (code: number | null) => {
				clearTimeout(timeoutTimer);
				ctx.abortSignal.removeEventListener('abort', abortHandler);

				const metadata: string[] = [];
				if (timedOut) {
					metadata.push(`bash tool terminated command after exceeding timeout ${timeout} ms`);
				}
				if (aborted) {
					metadata.push('User aborted the command');
				}
				if (metadata.length > 0) {
					output += '\n\n<bash_metadata>\n' + metadata.join('\n') + '\n</bash_metadata>';
				}

				resolve({
					title: description,
					output,
					metadata: {
						output: output.length > 30000 ? output.slice(0, 30000) + '\n\n...' : output,
						exit: code,
						description,
					},
				});
			});

			proc.on('error', (error: Error) => {
				clearTimeout(timeoutTimer);
				ctx.abortSignal.removeEventListener('abort', abortHandler);
				reject(error);
			});
		});
	},
};
