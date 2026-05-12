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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const graphPanel_1 = require("./graphPanel");
const omnigraphService_1 = require("./omnigraphService");
function activate(context) {
    console.log('OmniGraph extension is now active');
    const omnigraphService = new omnigraphService_1.OmniGraphService();
    // Register commands
    const showGraphCommand = vscode.commands.registerCommand('omnigraph.showGraph', async () => {
        graphPanel_1.GraphPanel.createOrShow(context.extensionUri);
    });
    const checkFileCommand = vscode.commands.registerCommand('omnigraph.checkFile', async (uri) => {
        const filePath = uri.fsPath;
        await omnigraphService.checkFile(filePath);
    });
    const impactCommand = vscode.commands.registerCommand('omnigraph.impactAnalysis', async (uri) => {
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
        vscode.window.registerWebviewPanelSerializer(graphPanel_1.GraphPanel.viewType, {
            async deserializeWebviewPanel(webviewPanel, state) {
                graphPanel_1.GraphPanel.revive(webviewPanel, context.extensionUri);
            }
        });
    }
}
function deactivate() {
    console.log('OmniGraph extension is now deactivated');
}
//# sourceMappingURL=extension.js.map