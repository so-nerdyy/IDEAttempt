import * as vscode from 'vscode';
import { ToolExecutionService, ToolDefinition, ToolPermissionService } from './tool-execution-service';
import { ReadTool } from './tools/read';
import { WriteTool } from './tools/write';
import { EditTool } from './tools/edit';
import { GlobTool } from './tools/glob';
import { GrepTool } from './tools/grep';
import { LsTool } from './tools/ls';
import { BashTool } from './tools/bash';
import { WebFetchTool } from './tools/webfetch';
import { WebSearchTool } from './tools/websearch';
import { CodeSearchTool } from './tools/codesearch';
import { ApplyPatchTool } from './tools/apply_patch';
import { TodoWriteTool, TodoReadTool } from './tools/todo';
import { TaskTool } from './tools/task';
import { QuestionTool } from './tools/question';
import { PlanExitTool } from './tools/plan_exit';
import { SkillTool } from './tools/skill';
import { InvalidTool } from './tools/invalid';
import { BatchTool } from './tools/batch';

export function registerAllTools(
	service: ToolExecutionService,
): void {
	const tools: ToolDefinition[] = [
		InvalidTool,
		QuestionTool,
		BashTool,
		ReadTool,
		GlobTool,
		GrepTool,
		LsTool,
		EditTool,
		WriteTool,
		ApplyPatchTool,
		TaskTool,
		WebFetchTool,
		WebSearchTool,
		CodeSearchTool,
		TodoWriteTool,
		TodoReadTool,
		SkillTool,
		BatchTool,
		PlanExitTool,
	];

	for (const tool of tools) {
		service.registerTool(tool);
	}
}

export function createToolExecutionService(
	context: vscode.ExtensionContext,
	workspaceRoot: string,
): { service: ToolExecutionService; permissionService: ToolPermissionService } {
	const permissionService = new ToolPermissionService();
	const service = new ToolExecutionService(context, permissionService, workspaceRoot);

	registerAllTools(service);

	return { service, permissionService };
}
