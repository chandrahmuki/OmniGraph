# OmniGraph VS Code Extension

**Interactive knowledge graph for your codebase** — right in your editor.

## Features

### 🕸️ Dependency Graph Visualization
- View interactive D3.js force-directed graph of your entire codebase
- See dependencies, imports, and relationships at a glance
- Zoom, pan, and search nodes

### 🔍 Pre-edit Check
Right-click any file → **"OmniGraph: Pre-edit Check"**
- See what this file depends on
- See what depends on this file (blast radius)
- View related errors, issues, and lessons
- Risk assessment (LOW/MEDIUM/HIGH)

### 💥 Impact Analysis
Right-click any file → **"OmniGraph: Impact Analysis"**
- Transitive dependency analysis
- See all files affected by changing this one
- Depth-layered visualization
- Essential for refactoring decisions

### 🔎 Semantic Search
Command Palette → **"OmniGraph: Search Codebase"**
- Natural language search
- Find functions, classes, concepts
- Jump directly to results

## Installation

### Prerequisites
1. Install OmniGraph CLI:
   ```bash
   git clone https://github.com/chandrahmuki/OmniGraph.git ~/.local/share/omnigraph
   ln -s ~/.local/share/omnigraph/omnigraph.ts ~/.local/bin/omnigraph
   omnigraph --help  # Verify installation
   ```

2. Build graph in your project:
   ```bash
   cd your-project
   omnigraph build
   ```

### Install Extension
1. Download this extension folder
2. In VS Code: `Extensions` → `...` → `Install from VSIX...`
3. Or run: `code --install-extension omnigraph.vsix`

## Usage

### Commands

| Command | Palette Name | Description |
|---------|-------------|-------------|
| `omnigraph.showGraph` | OmniGraph: Show Dependency Graph | Open interactive graph panel |
| `omnigraph.checkFile` | OmniGraph: Pre-edit Check | Check a file before editing |
| `omnigraph.impactAnalysis` | OmniGraph: Impact Analysis | See blast radius of changes |
| `omnigraph.searchCodebase` | OmniGraph: Search Codebase | Semantic search |

### Context Menu
Right-click any file in Explorer:
- **OmniGraph: Pre-edit Check** — Quick context before editing
- **OmniGraph: Impact Analysis** — See what will break

### Keyboard Shortcuts
Add to `keybindings.json`:
```json
[
  {
    "key": "ctrl+shift+g",
    "command": "omnigraph.showGraph"
  },
  {
    "key": "ctrl+shift+i",
    "command": "omnigraph.impactAnalysis",
    "when": "editorTextFocus"
  }
]
```

## Development

### Build
```bash
cd vscode-extension
npm install
npm run compile
```

### Debug
1. Open `vscode-extension` in VS Code
2. Press `F5` to launch Extension Development Host
3. Test commands in the new window

### Package
```bash
npm install -g vsce
vsce package
```

## Roadmap

- [ ] Inline graph hover (file → mini graph)
- [ ] AI Chat integration (RAG over graph)
- [ ] Real-time graph updates on file save
- [ ] Team collaboration (shared graphs)
- [ ] Custom themes

## License

MIT
