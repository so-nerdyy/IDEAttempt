import type { KiloConnectionService } from "../../cli-backend"

export interface ChatCompletionRequestMessage {
  type: "requestChatCompletion"
  text?: string
  requestId?: string
}

export interface ChatCompletionResponseSender {
  postMessage(message: { type: "chatCompletionResult"; text: string; requestId: string }): void
}

export class ChatTextAreaAutocomplete {
  readonly telemetry = {
    captureSuggestionRequested: (_context: Record<string, unknown>) => {},
    captureAcceptSuggestion: (_length: number) => {},
  }

  constructor(private connectionService: KiloConnectionService) {}

  async handle(message: ChatCompletionRequestMessage, sender: ChatCompletionResponseSender): Promise<void> {
    const text = message.text || ""
    const requestId = message.requestId || ""
    if (!text || !requestId) return

    const { suggestion } = await this.getCompletion(text)
    sender.postMessage({ type: "chatCompletionResult", text: suggestion, requestId })
  }

  async getCompletion(_userText: string, _visibleCodeContext?: unknown): Promise<{ suggestion: string }> {
    return { suggestion: "" }
  }

  cleanSuggestion(_suggestion: string, _userText: string): string {
    return ""
  }

  dispose(): void {}
}
