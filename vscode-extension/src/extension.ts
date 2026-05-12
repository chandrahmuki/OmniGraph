import * as vscode from 'vscode';
import { GraphPanel } from './graphPanel';
import { OmniGraphService } from './omnigraphService';

export function activate(context: vscode.ExtensionContext) {
  console.log('OmniGraph extension is now active');

  const omnigraphService = new OmniGraphService();

  // Register commands
  const showGraphCommand = vscode.commands.registerCommand('omnigraph.showGraph', async () => {
    GraphPanel.createOrShow(context.extensionUri);
  });

  const checkFileCommand = vscode.commands.registerCommand('omnigraph.checkFile', async (uri: vscode.Uri) => {
    const filePath = uri.fsPath;
    await omnigraphService.checkFile(filePath);
  });

  const impactCommand = vscode.commands.registerCommand('omnigraph.impactAnalysis', async (uri: vscode.Uri) => {
    const filePath = uri.fsPath;
    await omnigraphService.showImpact(filePath);
  });

  const searchCommand = vscode.commands.registerCommand('omnigraph.searchCodebase', async () => {
    const query = await vscode.window.showInputBox({
      prompt: 'Search codebase...',
      placeHolder: 'e.g., auth handling, database connection'
    });
    
    if (query) {
      const results = await omnigraphService.search(query);
      await omnigraphService.showSearchResults(results);
    }
  });

  context.subscriptions.push(showGraphCommand, checkFileCommand, impactCommand, searchCommand);

  // Register webview panel serializer
  if (vscode.window.registerWebviewPanelSerializer) {
    vscode.window.registerWebviewPanelSerializer(GraphPanel.viewType, {
      async deserializeWebviewPanel(webviewPanel: vscode.WebviewPanel, state: any) {
        GraphPanel.revive(webviewPanel, context.extensionUri);
      }
    });
  }
}

export function deactivate() {
  console.log('OmniGraph extension is now deactivated');
}
