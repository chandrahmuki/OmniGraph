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
const omnigraphService_1 = require("./omnigraphService");
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
        // Handle messages from webview
        this.panel.webview.onDidReceiveMessage(async (message) => {
            switch (message.command) {
                case 'loadGraph': {
                    const omnigraphService = new omnigraphService_1.OmniGraphService();
                    const data = await omnigraphService.getGraphData();
                    this.panel.webview.postMessage({ command: 'graphData', data });
                    break;
                }
                case 'refresh': {
                    const omnigraphService = new omnigraphService_1.OmniGraphService();
                    const data = await omnigraphService.getGraphData();
                    this.panel.webview.postMessage({ command: 'graphData', data });
                    break;
                }
                case 'nodeClick': {
                    const node = message.node;
                    this.panel.webview.postMessage({
                        command: 'nodeInfo',
                        data: {
                            label: node.label,
                            id: node.id,
                            type: node.type,
                            file_path: node.file_path,
                            deps: 0,
                            dependents: 0
                        }
                    });
                    break;
                }
            }
        }, undefined, this._disposables);
    }
    getHtmlForWebview() {
        const d3Uri = this.panel.webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'node_modules', 'd3', 'dist', 'd3.min.js'));
        return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OmniGraph</title>
  <script src="${d3Uri}"></script>
  <style>
    body { 
      margin: 0; 
      padding: 0; 
      font-family: var(--vscode-font-family);
      background: var(--vscode-editor-background);
      overflow: hidden;
    }
    #graph-container {
      width: 100vw;
      height: 100vh;
    }
    .controls {
      position: absolute;
      top: 10px;
      left: 10px;
      z-index: 100;
      background: var(--vscode-editor-background);
      padding: 10px;
      border-radius: 6px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    }
    .btn {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      padding: 8px 16px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 13px;
      margin: 4px;
    }
    .btn:hover { opacity: 0.9; }
    .search-box {
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
      padding: 8px;
      border-radius: 4px;
      width: 250px;
      margin: 4px;
    }
    .node-info {
      position: absolute;
      bottom: 10px;
      left: 10px;
      right: 10px;
      background: var(--vscode-editor-background);
      padding: 15px;
      border-radius: 6px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      display: none;
      max-height: 200px;
      overflow-y: auto;
    }
    .node-info h3 { margin: 0 0 10px 0; color: var(--vscode-foreground); }
    .node-info .detail { margin: 5px 0; color: var(--vscode-descriptionForeground); }
    .loading {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      text-align: center;
      color: var(--vscode-foreground);
    }
    .spinner {
      border: 3px solid var(--vscode-progressBar-background);
      border-top: 3px solid var(--vscode-button-background);
      border-radius: 50%;
      width: 40px;
      height: 40px;
      animation: spin 1s linear infinite;
      margin: 0 auto 10px;
    }
    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div id="graph-container"></div>
  
  <div class="controls">
    <input type="text" class="search-box" id="search" placeholder="Search nodes..." />
    <button class="btn" onclick="zoomIn()">+</button>
    <button class="btn" onclick="zoomOut()">−</button>
    <button class="btn" onclick="resetZoom()">Reset</button>
    <button class="btn" onclick="refreshGraph()">Refresh</button>
  </div>
  
  <div class="loading" id="loading">
    <div class="spinner"></div>
    <div>Loading graph...</div>
  </div>
  
  <div class="node-info" id="nodeInfo">
    <h3 id="nodeTitle"></h3>
    <div id="nodeDetails"></div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    let svg, simulation, nodes = [], links = [];
    let zoom = d3.zoom().on('zoom', (e) => svg.select('g').attr('transform', e.transform));
    
    // Load graph data
    vscode.postMessage({ command: 'loadGraph' });
    
    window.addEventListener('message', event => {
      const message = event.data;
      if (message.command === 'graphData') {
        renderGraph(message.data);
      } else if (message.command === 'nodeInfo') {
        showNodeInfo(message.data);
      }
    });
    
    function renderGraph(data) {
      document.getElementById('loading').style.display = 'none';
      
      const container = document.getElementById('graph-container');
      const width = container.clientWidth;
      const height = container.clientHeight;
      
      d3.select('#graph-container').selectAll('*').remove();
      
      svg = d3.select('#graph-container').append('svg')
        .attr('width', width)
        .attr('height', height)
        .call(zoom);
      
      const g = svg.append('g');
      
      nodes = data.nodes || [];
      links = data.links || [];
      
      const colorScale = d3.scaleOrdinal()
        .domain(['file', 'function', 'class', 'import', 'dependency'])
        .range(['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899']);
      
      // Add arrows
      g.append('defs').selectAll('marker')
        .data(['default'])
        .enter().append('marker')
        .attr('id', 'arrow')
        .attr('viewBox', '0 -5 10 10')
        .attr('refX', 20)
        .attr('refY', 0)
        .attr('markerWidth', 6)
        .attr('markerHeight', 6)
        .attr('orient', 'auto')
        .append('path')
        .attr('fill', '#888')
        .attr('d', 'M0,-5L10,0L0,5');
      
      // Draw links
      const link = g.selectAll('.link')
        .data(links)
        .enter().append('line')
        .attr('class', 'link')
        .attr('stroke', '#888')
        .attr('stroke-width', 1.5)
        .attr('marker-end', 'url(#arrow)');
      
      // Draw nodes
      const node = g.selectAll('.node')
        .data(nodes)
        .enter().append('g')
        .attr('class', 'node')
        .call(d3.drag()
          .on('start', dragstarted)
          .on('drag', dragged)
          .on('end', dragended));
      
      node.append('circle')
        .attr('r', 8)
        .attr('fill', d => colorScale(d.type) || '#666');
      
      node.append('text')
        .attr('dx', 12)
        .attr('dy', 4)
        .text(d => d.label || d.id)
        .style('font-size', '12px')
        .style('fill', 'var(--vscode-foreground)')
        .style('pointer-events', 'none');
      
      // Click handler
      node.on('click', (e, d) => {
        vscode.postMessage({ command: 'nodeClick', node: d });
      });
      
      // Simulation
      simulation = d3.forceSimulation(nodes)
        .force('charge', d3.forceManyBody().strength(-100))
        .force('center', d3.forceCenter(width / 2, height / 2))
        .force('link', d3.forceLink(links).id(d => d.id).distance(100))
        .on('tick', ticked);
      
      function ticked() {
        link
          .attr('x1', d => d.source.x)
          .attr('y1', d => d.source.y)
          .attr('x2', d => d.target.x)
          .attr('y2', d => d.target.y);
        
        node.attr('transform', d => \`translate(\${d.x},\${d.y})\`);
      }
      
      function dragstarted(e, d) {
        if (!e.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      }
      
      function dragged(e, d) {
        d.fx = e.x;
        d.fy = e.y;
        simulation.alpha(0.3).restart();
      }
      
      function dragended(e, d) {
        if (!e.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      }
      
      // Search
      document.getElementById('search').addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        if (!term) return;
        
        const match = nodes.find(n => 
          (n.label || n.id).toLowerCase().includes(term)
        );
        
        if (match) {
          svg.transition().duration(750).call(
            zoom.transform,
            d3.zoomIdentity.translate(match.x - width/2, match.y - height/2).scale(2)
          );
          
          d3.selectAll('.node')
            .select('circle')
            .attr('stroke', d => d === match ? '#f00' : null)
            .attr('stroke-width', d => d === match ? 3 : null);
          
          setTimeout(() => {
            d3.selectAll('.node').select('circle')
              .attr('stroke', null)
              .attr('stroke-width', null);
          }, 2000);
        }
      });
    }
    
    function showNodeInfo(data) {
      const info = document.getElementById('nodeInfo');
      document.getElementById('nodeTitle').textContent = data.label || data.id;
      document.getElementById('nodeDetails').innerHTML = \`
        <div class="detail"><strong>Type:</strong> \${data.type}</div>
        <div class="detail"><strong>File:</strong> \${data.file_path || 'N/A'}</div>
        <div class="detail"><strong>Dependencies:</strong> \${data.deps || 0}</div>
        <div class="detail"><strong>Dependents:</strong> \${data.dependents || 0}</div>
      \`;
      info.style.display = 'block';
    }
    
    function zoomIn() {
      svg.transition().duration(300).call(zoom.scaleBy, 1.3);
    }
    
    function zoomOut() {
      svg.transition().duration(300).call(zoom.scaleBy, 0.7);
    }
    
    function resetZoom() {
      svg.transition().duration(300).call(zoom.transform, d3.zoomIdentity);
    }
    
    function refreshGraph() {
      vscode.postMessage({ command: 'refresh' });
    }
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