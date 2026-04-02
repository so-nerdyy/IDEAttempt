/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { INodeServerAdapter } from '../../common/nodeServerAdapter.js';
import { SessionInfo, MessageWithParts, MessagePart, PromptInput, PromptPart, ProviderInfo, ServerConfig, KiloAIEvent, KiloAIConnectionState } from '../../common/kiloAI.js';

export interface MockNodeServerAdapterOptions {
	workspaceDir: string;
	onEvent: (event: KiloAIEvent) => void;
	onStateChange: (state: KiloAIConnectionState) => void;
	sessions?: Map<string, SessionInfo>;
	providers?: ProviderInfo[];
	config?: ServerConfig;
}

export class MockNodeServerAdapter extends Disposable implements INodeServerAdapter {
	private _initialized = true;
	private readonly _sessions: Map<string, SessionInfo>;
	private readonly _messages: Map<string, MessageWithParts[]>;
	private readonly _providers: ProviderInfo[];
	private readonly _config: ServerConfig;

	constructor(private readonly _options: MockNodeServerAdapterOptions) {
		super();
		this._sessions = _options.sessions ?? new Map();
		this._messages = new Map();
		this._providers = _options.providers ?? [
			{ id: 'anthropic', name: 'Anthropic', models: ['claude-3-opus', 'claude-3-sonnet'] },
			{ id: 'openai', name: 'OpenAI', models: ['gpt-4', 'gpt-3.5-turbo'] },
		];
		this._config = _options.config ?? { model: 'claude-3-opus' };
		_options.onStateChange({ status: 'connected' });
	}

	async sessionCreate(input: { directory: string; parentID?: string; title?: string }): Promise<SessionInfo> {
		const id = `session-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
		const session: SessionInfo = {
			id,
			projectID: `project-${input.directory}`,
			directory: input.directory,
			parentID: input.parentID,
			title: input.title ?? 'New Session',
			version: '1.0.0',
			time: {
				created: Date.now(),
				updated: Date.now(),
			},
		};
		this._sessions.set(id, session);
		this._messages.set(id, []);
		return session;
	}

	async sessionGet(input: { sessionID: string; directory: string }): Promise<SessionInfo> {
		const session = this._sessions.get(input.sessionID);
		if (!session) {
			throw new Error(`Session not found: ${input.sessionID}`);
		}
		return session;
	}

	async sessionList(input: { directory: string }): Promise<SessionInfo[]> {
		return Array.from(this._sessions.values()).filter(s => s.directory === input.directory);
	}

	async sessionDelete(input: { sessionID: string; directory: string }): Promise<void> {
		if (!this._sessions.has(input.sessionID)) {
			throw new Error(`Session not found: ${input.sessionID}`);
		}
		this._sessions.delete(input.sessionID);
		this._messages.delete(input.sessionID);
	}

	async sessionFork(input: { sessionID: string; messageID?: string; directory: string }): Promise<SessionInfo> {
		const parent = this._sessions.get(input.sessionID);
		if (!parent) {
			throw new Error(`Session not found: ${input.sessionID}`);
		}
		return this.sessionCreate({
			directory: input.directory,
			parentID: input.sessionID,
			title: `Fork of ${parent.title}`,
		});
	}

	async sessionAbort(input: { sessionID: string; directory: string }): Promise<void> {
		if (!this._sessions.has(input.sessionID)) {
			throw new Error(`Session not found: ${input.sessionID}`);
		}
	}

	async sessionMessages(input: { sessionID: string; directory: string; limit?: number }): Promise<MessageWithParts[]> {
		const messages = this._messages.get(input.sessionID) ?? [];
		if (input.limit) {
			return messages.slice(-input.limit);
		}
		return messages;
	}

	async sessionPrompt(input: PromptInput): Promise<AsyncIterableIterator<MessagePart>> {
		const session = this._sessions.get(input.sessionID);
		if (!session) {
			throw new Error(`Session not found: ${input.sessionID}`);
		}

		const userMessage: MessageWithParts = {
			id: `msg-${Date.now()}`,
			sessionID: input.sessionID,
			role: 'user',
			time: { created: Date.now() },
			parts: input.parts.map((part, idx) => ({
				id: `part-${Date.now()}-${idx}`,
				messageID: `msg-${Date.now()}`,
				sessionID: input.sessionID,
				type: part.type,
				content: part.type === 'text' ? part.text : undefined,
			})),
		};

		const assistantMessage: MessageWithParts = {
			id: `msg-${Date.now() + 1}`,
			sessionID: input.sessionID,
			role: 'assistant',
			time: { created: Date.now(), completed: Date.now() + 100 },
			parts: [{
				id: `part-${Date.now() + 1}`,
				messageID: `msg-${Date.now() + 1}`,
				sessionID: input.sessionID,
				type: 'text',
				content: 'Mock AI response',
			}],
		};

		this._messages.get(input.sessionID)?.push(userMessage, assistantMessage);

		const parts = assistantMessage.parts;
		return (async function* (): AsyncIterableIterator<MessagePart> {
			for (const part of parts) {
				yield part;
			}
		})();
	}

	async sessionPromptAsync(input: { sessionID: string; directory: string; parts: PromptPart[] }): Promise<void> {
		await this.sessionPrompt({
			sessionID: input.sessionID,
			directory: input.directory,
			parts: input.parts,
		});
	}

	async sessionCommand(input: { sessionID: string; directory: string; command: string }): Promise<void> {
		if (!this._sessions.has(input.sessionID)) {
			throw new Error(`Session not found: ${input.sessionID}`);
		}
	}

	async providerList(input: { directory: string }): Promise<ProviderInfo[]> {
		return this._providers;
	}

	async configGet(input: { directory: string }): Promise<ServerConfig> {
		return { ...this._config };
	}

	async configUpdate(input: { directory: string; config: Partial<ServerConfig> }): Promise<ServerConfig> {
		Object.assign(this._config, input.config);
		return { ...this._config };
	}

	async instanceDispose(input: { directory: string }): Promise<void> {
		this._initialized = false;
	}

	override async dispose(): Promise<void> {
		this._options.onStateChange({ status: 'disconnected' });
		this._initialized = false;
		super.dispose();
	}

	fireEvent(event: KiloAIEvent): void {
		this._options.onEvent(event);
	}
}

export function createMockNodeServerAdapter(options: MockNodeServerAdapterOptions): INodeServerAdapter {
	return new MockNodeServerAdapter(options);
}
