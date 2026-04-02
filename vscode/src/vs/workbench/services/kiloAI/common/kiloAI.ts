/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

// kilocode_change - new file

export const IKiloAIService = createDecorator<IKiloAIService>('kiloAIService');

export interface KiloAIEvent {
	type: string;
	directory?: string;
	payload: {
		type: string;
		properties: Record<string, unknown>;
	};
}

export interface KiloAIConnectionState {
	status: 'disconnected' | 'connecting' | 'connected' | 'error';
	error?: string;
}

export interface IKiloAIService {
	readonly _serviceBrand: undefined;

	readonly onDidChangeConnectionState: Event<KiloAIConnectionState>;
	readonly onEvent: Event<KiloAIEvent>;

	/**
	 * Start the Kilo AI service for a given workspace directory.
	 * This initializes the opencode server in-process.
	 */
	start(workspaceDir: string): Promise<void>;

	/**
	 * Stop the Kilo AI service for a given workspace directory.
	 */
	stop(workspaceDir?: string): Promise<void>;

	/**
	 * Check if the service is running for a workspace.
	 */
	isRunning(workspaceDir: string): boolean;

	// --- Session operations (direct method calls replacing HTTP) ---

	sessionCreate(input: { directory: string; parentID?: string; title?: string }): Promise<SessionInfo>;
	sessionGet(input: { sessionID: string; directory: string }): Promise<SessionInfo>;
	sessionList(input: { directory: string }): Promise<SessionInfo[]>;
	sessionDelete(input: { sessionID: string; directory: string }): Promise<void>;
	sessionFork(input: { sessionID: string; messageID?: string; directory: string }): Promise<SessionInfo>;
	sessionAbort(input: { sessionID: string; directory: string }): Promise<void>;
	sessionMessages(input: { sessionID: string; directory: string; limit?: number }): Promise<MessageWithParts[]>;

	// --- Prompt operations ---

	sessionPrompt(input: PromptInput): Promise<AsyncIterableIterator<MessagePart>>;
	sessionPromptAsync(input: { sessionID: string; directory: string; parts: PromptPart[] }): Promise<void>;
	sessionCommand(input: { sessionID: string; directory: string; command: string; arguments?: string }): Promise<void>;

	// --- Auth operations (backed by VS Code SecretStorage) ---

	authSet(providerID: string, credentials: AuthInfo): Promise<void>;
	authGet(providerID: string): Promise<AuthInfo | undefined>;
	authRemove(providerID: string): Promise<void>;

	// --- Provider operations ---

	providerList(input: { directory: string }): Promise<ProviderInfo[]>;

	// --- Config operations ---

	configGet(input: { directory: string }): Promise<ServerConfig>;
	configUpdate(input: { directory: string; config: Partial<ServerConfig> }): Promise<ServerConfig>;

	// --- Instance lifecycle ---

	instanceDispose(input: { directory: string }): Promise<void>;
}

// --- Type definitions mirroring the opencode server types ---

export interface SessionInfo {
	id: string;
	projectID: string;
	workspaceID?: string;
	directory: string;
	parentID?: string;
	title: string;
	version: string;
	summary?: {
		additions: number;
		deletions: number;
		files: number;
	};
	share?: { url: string };
	time: {
		created: number;
		updated: number;
		compacting?: number;
	};
	revert?: {
		messageID: string;
		partID?: string;
	};
}

export interface MessageWithParts {
	id: string;
	sessionID: string;
	role: 'user' | 'assistant';
	time: { created: number; completed?: number };
	parts: MessagePart[];
	modelID?: string;
	providerID?: string;
	error?: Record<string, unknown>;
	finish?: string;
	cost?: number;
	tokens?: {
		input: number;
		output: number;
		reasoning: number;
		cache: { read: number; write: number };
	};
}

export interface MessagePart {
	id: string;
	messageID: string;
	sessionID: string;
	type: string;
	content?: string;
	state?: string;
	name?: string;
	input?: Record<string, unknown>;
	output?: string;
	info?: Record<string, unknown>;
}

export type PromptPart =
	| { type: 'text'; text: string }
	| { type: 'file'; path: string; content?: string }
	| { type: 'agent'; name: string };

export interface PromptInput {
	sessionID: string;
	directory: string;
	messageID?: string;
	parts: PromptPart[];
	model?: { providerID: string; modelID: string };
	agent?: string;
	system?: string;
	tools?: Record<string, boolean>;
}

export interface AuthInfo {
	type: 'oauth' | 'api' | 'wellKnown';
	[key: string]: unknown;
}

export interface ProviderInfo {
	id: string;
	name: string;
	models: string[];
}

export interface ServerConfig {
	[key: string]: unknown;
}
