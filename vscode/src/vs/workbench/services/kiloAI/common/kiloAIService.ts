/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IKiloAIService, KiloAIEvent, KiloAIConnectionState, SessionInfo, MessageWithParts, PromptInput, PromptPart, AuthInfo, ProviderInfo, ServerConfig } from './kiloAI.js';
import { INodeServerAdapter } from './nodeServerAdapter.js';

// kilocode_change - new file

/**
 * KiloAIService runs the opencode CLI backend in-process within VS Code's extension host.
 *
 * Instead of spawning `kilo serve` as a child process and communicating via HTTP+SSE,
 * this service initializes the opencode server directly and exposes the same API surface
 * via direct method calls.
 *
 * Key adaptations from the Bun-based server:
 * - Uses @hono/node-server instead of Bun.serve
 * - Uses better-sqlite3 instead of bun:sqlite
 * - Uses VS Code SecretStorage for auth credentials
 * - Translates SSE events to VS Code Event/Emitter
 */
export class KiloAIService extends Disposable implements IKiloAIService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeConnectionState = this._register(new Emitter<KiloAIConnectionState>());
	readonly onDidChangeConnectionState: Event<KiloAIConnectionState> = this._onDidChangeConnectionState.event;

	private readonly _onEvent = this._register(new Emitter<KiloAIEvent>());
	readonly onEvent: Event<KiloAIEvent> = this._onEvent.event;

	private readonly _instances = new Map<string, INodeServerAdapter>();
	private readonly _connectionStates = new Map<string, KiloAIConnectionState>();

	constructor(
		@ILogService private readonly _logService: ILogService,
		@IStorageService private readonly _storageService: IStorageService,
	) {
		super();
		this._logService.info('[KiloAIService] Initialized');
	}

	async start(workspaceDir: string): Promise<void> {
		if (this._instances.has(workspaceDir)) {
			this._logService.info(`[KiloAIService] Already running for ${workspaceDir}`);
			return;
		}

		this._logService.info(`[KiloAIService] Starting for ${workspaceDir}`);
		this._setConnectionState(workspaceDir, { status: 'connecting' });

		try {
			// kilocode_change - Import the Node.js server adapter lazily to avoid
			// circular dependencies and allow the bundler to resolve paths correctly.
			const { createNodeServerAdapter } = await import('./nodeServerAdapter.js');

			const adapter = await createNodeServerAdapter({
				workspaceDir,
				onEvent: (event) => {
					this._onEvent.fire(event);
				},
				onStateChange: (state) => {
					this._setConnectionState(workspaceDir, state);
				},
			});

			this._instances.set(workspaceDir, adapter);
			this._logService.info(`[KiloAIService] Started successfully for ${workspaceDir}`);
		} catch (error) {
			this._logService.error(`[KiloAIService] Failed to start: ${error}`);
			this._setConnectionState(workspaceDir, {
				status: 'error',
				error: String(error),
			});
			throw error;
		}
	}

	async stop(workspaceDir?: string): Promise<void> {
		if (workspaceDir) {
			const instance = this._instances.get(workspaceDir);
			if (instance) {
				this._logService.info(`[KiloAIService] Stopping ${workspaceDir}`);
				await instance.dispose();
				this._instances.delete(workspaceDir);
				this._connectionStates.delete(workspaceDir);
			}
		} else {
			// Stop all instances
			const promises: Promise<void>[] = [];
			for (const [dir, instance] of this._instances) {
				promises.push(instance.dispose().then(() => {
					this._instances.delete(dir);
					this._connectionStates.delete(dir);
				}));
			}
			await Promise.all(promises);
			this._logService.info('[KiloAIService] All instances stopped');
		}
	}

	isRunning(workspaceDir: string): boolean {
		return this._instances.has(workspaceDir);
	}

	// --- Session operations ---

	async sessionCreate(input: { directory: string; parentID?: string; title?: string }): Promise<SessionInfo> {
		const adapter = this._getAdapter(input.directory);
		return adapter.sessionCreate(input);
	}

	async sessionGet(input: { sessionID: string; directory: string }): Promise<SessionInfo> {
		const adapter = this._getAdapter(input.directory);
		return adapter.sessionGet(input);
	}

	async sessionList(input: { directory: string }): Promise<SessionInfo[]> {
		const adapter = this._getAdapter(input.directory);
		return adapter.sessionList(input);
	}

	async sessionDelete(input: { sessionID: string; directory: string }): Promise<void> {
		const adapter = this._getAdapter(input.directory);
		return adapter.sessionDelete(input);
	}

	async sessionFork(input: { sessionID: string; messageID?: string; directory: string }): Promise<SessionInfo> {
		const adapter = this._getAdapter(input.directory);
		return adapter.sessionFork(input);
	}

	async sessionAbort(input: { sessionID: string; directory: string }): Promise<void> {
		const adapter = this._getAdapter(input.directory);
		return adapter.sessionAbort(input);
	}

	async sessionMessages(input: { sessionID: string; directory: string; limit?: number }): Promise<MessageWithParts[]> {
		const adapter = this._getAdapter(input.directory);
		return adapter.sessionMessages(input);
	}

	// --- Prompt operations ---

	async sessionPrompt(input: PromptInput): Promise<AsyncIterableIterator<MessagePart>> {
		const adapter = this._getAdapter(input.directory);
		return adapter.sessionPrompt(input);
	}

	async sessionPromptAsync(input: { sessionID: string; directory: string; parts: PromptPart[] }): Promise<void> {
		const adapter = this._getAdapter(input.directory);
		return adapter.sessionPromptAsync(input);
	}

	async sessionCommand(input: { sessionID: string; directory: string; command: string }): Promise<void> {
		const adapter = this._getAdapter(input.directory);
		return adapter.sessionCommand(input);
	}

	// --- Auth operations ---

	async authSet(providerID: string, credentials: AuthInfo): Promise<void> {
		const key = `kilo.auth.${providerID}`;
		await this._storageService.store(key, JSON.stringify(credentials), StorageScope.GLOBAL, StorageTarget.MACHINE);
	}

	async authGet(providerID: string): Promise<AuthInfo | undefined> {
		const key = `kilo.auth.${providerID}`;
		const raw = this._storageService.get(key, StorageScope.GLOBAL);
		if (!raw) {
			return undefined;
		}
		try {
			return JSON.parse(raw) as AuthInfo;
		} catch {
			return undefined;
		}
	}

	async authRemove(providerID: string): Promise<void> {
		const key = `kilo.auth.${providerID}`;
		this._storageService.remove(key, StorageScope.GLOBAL);
	}

	// --- Provider operations ---

	async providerList(input: { directory: string }): Promise<ProviderInfo[]> {
		const adapter = this._getAdapter(input.directory);
		return adapter.providerList(input);
	}

	// --- Config operations ---

	async configGet(input: { directory: string }): Promise<ServerConfig> {
		const adapter = this._getAdapter(input.directory);
		return adapter.configGet(input);
	}

	async configUpdate(input: { directory: string; config: Partial<ServerConfig> }): Promise<ServerConfig> {
		const adapter = this._getAdapter(input.directory);
		return adapter.configUpdate(input);
	}

	// --- Instance lifecycle ---

	async instanceDispose(input: { directory: string }): Promise<void> {
		const adapter = this._getAdapter(input.directory);
		return adapter.instanceDispose(input);
	}

	// --- Private helpers ---

	private _getAdapter(directory: string): INodeServerAdapter {
		const adapter = this._instances.get(directory);
		if (!adapter) {
			throw new Error(`KiloAIService not started for directory: ${directory}`);
		}
		return adapter;
	}

	private _setConnectionState(workspaceDir: string, state: KiloAIConnectionState): void {
		this._connectionStates.set(workspaceDir, state);
		this._onDidChangeConnectionState.fire(state);
	}

	override dispose(): void {
		this.stop();
		super.dispose();
	}
}

registerSingleton(IKiloAIService, KiloAIService, InstantiationType.Delayed);
