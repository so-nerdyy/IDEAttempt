import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';

export interface ServerInfo {
  port: number;
}

export class ServerManager {
  private process: cp.ChildProcess | null = null;
  private context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  async start(workspaceDir: string): Promise<ServerInfo> {
    const binaryPath = this.findBinary();
    if (!binaryPath) {
      throw new Error('Kilo binary not found');
    }

    const password = crypto.randomUUID();

    return new Promise((resolve, reject) => {
      const env = {
        ...process.env,
        KILO_SERVER_PASSWORD: password,
      };

      this.process = cp.spawn(binaryPath, ['serve', '--port', '0'], {
        cwd: workspaceDir,
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });

      let output = '';

      this.process.stdout?.on('data', (data: Buffer) => {
        output += data.toString();
        const portMatch = output.match(/port[:\s]+(\d+)/i);
        if (portMatch) {
          const port = parseInt(portMatch[1], 10);
          resolve({ port });
        }
      });

      this.process.stderr?.on('data', (data: Buffer) => {
        console.error('[KiloCode Server]', data.toString());
      });

      this.process.on('error', (error) => {
        reject(error);
      });

      this.process.on('exit', (code) => {
        if (code !== 0 && code !== null) {
          reject(new Error(`Kilo server exited with code ${code}`));
        }
      });

      setTimeout(() => {
        reject(new Error('Timeout waiting for Kilo server to start'));
      }, 30000);
    });
  }

  stop(): void {
    if (this.process) {
      this.process.kill('SIGTERM');
      this.process = null;
    }
  }

  private findBinary(): string | null {
    const extensionPath = this.context.extensionPath;
    const candidates = [
      path.join(extensionPath, 'bin', 'kilo'),
      path.join(extensionPath, 'bin', 'kilo.exe'),
    ];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }

    try {
      const which = cp.execSync('which kilo', { encoding: 'utf-8' }).trim();
      if (which) {
        return which;
      }
    } catch {
      // Not found in PATH
    }

    return null;
  }
}
