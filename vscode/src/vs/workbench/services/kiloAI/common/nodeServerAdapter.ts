/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { KiloAIEvent, KiloAIConnectionState, SessionInfo, MessageWithParts, PromptInput, PromptPart, ProviderInfo, ServerConfig } from './kiloAI.js';

// kilocode_change - new file

/**
 * Interface for the Node.js server adapter that wraps the opencode Hono app.
 *
 * This adapter replaces Bun.serve with direct method calls to the opencode server
 * internals, avoiding HTTP overhead entirely.
 */
export interface INodeServerAdapter {
	sessionCreate(input: { directory: string; parentID?: string; title?: string }): Promise<SessionInfo>;
	sessionGet(input: { sessionID: string; directory: string }): Promise<SessionInfo>;
	sessionList(input: { directory: string }): Promise<SessionInfo[]>;
	sessionDelete(input: { sessionID: string; directory: string }): Promise<void>;
	sessionFork(input: { sessionID: string; messageID?: string; directory: string }): Promise<SessionInfo>;
	sessionAbort(input: { sessionID: string; directory: string }): Promise<void>;
	sessionMessages(input: { sessionID: string; directory: string; limit?: number }): Promise<MessageWithParts[]>;
	sessionPrompt(input: PromptInput): Promise<AsyncIterableIterator<MessagePart>>;
	sessionPromptAsync(input: { sessionID: string; directory: string; parts: PromptPart[] }): Promise<void>;
	sessionCommand(input: { sessionID: string; directory: string; command: string }): Promise<void>;
	providerList(input: { directory: string }): Promise<ProviderInfo[]>;
	configGet(input: { directory: string }): Promise<ServerConfig>;
	configUpdate(input: { directory: string; config: Partial<ServerConfig> }): Promise<ServerConfig>;
	instanceDispose(input: { directory: string }): Promise<void>;
	dispose(): Promise<void>;
}

export interface INodeServerAdapterOptions {
	workspaceDir: string;
	onEvent: (event: KiloAIEvent) => void;
	onStateChange: (state: KiloAIConnectionState) => void;
}

/**
 * Factory function to create a Node.js server adapter.
 *
 * This function dynamically imports the opencode server modules and wraps them
 * in a Node.js-compatible interface. The actual implementation lives in the
 * kilocode monorepo and is adapted here for VS Code's Node.js runtime.
 *
 * Key adaptations:
 * - Replaces Bun.serve with direct function invocation
 * - Replaces bun:sqlite with better-sqlite3
 * - Replaces SSE streams with VS Code Event emitters
 * - Uses VS Code userDataPath for SQLite database storage
 */
export async function createNodeServerAdapter(options: INodeServerAdapterOptions): Promise<INodeServerAdapter> {
	const { workspaceDir, onEvent, onStateChange } = options;

	// kilocode_change - The actual adapter implementation would import from the
	// kilocode packages. For now, this is a scaffolding that demonstrates the
	// architecture. The real implementation would look like:
	//
	// import { Session } from '@kilocode/opencode/session';
	// import { SessionPrompt } from '@kilocode/opencode/session/prompt';
	// import { Instance } from '@kilocode/opencode/project/instance';
	// import { Bus } from '@kilocode/opencode/bus';
	// import { Provider } from '@kilocode/opencode/provider/provider';
	// import { Config } from '@kilocode/opencode/config/config';
	//
	// And would set up:
	// 1. Database path override to use VS Code userDataPath
	// 2. GlobalBus event forwarding to onEvent callback
	// 3. Instance.provide wrapping for each workspace directory
	// 4. Direct method calls instead of HTTP routing

	return new NodeServerAdapterImpl(workspaceDir, onEvent, onStateChange);
}

/**
 * Concrete implementation of the Node.js server adapter.
 *
 * This class wraps the opencode server's internal modules and exposes them
 * as direct method calls. Each method wraps the corresponding opencode function
 * in Instance.provide to ensure proper context.
 */
class NodeServerAdapterImpl extends Disposable implements INodeServerAdapter {
	private _initialized = false;

	constructor(
		private readonly _workspaceDir: string,
		private readonly _onEvent: (event: KiloAIEvent) => void,
		private readonly _onStateChange: (state: KiloAIConnectionState) => void,
	) {
		super();
		this._onStateChange({ status: 'connected' });
		this._initialized = true;
	}

	async sessionCreate(input: { directory: string; parentID?: string; title?: string }): Promise<SessionInfo> {
		this._assertInitialized();
		// kilocode_change - Real implementation:
		// return Instance.provide({
		//   directory: input.directory,
		//   fn: () => Session.create({ parentID: input.parentID, title: input.title })
		// });
		throw new Error('Not yet implemented - requires opencode server integration');
	}

	async sessionGet(input: { sessionID: string; directory: string }): Promise<SessionInfo> {
		this._assertInitialized();
		// return Instance.provide({
		//   directory: input.directory,
		//   fn: () => Session.get(input.sessionID)
		// });
		throw new Error('Not yet implemented - requires opencode server integration');
	}

	async sessionList(input: { directory: string }): Promise<SessionInfo[]> {
		this._assertInitialized();
		// const results: SessionInfo[] = [];
		// await Instance.provide({
		//   directory: input.directory,
		//   fn: async () => {
		//     for await (const session of Session.list({ directory: input.directory })) {
		//       results.push(session);
		//     }
		//   }
		// });
		// return results;
		throw new Error('Not yet implemented - requires opencode server integration');
	}

	async sessionDelete(input: { sessionID: string; directory: string }): Promise<void> {
		this._assertInitialized();
		// return Instance.provide({
		//   directory: input.directory,
		//   fn: () => Session.remove(input.sessionID)
		// });
		throw new Error('Not yet implemented - requires opencode server integration');
	}

	async sessionFork(input: { sessionID: string; messageID?: string; directory: string }): Promise<SessionInfo> {
		this._assertInitialized();
		// return Instance.provide({
		//   directory: input.directory,
		//   fn: () => Session.fork({ sessionID: input.sessionID, messageID: input.messageID })
		// });
		throw new Error('Not yet implemented - requires opencode server integration');
	}

	async sessionAbort(input: { sessionID: string; directory: string }): Promise<void> {
		this._assertInitialized();
		// return Instance.provide({
		//   directory: input.directory,
		//   fn: () => SessionPrompt.cancel(input.sessionID)
		// });
		throw new Error('Not yet implemented - requires opencode server integration');
	}

	async sessionMessages(input: { sessionID: string; directory: string; limit?: number }): Promise<MessageWithParts[]> {
		this._assertInitialized();
		// return Instance.provide({
		//   directory: input.directory,
		//   fn: () => Session.messages({ sessionID: input.sessionID, limit: input.limit })
		// });
		throw new Error('Not yet implemented - requires opencode server integration');
	}

	async sessionPrompt(input: PromptInput): Promise<AsyncIterableIterator<MessagePart>> {
		this._assertInitialized();
		// return Instance.provide({
		//   directory: input.directory,
		//   fn: () => SessionPrompt.prompt({
		//     sessionID: input.sessionID,
		//     parts: input.parts,
		//     model: input.model,
		//     agent: input.agent,
		//     system: input.system,
		//     tools: input.tools,
		//   })
		// });
		throw new Error('Not yet implemented - requires opencode server integration');
	}

	async sessionPromptAsync(input: { sessionID: string; directory: string; parts: PromptPart[] }): Promise<void> {
		this._assertInitialized();
		// return Instance.provide({
		//   directory: input.directory,
		//   fn: () => SessionPrompt.prompt({
		//     sessionID: input.sessionID,
		//     parts: input.parts,
		//     noReply: true,
		//   })
		// });
		throw new Error('Not yet implemented - requires opencode server integration');
	}

	async sessionCommand(input: { sessionID: string; directory: string; command: string }): Promise<void> {
		this._assertInitialized();
		// return Instance.provide({
		//   directory: input.directory,
		//   fn: () => SessionPrompt.command({ sessionID: input.sessionID, command: input.command })
		// });
		throw new Error('Not yet implemented - requires opencode server integration');
	}

	async providerList(input: { directory: string }): Promise<ProviderInfo[]> {
		this._assertInitialized();
		// return Instance.provide({
		//   directory: input.directory,
		//   fn: () => Provider.list()
		// });
		throw new Error('Not yet implemented - requires opencode server integration');
	}

	async configGet(input: { directory: string }): Promise<ServerConfig> {
		this._assertInitialized();
		// return Instance.provide({
		//   directory: input.directory,
		//   fn: () => Config.get()
		// });
		throw new Error('Not yet implemented - requires opencode server integration');
	}

	async configUpdate(input: { directory: string; config: Partial<ServerConfig> }): Promise<ServerConfig> {
		this._assertInitialized();
		// return Instance.provide({
		//   directory: input.directory,
		//   fn: () => Config.update(input.config)
		// });
		throw new Error('Not yet implemented - requires opencode server integration');
	}

	async instanceDispose(input: { directory: string }): Promise<void> {
		this._assertInitialized();
		// return Instance.provide({
		//   directory: input.directory,
		//   fn: () => Instance.dispose()
		// });
		throw new Error('Not yet implemented - requires opencode server integration');
	}

	async dispose(): Promise<void> {
		this._onStateChange({ status: 'disconnected' });
		this._initialized = false;
		super.dispose();
	}

	private _assertInitialized(): void {
		if (!this._initialized) {
			throw new Error('NodeServerAdapter not initialized');
		}
	}
}
