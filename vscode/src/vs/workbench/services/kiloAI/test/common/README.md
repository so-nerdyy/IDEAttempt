# KiloAI Service Tests

This directory contains unit tests for the KiloAI Service integration with VS Code.

## Test Structure

- `kiloAIService.test.ts` - Tests for the KiloAIService class covering lifecycle, session management, authentication, and event handling
- `mockNodeServerAdapter.ts` - Mock implementation of INodeServerAdapter for deterministic testing

## Running Tests

### Using the test runner script

```bash
./scripts/test-kiloai.sh
```

### Using the unit test runner directly

```bash
./scripts/test.sh --runGlob "**/kiloAI/**/*.test.js"
```

### Running specific tests

```bash
./scripts/test-kiloai.sh --grep "session operations"
```

## Test Coverage

The test suite covers:

1. **Lifecycle** - Service start, stop, and connection state management
2. **Auth Operations** - Credential storage and retrieval using VS Code SecretStorage
3. **Session Operations** - Create, get, list, delete, and fork sessions
4. **Provider Operations** - List available AI providers
5. **Config Operations** - Get and update configuration
6. **Event Handling** - SSE event reception and forwarding
7. **Error Handling** - Proper error states for invalid operations

## Mock Adapter

The `MockNodeServerAdapter` simulates the opencode CLI server behavior:

- Manages in-memory sessions and messages
- Simulates connection states
- Fires events that can be captured in tests
- Provides deterministic responses for testing

## CI Integration

Tests run automatically in CI when files in `src/vs/workbench/services/kiloAI/` are modified. See `.github/workflows/kiloai-tests.yml`.
