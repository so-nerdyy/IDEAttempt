import * as path from "path"
import * as fs from "fs"
import * as ignore from "ignore"

export class FileIgnoreController {
  private ig: ReturnType<typeof ignore.default>
  private _workspaceDir: string

  constructor(workspaceDir: string) {
    this._workspaceDir = workspaceDir
    this.ig = ignore.default()
  }

  async initialize(): Promise<void> {
    const gitignorePath = path.join(this._workspaceDir, ".gitignore")
    if (fs.existsSync(gitignorePath)) {
      const gitignoreContent = fs.readFileSync(gitignorePath, "utf-8")
      this.ig.add(gitignoreContent)
    }
  }

  isIgnored(filePath: string): boolean {
    const relativePath = path.relative(this._workspaceDir, filePath)
    return this.ig.ignores(relativePath)
  }

  validateAccess(filePath: string): boolean {
    return !this.isIgnored(filePath)
  }

  getWorkspaceDir(): string {
    return this._workspaceDir
  }

  dispose(): void {
    // Cleanup
  }
}
