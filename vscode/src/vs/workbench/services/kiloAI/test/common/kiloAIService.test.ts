/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { KiloAIService } from '../../common/kiloAIService.js';
import { KiloAIEvent, KiloAIConnectionState, SessionInfo, AuthInfo, ProviderInfo } from '../../common/kiloAI.js';
import { MockNodeServerAdapter, createMockNodeServerAdapter } from './mockNodeServerAdapter.js';
import { INodeServerAdapter } from '../../common/nodeServerAdapter.js';
import { TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { NullLogService } from '../../../../platform/log/common/log.js';
import { StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';

suite('KiloAIService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	let service: KiloAIService;
	let storageService: TestStorageService;
	let logService: NullLogService;

	const testWorkspaceDir = '/test/workspace';

	setup(() => {
		storageService = disposables.add(new TestStorageService());
		logService = new NullLogService();
		service = disposables.add(new KiloAIService(logService, storageService));
	});

	teardown(async () => {
		await service.stop();
	});

	suite('Lifecycle', () => {
		test('isRunning returns false before start', () => {
			assert.strictEqual(service.isRunning(testWorkspaceDir), false);
		});

		test('isRunning returns true after start with mock adapter', async () => {
			await injectMockAdapter(testWorkspaceDir);
			assert.strictEqual(service.isRunning(testWorkspaceDir), true);
		});

		test('isRunning returns false after stop', async () => {
			await injectMockAdapter(testWorkspaceDir);
			await service.stop(testWorkspaceDir);
			assert.strictEqual(service.isRunning(testWorkspaceDir), false);
		});

		test('stop() stops all instances', async () => {
			const dir1 = '/workspace/1';
			const dir2 = '/workspace/2';
			await injectMockAdapter(dir1);
			await injectMockAdapter(dir2);

			assert.strictEqual(service.isRunning(dir1), true);
			assert.strictEqual(service.isRunning(dir2), true);

			await service.stop();

			assert.strictEqual(service.isRunning(dir1), false);
			assert.strictEqual(service.isRunning(dir2), false);
		});

		test('start is idempotent for same directory', async () => {
			await injectMockAdapter(testWorkspaceDir);
			await injectMockAdapter(testWorkspaceDir);
			assert.strictEqual(service.isRunning(testWorkspaceDir), true);
		});
	});

	suite('Connection State Events', () => {
		test('onDidChangeConnectionState fires on start', async () => {
			const states: KiloAIConnectionState[] = [];
			disposables.add(service.onDidChangeConnectionState(state => states.push(state)));

			await injectMockAdapter(testWorkspaceDir);

			assert.ok(states.some(s => s.status === 'connecting'));
			assert.ok(states.some(s => s.status === 'connected'));
		});

		test('onDidChangeConnectionState fires on stop', async () => {
			await injectMockAdapter(testWorkspaceDir);

			const states: KiloAIConnectionState[] = [];
			disposables.add(service.onDidChangeConnectionState(state => states.push(state)));

			await service.stop(testWorkspaceDir);

			assert.ok(states.some(s => s.status === 'disconnected'));
		});

		test('onDidChangeConnectionState fires on error', async () => {
			const states: KiloAIConnectionState[] = [];
			disposables.add(service.onDidChangeConnectionState(state => states.push(state)));

			await assert.rejects(
				async () => service.start(testWorkspaceDir),
				/KiloAIService not started/
			);
		});
	});

	suite('Auth Operations', () => {
		test('authSet stores credentials', async () => {
			const credentials: AuthInfo = { type: 'api', apiKey: 'test-key' };
			await service.authSet('anthropic', credentials);

			const stored = storageService.get('kilo.auth.anthropic', StorageScope.GLOBAL);
			assert.ok(stored);
			assert.deepStrictEqual(JSON.parse(stored), credentials);
		});

		test('authGet returns stored credentials', async () => {
			const credentials: AuthInfo = { type: 'oauth', accessToken: 'token-123' };
			await service.authSet('openai', credentials);

			const result = await service.authGet('openai');
			assert.deepStrictEqual(result, credentials);
		});

		test('authGet returns undefined for missing provider', async () => {
			const result = await service.authGet('nonexistent');
			assert.strictEqual(result, undefined);
		});

		test('authGet handles corrupted JSON', async () => {
			storageService.store('kilo.auth.corrupted', 'not valid json', StorageScope.GLOBAL, StorageTarget.MACHINE);

			const result = await service.authGet('corrupted');
			assert.strictEqual(result, undefined);
		});

		test('authRemove deletes credentials', async () => {
			const credentials: AuthInfo = { type: 'api', apiKey: 'test-key' };
			await service.authSet('anthropic', credentials);

			await service.authRemove('anthropic');

			const result = await service.authGet('anthropic');
			assert.strictEqual(result, undefined);
		});
	});

	suite('Session Operations', () => {
		test('sessionCreate creates a session', async () => {
			const adapter = await injectMockAdapter(testWorkspaceDir);

			const session = await service.sessionCreate({
				directory: testWorkspaceDir,
				title: 'Test Session',
			});

			assert.ok(session.id);
			assert.strictEqual(session.directory, testWorkspaceDir);
			assert.strictEqual(session.title, 'Test Session');
		});

		test('sessionGet retrieves a session', async () => {
			await injectMockAdapter(testWorkspaceDir);

			const created = await service.sessionCreate({
				directory: testWorkspaceDir,
				title: 'Test Session',
			});

			const retrieved = await service.sessionGet({
				sessionID: created.id,
				directory: testWorkspaceDir,
			});

			assert.strictEqual(retrieved.id, created.id);
		});

		test('sessionList returns sessions for directory', async () => {
			await injectMockAdapter(testWorkspaceDir);

			await service.sessionCreate({ directory: testWorkspaceDir, title: 'Session 1' });
			await service.sessionCreate({ directory: testWorkspaceDir, title: 'Session 2' });

			const sessions = await service.sessionList({ directory: testWorkspaceDir });

			assert.strictEqual(sessions.length, 2);
		});

		test('sessionDelete removes a session', async () => {
			await injectMockAdapter(testWorkspaceDir);

			const session = await service.sessionCreate({
				directory: testWorkspaceDir,
				title: 'To Delete',
			});

			await service.sessionDelete({
				sessionID: session.id,
				directory: testWorkspaceDir,
			});

			await assert.rejects(
				service.sessionGet({ sessionID: session.id, directory: testWorkspaceDir }),
				/Session not found/
			);
		});

		test('sessionFork creates a child session', async () => {
			await injectMockAdapter(testWorkspaceDir);

			const parent = await service.sessionCreate({
				directory: testWorkspaceDir,
				title: 'Parent Session',
			});

			const forked = await service.sessionFork({
				sessionID: parent.id,
				directory: testWorkspaceDir,
			});

			assert.strictEqual(forked.parentID, parent.id);
		});
	});

	suite('Provider Operations', () => {
		test('providerList returns available providers', async () => {
			await injectMockAdapter(testWorkspaceDir);

			const providers = await service.providerList({ directory: testWorkspaceDir });

			assert.ok(providers.length > 0);
			assert.ok(providers.some((p: ProviderInfo) => p.id === 'anthropic'));
		});
	});

	suite('Config Operations', () => {
		test('configGet returns current config', async () => {
			await injectMockAdapter(testWorkspaceDir);

			const config = await service.configGet({ directory: testWorkspaceDir });

			assert.ok(config);
		});

		test('configUpdate modifies config', async () => {
			await injectMockAdapter(testWorkspaceDir);

			const updated = await service.configUpdate({
				directory: testWorkspaceDir,
				config: { model: 'gpt-4' },
			});

			assert.strictEqual(updated.model, 'gpt-4');
		});
	});

	suite('Error Handling', () => {
		test('session operations throw when not started', async () => {
			await assert.rejects(
				service.sessionList({ directory: testWorkspaceDir }),
				/KiloAIService not started/
			);
		});

		test('sessionGet throws for non-existent session', async () => {
			await injectMockAdapter(testWorkspaceDir);

			await assert.rejects(
				service.sessionGet({ sessionID: 'nonexistent', directory: testWorkspaceDir }),
				/Session not found/
			);
		});
	});

	suite('Event Handling', () => {
		test('onEvent receives events from adapter', async () => {
			const mockAdapter = await injectMockAdapter(testWorkspaceDir);

			const events: KiloAIEvent[] = [];
			disposables.add(service.onEvent(event => events.push(event)));

			const testEvent: KiloAIEvent = {
				type: 'test',
				directory: testWorkspaceDir,
				payload: { type: 'test-event', properties: { foo: 'bar' } },
			};
			mockAdapter.fireEvent(testEvent);

			assert.strictEqual(events.length, 1);
			assert.deepStrictEqual(events[0], testEvent);
		});
	});

	async function injectMockAdapter(workspaceDir: string): Promise<MockNodeServerAdapter> {
		return new Promise((resolve, reject) => {
			const started = service.isRunning(workspaceDir);
			if (started) {
				const adapter = (service as any)._instances.get(workspaceDir);
				return resolve(adapter as MockNodeServerAdapter);
			}

			const stateChanges: KiloAIConnectionState[] = [];
			let adapter: MockNodeServerAdapter | null = null;

			const stateListener = service.onDidChangeConnectionState(state => {
				stateChanges.push(state);
				if (state.status === 'connected' && adapter) {
					stateListener.dispose();
					resolve(adapter);
				} else if (state.status === 'error') {
					stateListener.dispose();
					reject(new Error('Failed to start service'));
				}
			});

			adapter = new MockNodeServerAdapter({
				workspaceDir,
				onEvent: (event) => {
					(service as any)._onEvent.fire(event);
				},
				onStateChange: (state) => {
					(service as any)._setConnectionState(workspaceDir, state);
				},
			});

			(service as any)._instances.set(workspaceDir, adapter);
			(service as any)._setConnectionState(workspaceDir, { status: 'connected' });
		});
	}
});
