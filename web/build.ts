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
<html lang="en">
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
    canvas { display: block; width: 100vw; height: 100vh; }
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
      max-width: 400px;
      justify-content: flex-end;
    }
    .filter-section {
      display: flex;
      flex-direction: column;
      gap: 4px;
      background: rgba(33, 38, 45, 0.85);
      padding: 8px;
      border-radius: 8px;
      border: 1px solid #30363d;
    }
    .filter-section-title {
      font-size: 10px;
      color: #8b949e;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      font-weight: 600;
    }
    .filter-row {
      display: flex;
      gap: 4px;
      flex-wrap: wrap;
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
    .filter-btn.small {
      padding: 2px 8px;
      font-size: 11px;
      border-radius: 12px;
    }
    #focusMode, #exportBtn, #resetLayoutBtn {
      position: absolute;
      top: 16px;
      z-index: 10;
      background: #21262d;
      border: 1px solid #30363d;
      color: #c9d1d9;
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 12px;
      cursor: pointer;
    }
    #focusMode { right: 340px; }
    #focusMode.active { background: #1f6feb; border-color: #1f6feb; }
    #exportBtn { right: 470px; }
    #resetLayoutBtn { right: 590px; }
    #legend {
      position: absolute;
      bottom: 50px;
      right: 16px;
      z-index: 10;
      background: rgba(33, 38, 45, 0.9);
      border: 1px solid #30363d;
      border-radius: 8px;
      padding: 10px;
      max-height: 300px;
      overflow-y: auto;
    }
    .legend-item {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 11px;
      margin: 4px 0;
    }
    .legend-color {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      border: 1px solid #30363d;
    }
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
    #tooltip {
      position: absolute;
      z-index: 20;
      background: rgba(13, 17, 23, 0.95);
      border: 1px solid #30363d;
      border-radius: 6px;
      padding: 6px 10px;
      font-size: 12px;
      color: #c9d1d9;
      pointer-events: none;
      display: none;
      max-width: 250px;
    }
  </style>
</head>
<body>
  <div id="search"><input type="text" id="searchInput" placeholder="Search..."></div>
  <button id="focusMode">Focus Mode</button>
  <button id="exportBtn">Export PNG</button>
  <button id="resetLayoutBtn">Reset Layout</button>
  <div id="filters"></div>
  <div id="legend"></div>
  <div id="info">
    <h3 id="infoTitle"></h3>
    <div id="infoMeta"></div>
    <div id="infoContent"></div>
    <div id="infoTags"></div>
    <div id="infoEdges"></div>
  </div>
  <div id="stats"></div>
  <div id="debug"></div>
  <div id="tooltip"></div>
  <canvas id="graph"></canvas>

  <script>
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
    edgeColors.default = 'rgba(48,54,61,0.6)';
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

    // Calculate connections
    const connCount = {};
    validEdges.forEach(e => {
      connCount[e.from_id] = (connCount[e.from_id] || 0) + 1;
      connCount[e.to_id] = (connCount[e.to_id] || 0) + 1;
    });
    uniqueNodes.forEach(n => { n.connections = connCount[n.id] || 0; });

    // Load saved positions
    const savedPositions = JSON.parse(localStorage.getItem('omnigraph_layout') || '{}');
    uniqueNodes.forEach(n => {
      if (savedPositions[n.id]) { n.x = savedPositions[n.id].x; n.y = savedPositions[n.id].y; }
    });

    // Cluster by folder
    const clusterMap = new Map();
    uniqueNodes.forEach(n => {
      if (n.file_path) {
        const folder = n.file_path.split('/')[0];
        if (!clusterMap.has(folder)) clusterMap.set(folder, []);
        clusterMap.get(folder).push(n.id);
      }
    });

    const canvas = document.getElementById('graph');
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    function resize() {
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      ctx.scale(dpr, dpr);
    }
    resize();
    window.addEventListener('resize', () => { resize(); simulation.alpha(0.3).restart(); });

    const width = window.innerWidth;
    const height = window.innerHeight;

    // Radius by type
    function getRadius(n) {
      if (n.type === 'lesson_item') return Math.sqrt(Math.max(n.connections || 1, 1)) * 2.5 + 3;
      if (n.type === 'option') return 2;
      return Math.sqrt(Math.max(n.connections || 1, 1)) * 3 + 4;
    }

    // Initialize positions if not saved
    const types = [...new Set(uniqueNodes.map(n => n.type))];
    const typeAngles = {};
    types.forEach((t, i) => typeAngles[t] = (i / types.length) * 2 * Math.PI);
    uniqueNodes.forEach(n => {
      if (n.x == null) {
        const angle = typeAngles[n.type] || 0;
        const dist = 150 + Math.random() * 200;
        n.x = width / 2 + Math.cos(angle) * dist;
        n.y = height / 2 + Math.sin(angle) * dist;
      }
    });

    validEdges.forEach(e => {
      e.source = uniqueNodes.find(n => n.id === e.from_id);
      e.target = uniqueNodes.find(n => n.id === e.to_id);
    });

    const simulation = d3.forceSimulation(uniqueNodes)
      .force('link', d3.forceLink(validEdges).id(d => d.id).distance(80).strength(0.15))
      .force('charge', d3.forceManyBody().strength(-120))
      .force('center', d3.forceCenter(width / 2, height / 2).strength(0.05))
      .force('collision', d3.forceCollide().radius(d => getRadius(d) + 2))
      .force('x', d3.forceX(width / 2).strength(0.02))
      .force('y', d3.forceY(height / 2).strength(0.02))
      .alphaDecay(0.03)
      .velocityDecay(0.5)
      .alpha(0.8);

    // Throttled redraw
    let needsRedraw = true;
    let lastFrameTime = 0;
    const FRAME_INTERVAL = 1000 / 40; // 40fps cap

    function requestRedraw() { needsRedraw = true; }

    function renderLoop(timestamp) {
      if (needsRedraw && timestamp - lastFrameTime >= FRAME_INTERVAL) {
        draw(searchMatched);
        needsRedraw = false;
        lastFrameTime = timestamp;
      }
      requestAnimationFrame(renderLoop);
    }
    requestAnimationFrame(renderLoop);

    // Zoom & pan
    let transform = { x: 0, y: 0, k: 1 };
    let isDragging = false;
    let dragStart = { x: 0, y: 0 };
    let dragTransformStart = { x: 0, y: 0 };

    function applyTransform() {
      ctx.setTransform(dpr * transform.k, 0, 0, dpr * transform.k, dpr * transform.x, dpr * transform.y);
    }

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      const newK = Math.max(0.1, Math.min(8, transform.k * delta));
      const ratio = newK / transform.k;
      transform.x = e.clientX - ratio * (e.clientX - transform.x);
      transform.y = e.clientY - ratio * (e.clientY - transform.y);
      transform.k = newK;
      draw();
    }, { passive: false });

    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0 && !hoveredNode) {
        isDragging = true;
        dragStart = { x: e.clientX, y: e.clientY };
        dragTransformStart = { x: transform.x, y: transform.y };
      }
    });

    canvas.addEventListener('mousemove', (e) => {
      if (isDragging) {
        transform.x = dragTransformStart.x + (e.clientX - dragStart.x);
        transform.y = dragTransformStart.y + (e.clientY - dragStart.y);
        draw();
      } else {
        handleHover(e);
      }
    });

    canvas.addEventListener('mouseup', () => { isDragging = false; });
    canvas.addEventListener('mouseleave', () => { isDragging = false; hoveredNode = null; tooltip.style.display = 'none'; });

    // Filters
    const activeFilters = new Set(types);
    const activeClusters = new Set([...clusterMap.keys()]);
    let focusMode = false;
    let focusedNodeId = null;
    let hoveredNode = null;
    let selectedNode = null;

    const filterContainer = d3.select('#filters');
    const typeSection = filterContainer.append('div').attr('class', 'filter-section');
    typeSection.append('div').attr('class', 'filter-section-title').text('Types');
    const typeRow = typeSection.append('div').attr('class', 'filter-row');
    typeRow.selectAll('.filter-btn')
      .data(types)
      .join('button')
      .attr('class', 'filter-btn small active')
      .style('border-color', d => colors[d] || '#30363d')
      .text(d => d)
      .on('click', function(e, d) {
        if (activeFilters.has(d)) activeFilters.delete(d);
        else activeFilters.add(d);
        d3.select(this).classed('active', activeFilters.has(d));
        draw();
      });

    if (clusterMap.size > 1) {
      const clusterSection = filterContainer.append('div').attr('class', 'filter-section');
      clusterSection.append('div').attr('class', 'filter-section-title').text('Clusters');
      const clusterRow = clusterSection.append('div').attr('class', 'filter-row');
      clusterRow.selectAll('.filter-btn')
        .data([...clusterMap.keys()].sort())
        .join('button')
        .attr('class', 'filter-btn small active')
        .text(d => d)
        .on('click', function(e, d) {
          if (activeClusters.has(d)) activeClusters.delete(d);
          else activeClusters.add(d);
          d3.select(this).classed('active', activeClusters.has(d));
          draw();
        });
    }

    // Legend
    const legend = d3.select('#legend');
    types.forEach(t => {
      const item = legend.append('div').attr('class', 'legend-item');
      item.append('div').attr('class', 'legend-color').style('background', colors[t] || '#8b949e');
      item.append('span').text(t);
    });

    function isVisible(n) {
      if (!activeFilters.has(n.type)) return false;
      if (n.file_path && !activeClusters.has(n.file_path.split('/')[0])) return false;
      return true;
    }

    function isNodeVisible(n) {
      if (focusMode && focusedNodeId) {
        const connected = validEdges.filter(e =>
          (e.source.id === focusedNodeId && e.target.id === n.id) ||
          (e.target.id === focusedNodeId && e.source.id === n.id)
        );
        return n.id === focusedNodeId || connected.length > 0;
      }
      return isVisible(n);
    }

    // Tooltip
    const tooltip = document.getElementById('tooltip');

    function handleHover(e) {
      const mx = (e.clientX - transform.x) / transform.k;
      const my = (e.clientY - transform.y) / transform.k;
      let found = null;
      for (const n of uniqueNodes) {
        if (!isNodeVisible(n)) continue;
        const dx = n.x - mx, dy = n.y - my;
        const r = getRadius(n);
        if (dx * dx + dy * dy < r * r) { found = n; break; }
      }
      hoveredNode = found;
      if (found) {
        canvas.style.cursor = 'pointer';
        tooltip.style.display = 'block';
        tooltip.style.left = (e.clientX + 15) + 'px';
        tooltip.style.top = (e.clientY - 10) + 'px';
        tooltip.textContent = found.label.length > 40 ? found.label.slice(0, 40) + '...' : found.label;
      } else {
        canvas.style.cursor = isDragging ? 'grabbing' : 'grab';
        tooltip.style.display = 'none';
      }
      draw();
    }

    // Click
    canvas.addEventListener('click', (e) => {
      if (hoveredNode) {
        selectedNode = hoveredNode;
        if (focusMode) focusedNodeId = hoveredNode.id;
        showInfo(hoveredNode);
        draw();
      } else {
        selectedNode = null;
        document.getElementById('info').style.display = 'none';
        if (focusMode) { focusedNodeId = null; draw(); }
      }
    });

    function showInfo(d) {
      document.getElementById('infoTitle').textContent = d.label;
      let metaHtml = '';
      if (d.created_at) metaHtml += '<span class="date">' + d.created_at + '</span> ';
      metaHtml += '<span class="tag" style="background:' + (colors[d.type] || '#333') + '20;color:' + (colors[d.type] || '#999') + '">' + d.type + '</span>';
      if (d.type === 'file' || d.type === 'lesson' || d.type === 'lesson_item') {
        metaHtml += ' <span style="color:#8b949e;font-size:11px">' + (d.file_path || d.id) + '</span>';
      }
      if (d.connections) metaHtml += ' <span style="font-size:11px;color:#8b949e">' + d.connections + ' connection(s)</span>';
      document.getElementById('infoMeta').innerHTML = metaHtml;

      const info = nodeInfo[d.id] || { incoming: [], outgoing: [] };
      const contentDiv = document.getElementById('infoContent');
      let contentHtml = '';

      if (d.type === 'lesson_item') {
        contentHtml += '<div class="section"><div class="section-title">Lesson</div><div class="item">' + d.label + '</div></div>';
      } else if (d.type === 'lesson') {
        const contains = validEdges.filter(e => e.source.id === d.id && e.type === 'lesson_contains')
          .map(e => uniqueNodes.find(n => n.id === e.target.id)).filter(Boolean);
        if (contains.length) {
          contentHtml += '<div class="section"><div class="section-title">Items (' + contains.length + ')</div>';
          contains.slice(0, 10).forEach(it => {
            contentHtml += '<div class="item">' + (it.label.length > 100 ? it.label.slice(0, 100) + '...' : it.label) + '</div>';
          });
          contentHtml += '</div>';
        }
      } else if (d.type === 'session') {
        const modified = info.outgoing.filter(e => e.type === 'session_modified').map(e => e.to_id);
        if (modified.length) {
          contentHtml += '<div class="section"><div class="section-title">Modified</div>';
          modified.forEach(m => contentHtml += '<div class="item">' + m + '</div>');
          contentHtml += '</div>';
        }
      } else if (d.type === 'file') {
        const provides = info.outgoing.filter(e => e.type === 'provides_option').map(e => e.to_id);
        const usesInput = info.outgoing.filter(e => e.type === 'uses_input').map(e => e.to_id);
        if (provides.length) {
          contentHtml += '<div class="section"><div class="section-title">Provides</div>';
          provides.slice(0, 8).forEach(p => contentHtml += '<div class="item">' + p + '</div>');
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

      const tags = (annotationsObj[d.id] || []).filter(a => a.key === 'tag').map(a => a.value);
      const tagsDiv = document.getElementById('infoTags');
      if (tags.length) {
        tagsDiv.innerHTML = tags.map(t => '<span class="tag" style="background:#22c55e20;color:#22c55e">' + t + '</span>').join('');
        tagsDiv.style.display = 'block';
      } else { tagsDiv.style.display = 'none'; }

      const edgesDiv = document.getElementById('infoEdges');
      let edgesHtml = '';
      const outgoingByType = {}, incomingByType = {};
      (info.outgoing || []).forEach(e => { (outgoingByType[e.type] = outgoingByType[e.type] || []).push(e.to_id); });
      (info.incoming || []).forEach(e => { (incomingByType[e.type] = incomingByType[e.type] || []).push(e.from_id); });
      for (const [type, targets] of Object.entries(outgoingByType)) {
        const lbl = relationLabels[type] || type;
        edgesHtml += '<div class="section"><div class="section-title">↓ ' + lbl + '</div>';
        targets.slice(0, 6).forEach(t => { const target = uniqueNodes.find(n => n.id === t); edgesHtml += '<div class="item">' + (target ? target.label : t) + '</div>'; });
        edgesHtml += '</div>';
      }
      for (const [type, sources] of Object.entries(incomingByType)) {
        const lbl = relationLabels[type] || type;
        edgesHtml += '<div class="section"><div class="section-title">↑ ' + lbl + '</div>';
        sources.slice(0, 6).forEach(s => { const src = uniqueNodes.find(n => n.id === s); edgesHtml += '<div class="item">' + (src ? src.label : s) + '</div>'; });
        edgesHtml += '</div>';
      }
      edgesDiv.innerHTML = edgesHtml;
      edgesDiv.style.display = edgesHtml ? 'block' : 'none';
      document.getElementById('info').style.display = 'block';
    }

    // Focus mode
    document.getElementById('focusMode').addEventListener('click', function() {
      focusMode = !focusMode;
      this.classList.toggle('active', focusMode);
      if (!focusMode) { focusedNodeId = null; }
      draw();
    });

    // Search
    document.getElementById('searchInput').addEventListener('input', (e) => {
      const term = e.target.value.toLowerCase();
      if (!term) { draw(); return; }
      const matched = new Set();
      uniqueNodes.forEach(n => {
        if (n.label.toLowerCase().includes(term) || n.id.toLowerCase().includes(term)) matched.add(n.id);
      });
      for (const [nid, anns] of Object.entries(annotationsObj)) {
        if (anns.some(a => a.value.toLowerCase().includes(term) || a.key.toLowerCase().includes(term))) matched.add(nid);
      }
      draw(matched);
    });

    // Export PNG
    document.getElementById('exportBtn').addEventListener('click', function() {
      const link = document.createElement('a');
      link.download = 'omnigraph-' + new Date().toISOString().slice(0, 10) + '.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
    });

    // Reset layout
    document.getElementById('resetLayoutBtn').addEventListener('click', function() {
      localStorage.removeItem('omnigraph_layout');
      location.reload();
    });

    // Draw function
    let searchMatched = null;
    const origDraw = draw;
    function draw(matchedSet) {
      searchMatched = matchedSet || null;
      ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
      ctx.save();
      applyTransform();

      // Draw edges
      for (const e of validEdges) {
        if (!e.source || !e.target) continue;
        if (!isNodeVisible(e.source) || !isNodeVisible(e.target)) continue;
        if (searchMatched && !searchMatched.has(e.source.id) && !searchMatched.has(e.target.id)) continue;

        ctx.beginPath();
        ctx.moveTo(e.source.x, e.source.y);
        ctx.lineTo(e.target.x, e.target.y);
        ctx.strokeStyle = edgeColors[e.type] || edgeColors.default;
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }

      // Draw nodes
      for (const n of uniqueNodes) {
        if (!isNodeVisible(n)) continue;
        if (searchMatched && !searchMatched.has(n.id)) {
          ctx.globalAlpha = 0.1;
        }
        const r = getRadius(n);
        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        ctx.fillStyle = colors[n.type] || colors.default;
        ctx.fill();

        // Stroke
        if (n.type === 'error') {
          ctx.strokeStyle = '#ef4444';
          ctx.lineWidth = 3;
          ctx.stroke();
        } else if (n.type === 'fix') {
          ctx.strokeStyle = '#22c55e';
          ctx.lineWidth = 2;
          ctx.setLineDash([3, 3]);
          ctx.stroke();
          ctx.setLineDash([]);
        } else if (n.type === 'workaround') {
          ctx.strokeStyle = '#f97316';
          ctx.lineWidth = 2;
          ctx.stroke();
        } else if (n === hoveredNode || n === selectedNode) {
          ctx.strokeStyle = '#58a6ff';
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        ctx.globalAlpha = 1;
      }

      // Draw labels for hovered/selected/high-degree nodes
      const showLabels = new Set();
      if (hoveredNode) showLabels.add(hoveredNode.id);
      if (selectedNode) showLabels.add(selectedNode.id);
      uniqueNodes.forEach(n => { if (n.connections > 15 && isNodeVisible(n)) showLabels.add(n.id); });

      for (const n of uniqueNodes) {
        if (!showLabels.has(n.id)) continue;
        if (!isNodeVisible(n)) continue;
        const r = getRadius(n);
        ctx.font = '10px -apple-system, sans-serif';
        ctx.fillStyle = n.type === 'error' ? '#ef4444' : '#c9d1d9';
        const text = n.label.length > 30 ? n.label.slice(0, 30) + '...' : n.label;
        ctx.fillText(text, n.x + r + 4, n.y + 3);
      }

      ctx.restore();
    }

    // Drag nodes
    let draggedNode = null;
    canvas.addEventListener('mousedown', (e) => {
      if (hoveredNode) {
        draggedNode = hoveredNode;
        draggedNode.fx = (e.clientX - transform.x) / transform.k;
        draggedNode.fy = (e.clientY - transform.y) / transform.k;
      }
    });
    canvas.addEventListener('mousemove', (e) => {
      if (draggedNode) {
        draggedNode.fx = (e.clientX - transform.x) / transform.k;
        draggedNode.fy = (e.clientY - transform.y) / transform.k;
        simulation.alpha(0.1).restart();
      }
    });
    canvas.addEventListener('mouseup', () => {
      if (draggedNode) { draggedNode.fx = null; draggedNode.fy = null; draggedNode = null; }
    });

    // Simulation tick
    let saveTimeout = null;
    simulation.on('tick', () => {
      requestRedraw();
      if (!saveTimeout) {
        saveTimeout = setTimeout(() => {
          const positions = {};
          uniqueNodes.forEach(n => { if (n.x != null) positions[n.id] = { x: n.x, y: n.y }; });
          localStorage.setItem('omnigraph_layout', JSON.stringify(positions));
          saveTimeout = null;
        }, 500);
      }
    });

    simulation.on('end', () => { requestRedraw(); });

    document.getElementById('stats').textContent =
      uniqueNodes.length + ' nodes | ' + validEdges.length + ' edges';

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
