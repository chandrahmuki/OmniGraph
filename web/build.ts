import { GraphDB } from "../db.ts";
import { loadConfig } from "../extract.ts";

export function buildHtml(dbPath: string, outputPath: string, projectPath: string): void {
  const fs = require("node:fs");
  const path = require("node:path");
  const db = new GraphDB(dbPath);

  const nodes = db.getAllNodes();
  const edges = db.getAllEdges();
  const annotationsByNode = db.getAllAnnotations();
  const annotationsObj: Record<string, { key: string; value: string }[]> = {};
  for (const [nodeId, anns] of annotationsByNode) {
    annotationsObj[nodeId] = anns;
  }

  const nodeInfo: Record<string, { incoming: { from_id: string; type: string }[]; outgoing: { to_id: string; type: string }[] }> = {};
  for (const n of nodes) {
    nodeInfo[n.id] = { incoming: [], outgoing: [] };
  }
  for (const e of edges) {
    if (nodeInfo[e.from_id]) nodeInfo[e.from_id].outgoing.push({ to_id: e.to_id, type: e.type });
    if (nodeInfo[e.to_id]) nodeInfo[e.to_id].incoming.push({ from_id: e.from_id, type: e.type });
  }

  const d3Path = path.join(import.meta.dirname || __dirname, "d3.min.js");
  let d3Code = "";
  try {
    d3Code = fs.readFileSync(d3Path, "utf-8");
  } catch {}

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
      background: rgba(13, 17, 23, 0.95);
      border: 1px solid #30363d;
      border-radius: 8px;
      padding: 14px;
      max-width: 420px;
      max-height: 55vh;
      overflow-y: auto;
      display: none;
    }
    #info h3 { font-size: 14px; margin-bottom: 4px; color: #f0f6fc; }
    #infoMeta { font-size: 12px; color: #8b949e; margin-bottom: 8px; }
    #infoMeta .date { color: #58a6ff; margin-right: 6px; }
    #infoContent { margin-bottom: 8px; }
    #infoContent .section { margin-top: 8px; }
    #infoContent .section-title { color: #58a6ff; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px; }
    #infoContent .item { font-size: 12px; color: #c9d1d9; padding: 1px 0; line-height: 1.5; }
    #infoTags { margin-bottom: 8px; }
    .tag {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      margin: 2px;
    }
    #infoEdges { margin-top: 4px; }
    #infoEdges .section { margin-top: 8px; }
    #infoEdges .section-title { color: #8b949e; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px; }
    #infoEdges .item { font-size: 12px; color: #c9d1d9; padding: 1px 0; }
    #stats {
      position: absolute;
      bottom: 16px;
      right: 16px;
      z-index: 10;
      font-size: 12px;
      color: #8b949e;
    }
    #debug {
      position: absolute;
      top: 50px;
      left: 16px;
      z-index: 20;
      font-size: 11px;
      color: #f97583;
      max-width: 400px;
      display: none;
    }
  </style>
</head>
<body>
  <div id="search"><input type="text" id="searchInput" placeholder="Rechercher..."></div>
  <div id="filters"></div>
  <div id="info">
    <h3 id="infoTitle"></h3>
    <div id="infoMeta"></div>
    <div id="infoContent"></div>
    <div id="infoTags"></div>
    <div id="infoEdges"></div>
  </div>
  <div id="stats"></div>
  <div id="debug"></div>
  <svg id="graph"></svg>

  <script>
    // D3 inlined for offline/file:// compatibility
    ${d3Code}
  </script>
  <script>
  try {
    const nodes = ${JSON.stringify(nodes)};
    const edges = ${JSON.stringify(edges)};
    const nodeInfo = ${JSON.stringify(nodeInfo)};
    const annotationsObj = ${JSON.stringify(annotationsObj)};
    const config = ${JSON.stringify(loadConfig(projectPath))};
    const entityTypes = config.entity_types || {};
    const relationTypes = config.relation_types || {};
    const colors = Object.fromEntries(
      Object.entries(entityTypes).map(([k, v]) => [k, v.color])
    );
    colors.default = '#8b949e';
    const edgeColors = Object.fromEntries(
      Object.entries(relationTypes).map(([k, v]) => [k, v.color || '#30363d'])
    );
    edgeColors.default = '#30363d';
    const relationLabels = Object.fromEntries(
      Object.entries(relationTypes).map(([k, v]) => [k, v.label || k])
    );

    // Deduplicate
    const seenNodeIds = new Set();
    const uniqueNodes = nodes.filter(n => {
      if (seenNodeIds.has(n.id)) return false;
      seenNodeIds.add(n.id);
      return true;
    });
    const nodeIdSet = new Set(uniqueNodes.map(n => n.id));
    const validEdges = edges.filter(e => nodeIdSet.has(e.from_id) && nodeIdSet.has(e.to_id));

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

    uniqueNodes.forEach(n => {
      n.connections = validEdges.filter(e => e.from_id === n.id || e.to_id === n.id).length;
    });

    // Radius by type
    function getRadius(n) {
      if (n.type === 'lesson_item') return Math.sqrt(Math.max(n.connections || 1, 1)) * 3 + 3;
      if (n.type === 'option') return 3;
      return Math.sqrt(Math.max(n.connections || 1, 1)) * 4 + 4;
    }

    const typeAngles = {};
    const types = [...new Set(uniqueNodes.map(n => n.type))];
    types.forEach((t, i) => typeAngles[t] = (i / types.length) * 2 * Math.PI);

    uniqueNodes.forEach(n => {
      const angle = typeAngles[n.type] || 0;
      const dist = 150 + Math.random() * 200;
      n.x = width / 2 + Math.cos(angle) * dist;
      n.y = height / 2 + Math.sin(angle) * dist;
    });

    validEdges.forEach(e => {
      e.source = e.from_id;
      e.target = e.to_id;
    });

    const simulation = d3.forceSimulation(uniqueNodes)
      .force('link', d3.forceLink(validEdges).id(d => d.id).distance(60).strength(0.3))
      .force('charge', d3.forceManyBody().strength(-80))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(d => getRadius(d) + 2))
      .force('x', d3.forceX(width / 2).strength(0.03))
      .force('y', d3.forceY(height / 2).strength(0.03));

    const link = g.append('g')
      .selectAll('line')
      .data(validEdges)
      .join('line')
      .attr('stroke', d => edgeColors[d.type] || edgeColors.default)
      .attr('stroke-width', d => d.confidence === 'extracted' ? 1.5 : 1)
      .attr('stroke-dasharray', d => d.confidence === 'inferred' ? '4,3' : null)
      .attr('opacity', 0.5);

    const node = g.append('g')
      .selectAll('circle')
      .data(uniqueNodes)
      .join('circle')
      .attr('r', d => getRadius(d))
      .attr('fill', d => colors[d.type] || colors.default)
      .attr('stroke', '#0d1117')
      .attr('stroke-width', 2)
      .style('cursor', 'pointer')
      .call(d3.drag()
        .on('start', (e, d) => { if (!e.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
        .on('drag', (e, d) => { d.fx = e.x; d.fy = e.y; })
        .on('end', (e, d) => { if (!e.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; }));

    const label = g.append('g')
      .selectAll('text')
      .data(uniqueNodes.filter(d => d.connections > 1 || d.type === 'lesson_item' || d.type === 'lesson'))
      .join('text')
      .text(d => d.label.length > 25 ? d.label.slice(0, 25) + '...' : d.label)
      .attr('font-size', d => d.type === 'lesson_item' ? 8 : 10)
      .attr('fill', '#c9d1d9')
      .attr('dx', d => getRadius(d) + 4)
      .attr('dy', 3);

    // Filters
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
        visibleNodes.has(d.source.id) && visibleNodes.has(d.target.id) ? 0.5 : 0.05
      );
    }

    // Search
    const searchInput = document.getElementById('searchInput');
    searchInput.addEventListener('input', (e) => {
      const term = e.target.value.toLowerCase();
      if (!term) {
        node.style('opacity', 1);
        label.style('opacity', 1);
        link.style('opacity', 0.5);
        return;
      }
      const matched = new Set(uniqueNodes.filter(n =>
        n.label.toLowerCase().includes(term) || n.id.toLowerCase().includes(term)
      ).map(n => n.id));
      // Also match via annotations
      for (const [nid, anns] of Object.entries(annotationsObj)) {
        if (anns.some(a => a.value.toLowerCase().includes(term) || a.key.toLowerCase().includes(term))) {
          matched.add(nid);
        }
      }
      node.style('opacity', d => matched.has(d.id) ? 1 : 0.1);
      label.style('opacity', d => matched.has(d.id) ? 1 : 0);
      link.style('opacity', d =>
        matched.has(d.source.id) && matched.has(d.target.id) ? 0.5 : 0.05
      );
    });

    // Click on node - enriched info panel
    node.on('click', (e, d) => {
      e.stopPropagation();
      const connected = validEdges.filter(edge => edge.source.id === d.id || edge.target.id === d.id);
      const neighborIds = new Set(connected.map(e => e.source.id === d.id ? e.target.id : e.source.id));

      node.style('opacity', n => neighborIds.has(n.id) || n.id === d.id ? 1 : 0.1);
      label.style('opacity', n => neighborIds.has(n.id) || n.id === d.id ? 1 : 0);
      link.style('opacity', l => l.source.id === d.id || l.target.id === d.id ? 0.8 : 0.05);

      const info = nodeInfo[d.id] || { incoming: [], outgoing: [] };

      // Title
      document.getElementById('infoTitle').textContent = d.label;

      // Meta
      let metaHtml = '';
      if (d.created_at) metaHtml += '<span class="date">' + d.created_at + '</span> ';
      metaHtml += '<span class="tag" style="background:' + (colors[d.type] || '#333') + '20;color:' + (colors[d.type] || '#999') + '">' + d.type + '</span>';
      if (d.type === 'file' || d.type === 'lesson' || d.type === 'lesson_item') {
        metaHtml += ' <span style="color:#8b949e;font-size:11px">' + (d.file_path || d.id) + '</span>';
      }
      if (d.connections) metaHtml += ' <span style="font-size:11px;color:#8b949e">' + d.connections + ' connexion(s)</span>';
      document.getElementById('infoMeta').innerHTML = metaHtml;

      // Content - type-specific
      const contentDiv = document.getElementById('infoContent');
      let contentHtml = '';

      if (d.type === 'lesson_item') {
        contentHtml += '<div class="section"><div class="section-title">Lesson</div><div class="item">' + d.label + '</div></div>';
      } else if (d.type === 'lesson') {
        const contains = validEdges.filter(e => e.source.id === d.id && e.type === 'lesson_contains')
          .map(e => uniqueNodes.find(n => n.id === e.target.id))
          .filter(Boolean);
        if (contains.length) {
          contentHtml += '<div class="section"><div class="section-title">Items (' + contains.length + ')</div>';
          contains.slice(0, 10).forEach(it => {
            const date = it.created_at ? '<span style="color:#58a6ff">[' + it.created_at + ']</span> ' : '';
            contentHtml += '<div class="item">' + date + (it.label.length > 100 ? it.label.slice(0, 100) + '...' : it.label) + '</div>';
          });
          if (contains.length > 10) contentHtml += '<div class="item" style="color:#8b949e">... and ' + (contains.length - 10) + ' more</div>';
          contentHtml += '</div>';
        }
      } else if (d.type === 'session') {
        const modified = info.outgoing.filter(e => e.type === 'session_modified').map(e => e.to_id);
        const produced = info.outgoing.filter(e => e.type === 'session_produced').map(e => e.to_id);
        if (modified.length) {
          contentHtml += '<div class="section"><div class="section-title">Modified</div>';
          modified.forEach(m => contentHtml += '<div class="item">' + m + '</div>');
          contentHtml += '</div>';
        }
        if (produced.length) {
          contentHtml += '<div class="section"><div class="section-title">Produced</div>';
          produced.forEach(p => contentHtml += '<div class="item">' + p + '</div>');
          contentHtml += '</div>';
        }
      } else if (d.type === 'file') {
        const provides = info.outgoing.filter(e => e.type === 'provides_option').map(e => e.to_id);
        const usesInput = info.outgoing.filter(e => e.type === 'uses_input').map(e => e.to_id);
        if (provides.length) {
          contentHtml += '<div class="section"><div class="section-title">Provides</div>';
          provides.slice(0, 8).forEach(p => contentHtml += '<div class="item">' + p + '</div>');
          if (provides.length > 8) contentHtml += '<div class="item" style="color:#8b949e">... +' + (provides.length - 8) + ' more</div>';
          contentHtml += '</div>';
        }
        if (usesInput.length) {
          contentHtml += '<div class="section"><div class="section-title">Inputs</div>';
          usesInput.forEach(i => contentHtml += '<div class="item">' + i + '</div>');
          contentHtml += '</div>';
        }
      }

      contentDiv.innerHTML = contentHtml;
      contentDiv.style.display = contentHtml ? 'block' : 'none';

      // Tags
      const tags = (annotationsObj[d.id] || []).filter(a => a.key === 'tag').map(a => a.value);
      const tagsDiv = document.getElementById('infoTags');
      if (tags.length) {
        tagsDiv.innerHTML = tags.map(t => '<span class="tag" style="background:#22c55e20;color:#22c55e">' + t + '</span>').join('');
        tagsDiv.style.display = 'block';
      } else {
        tagsDiv.style.display = 'none';
      }

      // Edges grouped
      const edgesDiv = document.getElementById('infoEdges');
      let edgesHtml = '';
      const outgoingByType = {};
      (info.outgoing || []).forEach(e => {
        if (!outgoingByType[e.type]) outgoingByType[e.type] = [];
        outgoingByType[e.type].push(e.to_id);
      });
      const incomingByType = {};
      (info.incoming || []).forEach(e => {
        if (!incomingByType[e.type]) incomingByType[e.type] = [];
        incomingByType[e.type].push(e.from_id);
      });

      for (const [type, targets] of Object.entries(outgoingByType)) {
        const lbl = relationLabels[type] || type;
        edgesHtml += '<div class="section"><div class="section-title">↓ ' + lbl + '</div>';
        targets.slice(0, 6).forEach(t => {
          const target = uniqueNodes.find(n => n.id === t);
          edgesHtml += '<div class="item">' + (target ? target.label : t) + '</div>';
        });
        if (targets.length > 6) edgesHtml += '<div class="item" style="color:#8b949e">... +' + (targets.length - 6) + ' more</div>';
        edgesHtml += '</div>';
      }
      for (const [type, sources] of Object.entries(incomingByType)) {
        const lbl = relationLabels[type] || type;
        edgesHtml += '<div class="section"><div class="section-title">↑ ' + lbl + '</div>';
        sources.slice(0, 6).forEach(s => {
          const src = uniqueNodes.find(n => n.id === s);
          edgesHtml += '<div class="item">' + (src ? src.label : s) + '</div>';
        });
        if (sources.length > 6) edgesHtml += '<div class="item" style="color:#8b949e">... +' + (sources.length - 6) + ' more</div>';
        edgesHtml += '</div>';
      }

      edgesDiv.innerHTML = edgesHtml;
      edgesDiv.style.display = edgesHtml ? 'block' : 'none';

      document.getElementById('info').style.display = 'block';
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
      uniqueNodes.length + ' noeuds | ' + validEdges.length + ' liens';

  } catch(err) {
    document.getElementById('debug').style.display = 'block';
    document.getElementById('debug').textContent = 'ERROR: ' + err.message + ' | ' + err.stack;
  }
  </script>
</body>
</html>`;

  fs.writeFileSync(outputPath, html);
  db.close();
}