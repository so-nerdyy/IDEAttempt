/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { KiloAIEvent, KiloAIConnectionState, SessionInfo, MessageWithParts, PromptInput, PromptPart, ProviderInfo, ServerConfig, MessagePart } from './kiloAI.js';

// kilocode_change - new file

// Dynamic imports for opencode modules (Node.js runtime only)
// These are loaded lazily to avoid bundling issues in browser contexts
type SessionModule = typeof import('@kilocode/cli/session');
type SessionPromptModule = typeof import('@kilocode/cli/session/prompt');
type InstanceModule = typeof import('@kilocode/cli/project/instance');
type BusModule = typeof import('@kilocode/cli/bus');
type ProviderModule = typeof import('@kilocode/cli/provider/provider');
type ConfigModule = typeof import('@kilocode/cli/config/config');
type MessageV2Module = typeof import('@kilocode/cli/session/message-v2');

let Session: SessionModule['Session'] | undefined;
let SessionPrompt: SessionPromptModule['SessionPrompt'] | undefined;
let Instance: InstanceModule['Instance'] | undefined;
let Bus: BusModule['Bus'] | undefined;
let Provider: ProviderModule['Provider'] | undefined;
let Config: ConfigModule['Config'] | undefined;
let MessageV2: MessageV2Module['MessageV2'] | undefined;

async function loadModules(): Promise<void> {
	if (Session) return; // Already loaded

	// Set platform flag for Node.js-specific behavior (better-sqlite3, etc.)
	process.env.KILO_PLATFORM = 'vscode';

	const [sessionMod, promptMod, instanceMod, busMod, providerMod, configMod, messageV2Mod] = await Promise.all([
		import('@kilocode/cli/session'),
		import('@kilocode/cli/session/prompt'),
		import('@kilocode/cli/project/instance'),
		import('@kilocode/cli/bus'),
		import('@kilocode/cli/provider/provider'),
		import('@kilocode/cli/config/config'),
		import('@kilocode/cli/session/message-v2'),
	]);

	Session = sessionMod.Session;
	SessionPrompt = promptMod.SessionPrompt;
	Instance = instanceMod.Instance;
	Bus = busMod.Bus;
	Provider = providerMod.Provider;
	Config = configMod.Config;
	MessageV2 = messageV2Mod.MessageV2;
}

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
	sessionCommand(input: { sessionID: string; directory: string; command: string; arguments?: string }): Promise<void>;
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

function mapSessionInfo(info: NonNullable<SessionModule['Session']['Info'] extends infer T extends { id: string } ? T : never>): SessionInfo {
	return {
		id: info.id,
		projectID: info.projectID,
		workspaceID: info.workspaceID,
		directory: info.directory,
		parentID: info.parentID,
		title: info.title,
		version: info.version,
		summary: info.summary ? {
			additions: info.summary.additions,
			deletions: info.summary.deletions,
			files: info.summary.files,
		} : undefined,
		share: info.share,
		time: {
			created: info.time.created,
			updated: info.time.updated,
			compacting: info.time.compacting,
		},
		revert: info.revert,
	};
}

function mapMessageWithParts(msg: { info: { id: string; sessionID: string; role: string; time: { created: number; completed?: number }; modelID?: string; providerID?: string; error?: unknown; finish?: string; cost?: number; tokens?: { input: number; output: number; reasoning: number; cache: { read: number; write: number } } }; parts: Array<{ id: string; messageID: string; sessionID: string; type: string; content?: string; state?: unknown; name?: string; input?: unknown; output?: string; info?: unknown }> }): MessageWithParts {
	return {
		id: msg.info.id,
		sessionID: msg.info.sessionID,
		role: msg.info.role as 'user' | 'assistant',
		time: msg.info.time,
		parts: msg.parts.map(mapMessagePart),
		modelID: msg.info.modelID,
		providerID: msg.info.providerID,
		error: msg.info.error as Record<string, unknown> | undefined,
		finish: msg.info.finish,
		cost: msg.info.cost,
		tokens: msg.info.tokens,
	};
}

function mapMessagePart(part: { id: string; messageID: string; sessionID: string; type: string; content?: string; state?: unknown; name?: string; input?: unknown; output?: string; info?: unknown }): MessagePart {
	return {
		id: part.id,
		messageID: part.messageID,
		sessionID: part.sessionID,
		type: part.type,
		content: part.content,
		state: part.state as string | undefined,
		name: part.name,
		input: part.input as Record<string, unknown> | undefined,
		output: part.output,
		info: part.info as Record<string, unknown> | undefined,
	};
}

function mapPromptParts(parts: PromptPart[]): Array<{ type: string; text?: string; path?: string; content?: string; name?: string }> {
	return parts.map(part => {
		if (part.type === 'text') {
			return { type: 'text', text: part.text };
		} else if (part.type === 'file') {
			return { type: 'file', path: part.path, content: part.content };
		} else if (part.type === 'agent') {
			return { type: 'agent', name: part.name };
		}
		return part;
	});
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

	await loadModules();

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
	private readonly _eventUnsubscribers: Array<() => void> = [];

	constructor(
		private readonly _workspaceDir: string,
		private readonly _onEvent: (event: KiloAIEvent) => void,
		private readonly _onStateChange: (state: KiloAIConnectionState) => void,
	) {
		super();
		this._setupEventForwarding();
		this._onStateChange({ status: 'connected' });
		this._initialized = true;
	}

	private _setupEventForwarding(): void {
		if (!Bus || !Session || !MessageV2) return;

		// Forward session events
		this._eventUnsubscribers.push(
			Bus.subscribe(Session.Event.Created, (event) => {
				this._onEvent({
					type: 'session.created',
					directory: event.properties.info.directory,
					payload: { type: 'session.created', properties: event.properties },
				});
			})
		);

		this._eventUnsubscribers.push(
			Bus.subscribe(Session.Event.Updated, (event) => {
				this._onEvent({
					type: 'session.updated',
					directory: event.properties.info.directory,
					payload: { type: 'session.updated', properties: event.properties },
				});
			})
		);

		this._eventUnsubscribers.push(
			Bus.subscribe(Session.Event.Deleted, (event) => {
				this._onEvent({
					type: 'session.deleted',
					directory: event.properties.info.directory,
					payload: { type: 'session.deleted', properties: event.properties },
				});
			})
		);

		this._eventUnsubscribers.push(
			Bus.subscribe(Session.Event.Error, (event) => {
				this._onEvent({
					type: 'session.error',
					directory: undefined,
					payload: { type: 'session.error', properties: event.properties },
				});
			})
		);

		// Forward turn events (kilocode_change)
		this._eventUnsubscribers.push(
			Bus.subscribe(Session.Event.TurnOpen, (event) => {
				this._onEvent({
					type: 'session.turn.open',
					directory: undefined,
					payload: { type: 'session.turn.open', properties: event.properties },
				});
			})
		);

		this._eventUnsubscribers.push(
			Bus.subscribe(Session.Event.TurnClose, (event) => {
				this._onEvent({
					type: 'session.turn.close',
					directory: undefined,
					payload: { type: 'session.turn.close', properties: event.properties },
				});
			})
		);

		// Forward message events
		this._eventUnsubscribers.push(
			Bus.subscribe(MessageV2.Event.Updated, (event) => {
				this._onEvent({
					type: 'message.updated',
					directory: undefined,
					payload: { type: 'message.updated', properties: event.properties },
				});
			})
		);

		this._eventUnsubscribers.push(
			Bus.subscribe(MessageV2.Event.PartUpdated, (event) => {
				this._onEvent({
					type: 'message.part.updated',
					directory: undefined,
					payload: { type: 'message.part.updated', properties: event.properties },
				});
			})
		);

		this._eventUnsubscribers.push(
			Bus.subscribe(MessageV2.Event.PartDelta, (event) => {
				this._onEvent({
					type: 'message.part.delta',
					directory: undefined,
					payload: { type: 'message.part.delta', properties: event.properties },
				});
			})
		);
	}

	async sessionCreate(input: { directory: string; parentID?: string; title?: string }): Promise<SessionInfo> {
		this._assertInitialized();
		if (!Instance || !Session) throw new Error('Modules not loaded');

		const info = await Instance.provide({
			directory: input.directory,
			fn: () => Session!.create({ parentID: input.parentID, title: input.title }),
		});

		return mapSessionInfo(info);
	}

	async sessionGet(input: { sessionID: string; directory: string }): Promise<SessionInfo> {
		this._assertInitialized();
		if (!Instance || !Session) throw new Error('Modules not loaded');

		const info = await Instance.provide({
			directory: input.directory,
			fn: () => Session!.get(input.sessionID),
		});

		return mapSessionInfo(info);
	}

	async sessionList(input: { directory: string }): Promise<SessionInfo[]> {
		this._assertInitialized();
		if (!Instance || !Session) throw new Error('Modules not loaded');

		const results: SessionInfo[] = [];
		await Instance.provide({
			directory: input.directory,
			fn: async () => {
				for await (const session of Session!.list({ directory: input.directory })) {
					results.push(mapSessionInfo(session));
				}
			},
		});
		return results;
	}

	async sessionDelete(input: { sessionID: string; directory: string }): Promise<void> {
		this._assertInitialized();
		if (!Instance || !Session) throw new Error('Modules not loaded');

		await Instance.provide({
			directory: input.directory,
			fn: () => Session!.remove(input.sessionID),
		});
	}

	async sessionFork(input: { sessionID: string; messageID?: string; directory: string }): Promise<SessionInfo> {
		this._assertInitialized();
		if (!Instance || !Session) throw new Error('Modules not loaded');

		const info = await Instance.provide({
			directory: input.directory,
			fn: () => Session!.fork({ sessionID: input.sessionID, messageID: input.messageID }),
		});

		return mapSessionInfo(info);
	}

	async sessionAbort(input: { sessionID: string; directory: string }): Promise<void> {
		this._assertInitialized();
		if (!SessionPrompt) throw new Error('Modules not loaded');

		SessionPrompt.cancel(input.sessionID);
	}

	async sessionMessages(input: { sessionID: string; directory: string; limit?: number }): Promise<MessageWithParts[]> {
		this._assertInitialized();
		if (!Instance || !Session) throw new Error('Modules not loaded');

		const messages = await Instance.provide({
			directory: input.directory,
			fn: () => Session!.messages({ sessionID: input.sessionID, limit: input.limit }),
		});

		return messages.map(mapMessageWithParts);
	}

	async sessionPrompt(input: PromptInput): Promise<AsyncIterableIterator<MessagePart>> {
		this._assertInitialized();
		if (!Instance || !SessionPrompt) throw new Error('Modules not loaded');

		// SessionPrompt.prompt returns Promise<MessageV2.WithParts>
		// For streaming, we collect parts as they arrive via Bus events
		// This is a simplified implementation - the full implementation would
		// use AsyncGenerator with event subscription for real-time streaming
		const result = await Instance.provide({
			directory: input.directory,
			fn: () => SessionPrompt!.prompt({
				sessionID: input.sessionID,
				messageID: input.messageID,
				parts: mapPromptParts(input.parts) as Parameters<typeof SessionPrompt!['prompt']>[0]['parts'],
				model: input.model,
				agent: input.agent,
				system: input.system,
				tools: input.tools,
			}),
		});

		// Return an async iterator that yields the parts
		return (async function* (): AsyncIterableIterator<MessagePart> {
			for (const part of result.parts) {
				yield mapMessagePart(part as Parameters<typeof mapMessagePart>[0]);
			}
		})();
	}

	async sessionPromptAsync(input: { sessionID: string; directory: string; parts: PromptPart[] }): Promise<void> {
		this._assertInitialized();
		if (!Instance || !SessionPrompt) throw new Error('Modules not loaded');

		await Instance.provide({
			directory: input.directory,
			fn: () => SessionPrompt!.prompt({
				sessionID: input.sessionID,
				parts: mapPromptParts(input.parts) as Parameters<typeof SessionPrompt!['prompt']>[0]['parts'],
				noReply: true,
			}),
		});
	}

	async sessionCommand(input: { sessionID: string; directory: string; command: string; arguments?: string }): Promise<void> {
		this._assertInitialized();
		if (!Instance || !SessionPrompt) throw new Error('Modules not loaded');

		await Instance.provide({
			directory: input.directory,
			fn: () => SessionPrompt!.command({
				sessionID: input.sessionID,
				command: input.command,
				arguments: input.arguments ?? '',
			}),
		});
	}

	async providerList(input: { directory: string }): Promise<ProviderInfo[]> {
		this._assertInitialized();
		if (!Instance || !Provider) throw new Error('Modules not loaded');

		const providers = await Instance.provide({
			directory: input.directory,
			fn: () => Provider!.list(),
		});

		return Object.entries(providers).map(([id, info]) => ({
			id,
			name: info.name,
			models: info.models,
		}));
	}

	async configGet(input: { directory: string }): Promise<ServerConfig> {
		this._assertInitialized();
		if (!Instance || !Config) throw new Error('Modules not loaded');

		const config = await Instance.provide({
			directory: input.directory,
			fn: () => Config!.get(),
		});

		return config as ServerConfig;
	}

	async configUpdate(input: { directory: string; config: Partial<ServerConfig> }): Promise<ServerConfig> {
		this._assertInitialized();
		if (!Instance || !Config) throw new Error('Modules not loaded');

		const updated = await Instance.provide({
			directory: input.directory,
			fn: () => Config!.update(input.config as Parameters<typeof Config!['update']>[0]),
		});

		return updated as ServerConfig;
	}

	async instanceDispose(input: { directory: string }): Promise<void> {
		this._assertInitialized();
		if (!Instance) throw new Error('Modules not loaded');

		await Instance.provide({
			directory: input.directory,
			fn: () => Instance!.dispose(),
		});
	}

	async dispose(): Promise<void> {
		// Unsubscribe from all event listeners
		for (const unsub of this._eventUnsubscribers) {
			unsub();
		}
		this._eventUnsubscribers.length = 0;

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
