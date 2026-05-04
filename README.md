# OmniGraph

Knowledge graph tool for any project. Code, docs, stories — everything connected.

## Install

```bash
git clone https://github.com/chandrahmuki/OmniGraph.git ~/.local/share/omnigraph
ln -s ~/.local/share/omnigraph/omnigraph.ts ~/.local/bin/omnigraph
```

Requires [Bun](https://bun.sh).

## Usage

```bash
# In any project directory
omnigraph build        # Scan → build graph → generate HTML
omnigraph query foo    # Search nodes

# Open the visualization
open .omnigraph/index.html
```

## Features

- **Universal parsing** — regex extractors work with any language (JS, TS, Python, Nix, Rust, Go, C, ...)
- **Manual tags** — add relations inline: `# @omnigraph: link-to ./other.md`, `# @omnigraph: lesson "don't hardcode"`
- **Interactive web viz** — D3.js force-directed graph, search, filters by type, click for local graph
- **Zero API cost** — 100% offline, no LLM needed
- **SQLite backend** — fast, zero-config, file-based

## License

MIT
