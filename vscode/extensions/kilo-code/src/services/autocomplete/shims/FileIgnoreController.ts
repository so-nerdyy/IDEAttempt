/**
 * Stub FileIgnoreController for the vscode extension.
 * The real implementation lives in kilocode/packages/kilo-vscode.
 * This stub denies all access by default.
 */
export class FileIgnoreController {
  private workspacePath: string

  constructor(workspacePath?: string) {
    this.workspacePath = workspacePath || ""
  }

  async initialize(): Promise<void> {
    // No-op for stub
  }

  validateAccess(_filePath: string): boolean {
    if (!this.workspacePath) {
      return false
    }
    return true
  }

  filterPaths(paths: string[]): string[] {
    if (!this.workspacePath) {
      return []
    }
    return paths
  }

  getInstructions(): string | undefined {
    return undefined
  }

  dispose(): void {
    // No-op for stub
  }
}
