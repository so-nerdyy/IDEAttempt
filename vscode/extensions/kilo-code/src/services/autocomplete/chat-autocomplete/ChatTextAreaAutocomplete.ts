import * as vscode from "vscode"
import type { KiloConnectionService } from "../../cli-backend"

interface ChatCompletionMessage {
  type: "requestChatCompletion"
  text: string
  requestId: string
}

interface ChatCompletionContext {
  postMessage: (msg: { type: "chatCompletionResult"; text: string; requestId: string }) => void
}

export class ChatTextAreaAutocomplete {
  private connectionService: KiloConnectionService
  public telemetry: { captureAcceptSuggestion: (length: number) => void }

  constructor(connectionService: KiloConnectionService) {
    this.connectionService = connectionService
    this.telemetry = {
      captureAcceptSuggestion: (_length: number) => {
        // Stub implementation
      },
    }
  }

  async handle(message: ChatCompletionMessage, context: ChatCompletionContext): Promise<void> {
    // Stub implementation
    context.postMessage({
      type: "chatCompletionResult",
      text: "",
      requestId: message.requestId,
    })
  }

  dispose(): void {
    // Cleanup
  }
}
