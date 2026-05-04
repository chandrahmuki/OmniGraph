import { GraphDB } from "/home/david/.local/share/omnigraph/db.ts";

export function buildHtml(dbPath: string, outputPath: string): void {
  const fs = require("node:fs");
  const db = new GraphDB(dbPath);

  const nodes = db.getAllNodes();
  const edges = db.getAllEdges();

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>OmniGraph</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0d1117;
      color: #c9d1d9;
      overflow: hidden;
    }
    #graph { width: 100vw; height: 100vh; }
    #search {
      position: absolute;
      top: 16px;
      left: 16px;
      z-index: 10;
    }
    #search input {
      background: #21262d;
      border: 1px solid #30363d;
      color: #c9d1d9;
      padding: 8px 12px;
      border-radius: 6px;
      width: 240px;
      font-size: 14px;
    }
    #search input:focus {
      outline: none;
      border-color: #58a6ff;
    }
    #filters {
      position: absolute;
      top: 16px;
      right: 16px;
      z-index: 10;
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      max-width: 300px;
      justify-content: flex-end;
    }
    .filter-btn {
      background: #21262d;
      border: 1px solid #30363d;
      color: #c9d1d9;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 12px;
      cursor: pointer;
      transition: all 0.2s;
    }
    .filter-btn:hover { border-color: #58a6ff; }
    .filter-btn.active { background: #1f6feb; border-color: #1f6feb; }
    #info {
      position: absolute;
      bottom: 16px;
      left: 16px;
      z-index: 10;
      background: rgba(13, 17, 23, 0.9);
      border: 1px solid #30363d;
      border-radius: 8px;
      padding: 12px;
      max-width: 320px;
      display: none;
    }
    #info h3 { font-size: 14px; margin-bottom: 8px; color: #f0f6fc; }
    #info p { font-size: 12px; color: #8b949e; margin: 4px 0; }
    #info .tag {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      margin-top: 4px;
    }
    #stats {
      position: absolute;
      bottom: 16px;
      right: 16px;
      z-index: 10;
      font-size: 12px;
      color: #8b949e;
    }
  </style>
</head>
<body>
  <div id="search"><input type="text" id="searchInput" placeholder="Rechercher..."></div>
  <div id="filters"></div>
  <div id="info">
    <h3 id="infoTitle"></h3>
    <p id="infoType"></p>
    <p id="infoPath"></p>
    <div id="infoTags"></div>
  </div>
  <div id="stats"></div>
  <svg id="graph"></svg>

  <script src="https://d3js.org/d3.v7.min.js"></script>
  <script>
    const nodes = ${JSON.stringify(nodes)};
    const edges = ${JSON.stringify(edges)};
    const colors = {
      file: '#3b82f6', module: '#6366f1', function: '#10b981',
      import: '#f59e0b', error: '#ef4444', lesson: '#22c55e',
      concept: '#a855f7', tag: '#ec4899'
    };

    const width = window.innerWidth;
    const height = window.innerHeight;

    const svg = d3.select('#graph')
      .attr('width', width)
      .attr('height', height);

    const g = svg.append('g');

    const zoom = d3.zoom()
      .scaleExtent([0.1, 4])
      .on('zoom', (e) => g.attr('transform', e.transform));
    svg.call(zoom);

    const simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(edges).id(d => d.id).distance(100))
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(d => Math.sqrt((d.connections || 1)) * 8 + 10));

    // Compter connexions
    nodes.forEach(n => {
      n.connections = edges.filter(e => e.from_id === n.id || e.to_id === n.id).length;
    });

    const link = g.append('g')
      .selectAll('line')
      .data(edges)
      .join('line')
      .attr('stroke', '#30363d')
      .attr('stroke-width', 1.5)
      .attr('opacity', 0.6);

    const node = g.append('g')
      .selectAll('circle')
      .data(nodes)
      .join('circle')
      .attr('r', d => Math.sqrt(d.connections || 1) * 5 + 4)
      .attr('fill', d => colors[d.type] || '#8b949e')
      .attr('stroke', '#0d1117')
      .attr('stroke-width', 2)
      .style('cursor', 'pointer')
      .call(d3.drag()
        .on('start', (e, d) => { if (!e.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
        .on('drag', (e, d) => { d.fx = e.x; d.fy = e.y; })
        .on('end', (e, d) => { if (!e.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; }));

    const label = g.append('g')
      .selectAll('text')
      .data(nodes.filter(d => d.connections > 1))
      .join('text')
      .text(d => d.label.length > 20 ? d.label.slice(0, 20) + '...' : d.label)
      .attr('font-size', 10)
      .attr('fill', '#c9d1d9')
      .attr('dx', 8)
      .attr('dy', 3);

    // Filtres
    const types = [...new Set(nodes.map(n => n.type))];
    const activeFilters = new Set(types);
    const filterContainer = d3.select('#filters');

    filterContainer.selectAll('.filter-btn')
      .data(types)
      .join('button')
      .attr('class', 'filter-btn active')
      .style('border-color', d => colors[d] || '#30363d')
      .text(d => d)
      .on('click', function(e, d) {
        if (activeFilters.has(d)) activeFilters.delete(d);
        else activeFilters.add(d);
        d3.select(this).classed('active', activeFilters.has(d));
        updateVisibility();
      });

    function updateVisibility() {
      const visibleNodes = new Set();
      node.style('opacity', d => {
        const visible = activeFilters.has(d.type);
        if (visible) visibleNodes.add(d.id);
        return visible ? 1 : 0.1;
      });
      label.style('opacity', d => activeFilters.has(d.type) ? 1 : 0);
      link.style('opacity', d =>
        visibleNodes.has(d.from_id) && visibleNodes.has(d.to_id) ? 0.6 : 0.05
      );
    }

    // Recherche
    const searchInput = document.getElementById('searchInput');
    searchInput.addEventListener('input', (e) => {
      const term = e.target.value.toLowerCase();
      if (!term) {
        node.style('opacity', 1);
        label.style('opacity', 1);
        link.style('opacity', 0.6);
        return;
      }
      const matched = new Set(nodes.filter(n =>
        n.label.toLowerCase().includes(term) ||
        n.id.toLowerCase().includes(term)
      ).map(n => n.id));

      node.style('opacity', d => matched.has(d.id) ? 1 : 0.1);
      label.style('opacity', d => matched.has(d.id) ? 1 : 0);
      link.style('opacity', d =>
        matched.has(d.from_id) && matched.has(d.to_id) ? 0.6 : 0.05
      );
    });

    // Clic sur nœud
    node.on('click', (e, d) => {
      e.stopPropagation();
      const connected = edges.filter(edge => edge.from_id === d.id || edge.to_id === d.id);
      const neighborIds = new Set(connected.map(e => e.from_id === d.id ? e.to_id : e.from_id));

      node.style('opacity', n => neighborIds.has(n.id) || n.id === d.id ? 1 : 0.1);
      label.style('opacity', n => neighborIds.has(n.id) || n.id === d.id ? 1 : 0);
      link.style('opacity', l => l.from_id === d.id || l.to_id === d.id ? 0.8 : 0.05);

      document.getElementById('info').style.display = 'block';
      document.getElementById('infoTitle').textContent = d.label;
      document.getElementById('infoType').textContent = 'Type: ' + d.type;
      document.getElementById('infoPath').textContent = d.file_path || d.id;
      const tagDiv = document.getElementById('infoTags');
      tagDiv.innerHTML = '<span class="tag" style="background:' + (colors[d.type] || '#333') + '20;color:' + (colors[d.type] || '#999') + '">' + d.type + '</span>' +
        '<span style="margin-left:8px;font-size:11px;color:#8b949e">' + connected.length + ' connexion(s)</span>';
    });

    svg.on('click', () => {
      document.getElementById('info').style.display = 'none';
      updateVisibility();
    });

    simulation.on('tick', () => {
      link
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y);
      node
        .attr('cx', d => d.x)
        .attr('cy', d => d.y);
      label
        .attr('x', d => d.x)
        .attr('y', d => d.y);
    });

    document.getElementById('stats').textContent =
      nodes.length + ' nœuds | ' + edges.length + ' liens';
  </script>
</body>
</html>`;

  fs.writeFileSync(outputPath, html);
  db.close();
}
