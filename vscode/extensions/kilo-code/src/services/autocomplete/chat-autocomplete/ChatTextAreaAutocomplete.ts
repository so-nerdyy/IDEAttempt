import type { KiloConnectionService } from "../../cli-backend"

/**
 * Stub ChatTextAreaAutocomplete for the vscode extension.
 * The real implementation lives in kilocode/packages/kilo-vscode.
 * This stub returns empty completions.
 */
export class ChatTextAreaAutocomplete {
  constructor(_connectionService: KiloConnectionService) {
    // No-op for stub
  }

  async handle(
    message: { type: string; text: string; requestId: string },
    sender: { postMessage: (msg: { type: string; text: string; requestId: string }) => void },
  ): Promise<void> {
    sender.postMessage({ type: "chatCompletionResult", text: "", requestId: message.requestId })
  }

  dispose(): void {
    // No-op for stub
  }
}
