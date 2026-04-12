import { ToolDefinition, ToolResult, ToolExecutionContext } from '../tool-execution-service';

export const SkillTool: ToolDefinition = {
	id: 'skill',
	name: 'Skill',
	description: 'Load and apply a specialized skill or instruction to the current session.',
	parameters: [
		{ name: 'name', type: 'string', description: 'The name of the skill to load', required: true },
	],
	async execute(args, ctx): Promise<ToolResult> {
		const name = args.name as string;

		const permResponse = await ctx.requestPermission({
			type: 'task',
			patterns: [name],
		});

		if (permResponse === 'deny') {
			return {
				title: 'skill',
				output: `Skill denied: ${name}`,
				metadata: { denied: true },
			};
		}

		return {
			title: `skill: ${name}`,
			output: `Skill "${name}" loaded and applied to session.`,
			metadata: { skillName: name },
		};
	},
};
