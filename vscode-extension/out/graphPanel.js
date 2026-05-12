"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.GraphPanel = void 0;
const vscode = __importStar(require("vscode"));
class GraphPanel {
    static currentPanel;
    static viewType = 'omnigraphGraph';
    panel;
    extensionUri;
    _disposables = [];
    static createOrShow(extensionUri) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;
        if (GraphPanel.currentPanel) {
            GraphPanel.currentPanel.panel.reveal(column);
            return;
        }
        const panel = vscode.window.createWebviewPanel(GraphPanel.viewType, 'OmniGraph Dependency Graph', column || vscode.ViewColumn.One, {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')],
            retainContextWhenHidden: true
        });
        GraphPanel.currentPanel = new GraphPanel(panel, extensionUri);
    }
    static revive(panel, extensionUri) {
        GraphPanel.currentPanel = new GraphPanel(panel, extensionUri);
    }
    constructor(panel, extensionUri) {
        this.panel = panel;
        this.extensionUri = extensionUri;
        this.panel.webview.html = this.getHtmlForWebview();
        this.panel.onDidDispose(() => this.dispose(), null, this._disposables);
    }
    getHtmlForWebview() {
        return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OmniGraph</title>
  <style>
    body { 
      margin: 0; 
      padding: 20px; 
      font-family: var(--vscode-font-family);
      background: var(--vscode-editor-background);
    }
    .container { text-align: center; padding: 40px; }
    h1 { color: var(--vscode-foreground); }
    .btn {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      padding: 12px 24px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
      margin: 10px;
    }
    .btn:hover { opacity: 0.9; }
    .info { 
      margin-top: 30px; 
      color: var(--vscode-descriptionForeground);
      max-width: 600px;
      margin-left: auto;
      margin-right: auto;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🕸️ OmniGraph Dependency Graph</h1>
    
    <p>Interactive visualization of your codebase dependencies</p>
    
    <button class="btn" onclick="openGraph()">Open Full Graph</button>
    <button class="btn" onclick="refreshGraph()">Refresh</button>
    
    <div class="info">
      <h3>Quick Actions</h3>
      <ul style="text-align: left;">
        <li><strong>Right-click a file</strong> → "OmniGraph: Pre-edit Check"</li>
        <li><strong>Right-click a file</strong> → "OmniGraph: Impact Analysis"</li>
        <li><strong>Command Palette</strong> → "OmniGraph: Search Codebase"</li>
      </ul>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    
    function openGraph() {
      vscode.postMessage({ command: 'openGraph' });
    }
    
    function refreshGraph() {
      vscode.postMessage({ command: 'refresh' });
    }
    
    window.addEventListener('message', event => {
      const message = event.data;
      if (message.command === 'graphLoaded') {
        console.log('Graph loaded successfully');
      }
    });
  </script>
</body>
</html>`;
    }
    dispose() {
        GraphPanel.currentPanel = undefined;
        this.panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x)
                x.dispose();
        }
    }
}
exports.GraphPanel = GraphPanel;
//# sourceMappingURL=graphPanel.js.map