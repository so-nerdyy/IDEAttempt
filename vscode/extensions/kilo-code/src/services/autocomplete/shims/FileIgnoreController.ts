import ignore from "ignore"
import * as path from "path"
import * as fs from "fs"

const SENSITIVE_PATTERNS = [".env", ".env.*", ".env.*.*"]

export class FileIgnoreController {
  private ig: ReturnType<typeof ignore> | null = null
  private workspacePath: string
  private initialized = false

  constructor(workspacePath: string) {
    this.workspacePath = workspacePath
  }

  async initialize(): Promise<void> {
    if (this.initialized) return

    this.ig = ignore()

    if (!this.workspacePath) {
      this.initialized = true
      return
    }

    const kilocodeignorePath = path.join(this.workspacePath, ".kilocodeignore")
    const gitignorePath = path.join(this.workspacePath, ".gitignore")

    if (fs.existsSync(kilocodeignorePath)) {
      const patterns = fs.readFileSync(kilocodeignorePath, "utf8")
      this.ig.add(patterns)
    } else if (fs.existsSync(gitignorePath)) {
      const patterns = fs.readFileSync(gitignorePath, "utf8")
      this.ig.add(patterns)
      SENSITIVE_PATTERNS.forEach((p) => this.ig!.add(p))
    } else {
      SENSITIVE_PATTERNS.forEach((p) => this.ig!.add(p))
    }

    this.initialized = true
  }

  validateAccess(filePath: string): boolean {
    if (!this.workspacePath || !this.ig) {
      return false
    }

    let relativePath = filePath
    if (path.isAbsolute(filePath)) {
      try {
        relativePath = path.relative(this.workspacePath, filePath)
      } catch {
        return false
      }
    }

    if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
      return false
    }

    try {
      return !this.ig.ignores(relativePath)
    } catch {
      return false
    }
  }

  getInstructions(): string {
    if (!this.workspacePath) return ""
    const kilocodeignorePath = path.join(this.workspacePath, ".kilocodeignore")
    if (fs.existsSync(kilocodeignorePath)) {
      return ".kilocodeignore"
    }
    return ".gitignore"
  }

  filterPaths(paths: string[]): string[] {
    if (!this.workspacePath || !this.ig) {
      return []
    }
    return paths.filter((p) => this.validateAccess(p))
  }

  dispose(): void {
    this.ig = null
    this.initialized = false
  }
}
