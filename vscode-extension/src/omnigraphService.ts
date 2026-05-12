import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface CheckResult {
  file: string;
  type: string;
  risk: 'LOW' | 'MEDIUM' | 'HIGH';
  dependents: number;
  deps: { id: string; type: string }[];
  backlinks: { id: string; distance: number }[];
  errors: { id: string; label: string }[];
  issues: { id: string; label: string }[];
}

export interface SearchResult {
  id: string;
  type: string;
  label: string;
  file_path?: string;
}

export class OmniGraphService {
  private omnigraphPath = 'omnigraph';
  private projectRoot?: string;

  constructor() {
    this.detectProjectRoot();
  }

  private detectProjectRoot() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
      this.projectRoot = workspaceFolders[0].uri.fsPath;
    }
  }

  private async runOmnigraph(args: string[]): Promise<string> {
    if (!this.projectRoot) {
      throw new Error('No workspace folder open');
    }

    try {
      const { stdout, stderr } = await execAsync(
        `${this.omnigraphPath} ${args.join(' ')}`,
        { cwd: this.projectRoot }
      );
      
      if (stderr && !stderr.includes('Scanned') && !stderr.includes('Generating')) {
        console.warn('OmniGraph stderr:', stderr);
      }
      
      return stdout;
    } catch (error) {
      const err = error as { stderr?: string; message?: string };
      throw new Error(err.stderr || err.message || 'OmniGraph command failed');
    }
  }

  async checkFile(filePath: string): Promise<void> {
    try {
      const output = await this.runOmnigraph(['check', `"${filePath}"`, '--json']);
      const result: CheckResult = JSON.parse(output);

      const panel = vscode.window.createWebviewPanel(
        'omnigraphCheck',
        `Pre-edit Check: ${result.file}`,
        vscode.ViewColumn.Beside,
        { enableScripts: true }
      );

      panel.webview.html = this.renderCheckResult(result);
    } catch (error) {
      vscode.window.showErrorMessage(`Check failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async showImpact(filePath: string): Promise<void> {
    try {
      const output = await this.runOmnigraph(['impact', `"${filePath}"`, '--json']);
      const result = JSON.parse(output);

      const panel = vscode.window.createWebviewPanel(
        'omnigraphImpact',
        `Impact: ${filePath}`,
        vscode.ViewColumn.Beside,
        { enableScripts: true }
      );

      panel.webview.html = this.renderImpactResult(result);
    } catch (error) {
      vscode.window.showErrorMessage(`Impact analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async search(query: string): Promise<SearchResult[]> {
    try {
      const output = await this.runOmnigraph(['query', `"${query}"`]);
      // Parse the text output to extract results
      return this.parseSearchOutput(output);
    } catch (error) {
      vscode.window.showErrorMessage(`Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return [];
    }
  }

  async showSearchResults(results: SearchResult[]): Promise<void> {
    const quickPickItems = results.map(r => ({
      label: r.label,
      description: r.type,
      detail: r.file_path,
      result: r
    }));

    const selected = await vscode.window.showQuickPick(quickPickItems, {
      placeHolder: `Found ${results.length} results`,
      matchOnDescription: true,
      matchOnDetail: true
    });

    if (selected && selected.result.file_path) {
      const uri = vscode.Uri.file(selected.result.file_path);
      const doc = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(doc);
    }
  }

  private renderCheckResult(result: CheckResult): string {
    const riskColor = result.risk === 'HIGH' ? '#ef4444' : result.risk === 'MEDIUM' ? '#f59e0b' : '#22c55e';
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: var(--vscode-font-family); padding: 20px; }
          .header { display: flex; align-items: center; gap: 10px; margin-bottom: 20px; }
          .risk { padding: 4px 12px; border-radius: 4px; background: ${riskColor}; color: white; font-weight: bold; }
          .section { margin-bottom: 20px; }
          .section h3 { margin-bottom: 10px; color: var(--vscode-foreground); }
          .item { padding: 8px; margin: 4px 0; background: var(--vscode-editor-background); border-radius: 4px; }
          .error { border-left: 3px solid #ef4444; }
          .issue { border-left: 3px solid #f59e0b; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>${result.file}</h1>
          <span class="risk">${result.risk}</span>
        </div>
        
        <div class="section">
          <h3>Dependencies (${result.deps.length})</h3>
          ${result.deps.slice(0, 10).map(d => `<div class="item">→ ${d.id}</div>`).join('')}
        </div>
        
        <div class="section">
          <h3>Dependents (${result.dependents})</h3>
          ${result.backlinks.slice(0, 10).map(b => `<div class="item">← ${b.id}</div>`).join('')}
        </div>
        
        ${result.errors.length > 0 ? `
        <div class="section">
          <h3>⚠️ Errors (${result.errors.length})</h3>
          ${result.errors.map(e => `<div class="item error">${e.label}</div>`).join('')}
        </div>
        ` : ''}
        
        ${result.issues.length > 0 ? `
        <div class="section">
          <h3>⚠️ Issues (${result.issues.length})</h3>
          ${result.issues.map(i => `<div class="item issue">${i.label}</div>`).join('')}
        </div>
        ` : ''}
      </body>
      </html>
    `;
  }

  private renderImpactResult(result: any): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: var(--vscode-font-family); padding: 20px; }
          .header { margin-bottom: 20px; }
          .section { margin-bottom: 20px; }
          .section h3 { margin-bottom: 10px; }
          .item { padding: 8px; margin: 4px 0; background: var(--vscode-editor-background); border-radius: 4px; }
          .depth-1 { border-left: 3px solid #3b82f6; }
          .depth-2 { border-left: 3px solid #8b5cf6; }
          .depth-3 { border-left: 3px solid #ec4899; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Impact Analysis: ${result.target}</h1>
          <p>Total affected: ${result.total_affected} nodes</p>
        </div>
        
        <div class="section">
          <h3>Direct Dependents (${result.direct})</h3>
          ${result.backlinks.filter((b: any) => b.distance === 1).slice(0, 20).map((b: any) => 
            `<div class="item depth-1">${b.id}</div>`
          ).join('')}
        </div>
        
        ${result.transitive > 0 ? `
        <div class="section">
          <h3>Transitive Dependents (${result.transitive})</h3>
          ${result.backlinks.filter((b: any) => b.distance > 1).slice(0, 20).map((b: any) => 
            `<div class="item depth-${Math.min(b.distance, 3)}">${b.id} (depth ${b.distance})</div>`
          ).join('')}
        </div>
        ` : ''}
      </body>
      </html>
    `;
  }

  private parseSearchOutput(output: string): SearchResult[] {
    const results: SearchResult[] = [];
    const lines = output.split('\n');
    
    for (const line of lines) {
      const match = line.match(/\[(\w+)\]\s+(.+?)\s+\((.+)\)/);
      if (match) {
        results.push({
          type: match[1],
          label: match[2],
          id: match[3]
        });
      }
    }
    
    return results.slice(0, 20);
  }
}
