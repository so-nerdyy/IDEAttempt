import { ToolDefinition, ToolResult, ToolExecutionContext } from './tool-execution-service';

export const PlanExitTool: ToolDefinition = {
	id: 'plan_exit',
	name: 'PlanExit',
	description: 'Signal that the planning phase is complete and the agent is ready to start implementation.',
	parameters: [],
	async execute(_args, ctx): Promise<ToolResult> {
		return {
			title: 'plan_exit',
			output: 'Planning complete. Ready to implement.',
			metadata: { phase: 'planning_complete' },
		};
	},
};
