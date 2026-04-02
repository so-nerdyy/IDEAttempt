import * as vscode from 'vscode';
import { ToolDefinition, ToolResult, ToolExecutionContext } from './tool-execution-service';

export const QuestionTool: ToolDefinition = {
	id: 'question',
	name: 'Question',
	description: 'Ask the user one or more questions and wait for their answers.',
	parameters: [
		{ name: 'questions', type: 'array', description: 'Array of questions to ask the user', required: true },
	],
	async execute(args, ctx): Promise<ToolResult> {
		const questions = (args.questions as Array<{
			question: string;
			header?: string;
			options?: Array<{ label: string; description: string }>;
			multiple?: boolean;
		}>) ?? [];

		const answers: Record<string, string | string[]> = {};

		for (const q of questions) {
			if (q.options && q.options.length > 0) {
				const items = q.options.map((opt) => ({
					label: opt.label,
					description: opt.description,
				}));

				const selection = await vscode.window.showQuickPick(items, {
					placeHolder: q.question,
					canPickMany: q.multiple ?? false,
					title: q.header,
				});

				if (selection) {
					if (Array.isArray(selection)) {
						answers[q.question] = selection.map((s) => s.label);
					} else {
						answers[q.question] = (selection as any).label;
					}
				} else {
					answers[q.question] = '(no answer)';
				}
			} else {
				const answer = await vscode.window.showInputBox({
					prompt: q.question,
					placeHolder: 'Type your answer...',
					title: q.header,
				});

				answers[q.question] = answer ?? '(no answer)';
			}
		}

		const output = Object.entries(answers)
			.map(([q, a]) => `Q: ${q}\nA: ${Array.isArray(a) ? a.join(', ') : a}`)
			.join('\n\n');

		return {
			title: 'question',
			output,
			metadata: { answers },
		};
	},
};
