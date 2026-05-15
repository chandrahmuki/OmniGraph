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

  const sigmaPath = path.join(import.meta.dirname || __dirname, "sigma.min.js");
  const graphologyPath = path.join(import.meta.dirname || __dirname, "graphology.min.js");
  let sigmaCode = "", graphologyCode = "";
  try { sigmaCode = fs.readFileSync(sigmaPath, "utf-8"); } catch {}
  try { graphologyCode = fs.readFileSync(graphologyPath, "utf-8"); } catch {}

  // Optimize: compact data format
  const config = loadConfig(projectPath);
  const entityTypes = config.entity_types || {};
  const relationTypes = config.relation_types || {};
  const colors = Object.fromEntries(Object.entries(entityTypes).map(([k, v]) => [k, (v as any).color]));
  const edgeColors = Object.fromEntries(Object.entries(relationTypes).map(([k, v]) => [k, (v as any).color || "#30363d"]));

  // Deduplicate and compact
  const seenIds = new Set();
  const uniqueNodes = nodes.filter(n => { if (seenIds.has(n.id)) return false; seenIds.add(n.id); return true; });
  const nodeIdSet = new Set(uniqueNodes.map(n => n.id));
  const validEdges = edges.filter(e => nodeIdSet.has(e.from_id) && nodeIdSet.has(e.to_id));

  // Connection count
  const connCount: Record<string, number> = {};
  validEdges.forEach(e => { connCount[e.from_id] = (connCount[e.from_id] || 0) + 1; connCount[e.to_id] = (connCount[e.to_id] || 0) + 1; });

  // Compact node data: [id, typeIndex, label, connCount]
  const typeList = [...new Set(uniqueNodes.map(n => n.type))];
  const typeIndex = Object.fromEntries(typeList.map((t, i) => [t, i]));
  const compactNodes = uniqueNodes.map(n => [n.id, typeIndex[n.type], n.label, connCount[n.id] || 0]);

  // Compact edge data: [fromIndex, toIndex, typeIndex]
  const nodeIndex = Object.fromEntries(uniqueNodes.map((n, i) => [n.id, i]));
  const edgeTypeList = [...new Set(validEdges.map(e => e.type))];
  const edgeTypeIndex = Object.fromEntries(edgeTypeList.map((t, i) => [t, i]));
  const compactEdges = validEdges.map(e => [nodeIndex[e.from_id], nodeIndex[e.to_id], edgeTypeIndex[e.type]]);

  // Write data as JS file that sets window.graphData (works with file://)
  const dataPath = path.join(path.dirname(outputPath), "graph-data.js");
  const graphData = {
    types: typeList,
    colors: colors,
    edgeColors: edgeColors,
    relationLabels: Object.fromEntries(edgeTypeList.map(t => [edgeTypeIndex[t], t])),
    nodeInfo: nodeInfo,
    annotationsObj: annotationsObj,
    nodes: compactNodes,
    edges: compactEdges,
  };
  fs.writeFileSync(dataPath, `window.graphData = ${JSON.stringify(graphData)};`);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>OmniGraph</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0d1117; color: #c9d1d9; overflow: hidden; }
    #app { position: absolute; top: 0; left: 0; width: 100vw; height: 100vh; }
    #loading { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: #8b949e; font-size: 14px; }
    #search { position: absolute; top: 16px; left: 16px; z-index: 10; }
    #search input { background: #21262d; border: 1px solid #30363d; color: #c9d1d9; padding: 8px 12px; border-radius: 6px; width: 240px; font-size: 14px; }
    #search input:focus { outline: none; border-color: #58a6ff; }
    #filters { position: absolute; top: 16px; right: 16px; z-index: 10; display: flex; gap: 8px; flex-wrap: wrap; max-width: 400px; justify-content: flex-end; }
    .filter-section { display: flex; flex-direction: column; gap: 4px; background: rgba(33, 38, 45, 0.85); padding: 8px; border-radius: 8px; border: 1px solid #30363d; }
    .filter-section-title { font-size: 10px; color: #8b949e; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600; }
    .filter-row { display: flex; gap: 4px; flex-wrap: wrap; }
    .filter-btn { background: #21262d; border: 1px solid #30363d; color: #c9d1d9; padding: 4px 12px; border-radius: 20px; font-size: 12px; cursor: pointer; }
    .filter-btn:hover { border-color: #58a6ff; }
    .filter-btn.active { background: #1f6feb; border-color: #1f6feb; }
    .filter-btn.small { padding: 2px 8px; font-size: 11px; border-radius: 12px; }
    #focusMode, #exportBtn, #resetLayoutBtn { position: absolute; top: 16px; z-index: 10; background: #21262d; border: 1px solid #30363d; color: #c9d1d9; padding: 6px 12px; border-radius: 6px; font-size: 12px; cursor: pointer; }
    #focusMode { right: 340px; }
    #focusMode.active { background: #1f6feb; border-color: #1f6feb; }
    #exportBtn { right: 470px; }
    #resetLayoutBtn { right: 590px; }
    #legend { position: absolute; bottom: 50px; right: 16px; z-index: 10; background: rgba(33, 38, 45, 0.9); border: 1px solid #30363d; border-radius: 8px; padding: 10px; max-height: 300px; overflow-y: auto; }
    .legend-item { display: flex; align-items: center; gap: 8px; font-size: 11px; margin: 4px 0; }
    .legend-color { width: 12px; height: 12px; border-radius: 50%; border: 1px solid #30363d; }
    #info { position: absolute; bottom: 16px; left: 16px; z-index: 10; background: rgba(13, 17, 23, 0.95); border: 1px solid #30363d; border-radius: 8px; padding: 14px; max-width: 420px; max-height: 55vh; overflow-y: auto; display: none; }
    #info h3 { font-size: 14px; margin-bottom: 4px; color: #f0f6fc; }
    #infoMeta { font-size: 12px; color: #8b949e; margin-bottom: 8px; }
    #infoContent { margin-bottom: 8px; }
    #infoContent .section { margin-top: 8px; }
    #infoContent .section-title { color: #58a6ff; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px; }
    #infoContent .item { font-size: 12px; color: #c9d1d9; padding: 1px 0; line-height: 1.5; }
    #infoTags { margin-bottom: 8px; }
    .tag { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; margin: 2px; }
    #infoEdges { margin-top: 4px; }
    #infoEdges .section { margin-top: 8px; }
    #infoEdges .section-title { color: #8b949e; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px; }
    #infoEdges .item { font-size: 12px; color: #c9d1d9; padding: 1px 0; }
    #stats { position: absolute; bottom: 16px; right: 16px; z-index: 10; font-size: 12px; color: #8b949e; }
    #debug { position: absolute; top: 50px; left: 16px; z-index: 20; font-size: 11px; color: #f97583; max-width: 400px; display: none; }
  </style>
</head>
<body>
  <div id="loading">Loading graph...</div>
  <div id="search"><input type="text" id="searchInput" placeholder="Search..."></div>
  <button id="focusMode">Focus Mode</button>
  <button id="exportBtn">Export PNG</button>
  <button id="resetLayoutBtn">Reset Layout</button>
  <div id="filters"></div>
  <div id="legend"></div>
  <div id="info"><h3 id="infoTitle"></h3><div id="infoMeta"></div><div id="infoContent"></div><div id="infoTags"></div><div id="infoEdges"></div></div>
  <div id="stats"></div>
  <div id="debug"></div>
  <div id="app"></div>

  <script src="d3.min.js"></script>
  <script>${graphologyCode}</script>
  <script>${sigmaCode}</script>
  <script src="graph-data.js"></script>
  <script>
  try {
    document.getElementById('loading').style.display = 'none';
    const data = window.graphData;
    const { types, colors, edgeColors, relationLabels, nodeInfo, annotationsObj, nodes: compactNodes, edges: compactEdges } = data;

    const graph = new graphology.Graph();
    const nodeIds = [];
    compactNodes.forEach(([id, typeIdx, label, conn]) => {
      const type = types[typeIdx];
      const size = type === 'option' ? 1 : Math.sqrt(Math.max(conn, 1)) * 1.5 + 2;
      graph.addNode(id, { label, size, color: colors[type] || '#8b949e', kind: type, type: 'circle' });
      nodeIds.push(id);
    });
    compactEdges.forEach(([fromIdx, toIdx, typeIdx]) => {
      graph.addEdge(nodeIds[fromIdx], nodeIds[toIdx], { relationType: String(typeIdx), color: edgeColors[relationLabels[typeIdx]] || 'rgba(48,54,61,0.6)', size: 0.5 });
    });

    const saved = JSON.parse(localStorage.getItem('omnigraph_layout') || '{}');
    const hasSavedLayout = Object.keys(saved).length > 0;

    if (hasSavedLayout) {
      Object.entries(saved).forEach(([id, p]) => { if (graph.hasNode(id)) { graph.setNodeAttribute(id, 'x', p.x); graph.setNodeAttribute(id, 'y', p.y); } });
    } else {
      graph.forEachNode(node => {
        graph.setNodeAttribute(node, 'x', (Math.random() - 0.5) * 500);
        graph.setNodeAttribute(node, 'y', (Math.random() - 0.5) * 500);
      });
    }

    const d3Nodes = nodeIds.map(id => {
      const attrs = graph.getNodeAttributes(id);
      return { id, x: attrs.x, y: attrs.y, fx: null, fy: null };
    });
    const d3Links = compactEdges.map(([fromIdx, toIdx]) => ({ source: nodeIds[fromIdx], target: nodeIds[toIdx] }));

    const simulation = d3.forceSimulation(d3Nodes)
      .force('link', d3.forceLink(d3Links).id(d => d.id).distance(80).strength(0.4))
      .force('charge', d3.forceManyBody().strength(-120))
      .force('center', d3.forceCenter(0, 0))
      .force('collision', d3.forceCollide().radius(d => (graph.getNodeAttributes(d.id).size || 4) + 5))
      .alphaDecay(0.015)
      .on('tick', () => {
        d3Nodes.forEach(n => {
          if (n.fx === null) graph.setNodeAttribute(n.id, 'x', n.x);
          if (n.fy === null) graph.setNodeAttribute(n.id, 'y', n.y);
        });
        sigmaInstance.refresh();
      });

    if (hasSavedLayout) { simulation.stop(); }
    else {
      document.getElementById('loading').textContent = 'Computing layout...';
      simulation.tick(300);
    }

    const activeFilters = new Set(types);
    let focusMode = false, focusedNodeId = null, selectedNodeId = null, searchMatched = null, hoveredNodeId = null;
    let focusedNeighbors = new Set();
    const nodeTypeMap = {};
    graph.forEachNode(n => { nodeTypeMap[n] = graph.getNodeAttributes(n).kind; });

    const nodeReducer = (node, data) => {
      const type = nodeTypeMap[node];
      if (!activeFilters.has(type)) return { hidden: true };
      if (searchMatched && !searchMatched.has(node)) return { hidden: true };
      if (focusMode && focusedNodeId && node !== focusedNodeId && !focusedNeighbors.has(node)) return { hidden: true };
      if (node === selectedNodeId || node === hoveredNodeId) return { ...data, borderColor: '#58a6ff' };
      return data;
    };

    const edgeReducer = (edge, data) => {
      const s = graph.source(edge), t = graph.target(edge);
      if (!activeFilters.has(nodeTypeMap[s]) || !activeFilters.has(nodeTypeMap[t])) return { hidden: true };
      if (searchMatched && !searchMatched.has(s) && !searchMatched.has(t)) return { hidden: true };
      if (focusMode && focusedNodeId && s !== focusedNodeId && t !== focusedNodeId) return { hidden: true };
      return data;
    };

    const sigmaInstance = new Sigma(graph, document.getElementById('app'), {
      renderEdgeLabels: false, renderNodeLabels: false,
      nodeReducer, edgeReducer, minCameraRatio: 0.01, maxCameraRatio: 10,
    });

    sigmaInstance.on('enterNode', e => { hoveredNodeId = e.node; sigmaInstance.refresh(); });
    sigmaInstance.on('leaveNode', () => { hoveredNodeId = null; sigmaInstance.refresh(); });
    sigmaInstance.on('clickNode', e => {
      selectedNodeId = e.node;
      if (focusMode) { focusedNodeId = e.node; focusedNeighbors = new Set(graph.neighbors(e.node)); }
      showInfo(e.node); sigmaInstance.refresh();
    });
    sigmaInstance.on('clickStage', () => {
      selectedNodeId = null; document.getElementById('info').style.display = 'none';
      if (focusMode) { focusedNodeId = null; focusedNeighbors = new Set(); }
      sigmaInstance.refresh();
    });

    sigmaInstance.on('downNode', e => {
      const n = d3Nodes.find(d => d.id === e.node);
      if (n) { n.fx = graph.getNodeAttribute(e.node, 'x'); n.fy = graph.getNodeAttribute(e.node, 'y'); simulation.alpha(0.3).restart(); }
    });
    sigmaInstance.on('mousemove', e => {
      const n = d3Nodes.find(d => d.id === e.node);
      if (n && n.fx !== null && e.event) {
        const vp = sigmaInstance.viewportToGraph({ x: e.event.x, y: e.event.y });
        n.fx = vp.x; n.fy = vp.y;
        graph.setNodeAttribute(n.id, 'x', vp.x); graph.setNodeAttribute(n.id, 'y', vp.y);
        sigmaInstance.refresh();
      }
    });
    sigmaInstance.on('mouseup', () => {
      d3Nodes.forEach(n => { n.fx = null; n.fy = null; });
    });

    let saveTimeout = null;
    sigmaInstance.getCamera().on('coordinatesUpdated', () => {
      if (!saveTimeout) { saveTimeout = setTimeout(() => {
        const pos = {}; graph.forEachNode((n, a) => { pos[n] = { x: a.x, y: a.y }; });
        localStorage.setItem('omnigraph_layout', JSON.stringify(pos)); saveTimeout = null;
      }, 500); }
    });

    function showInfo(nodeId) {
      const attrs = graph.getNodeAttributes(nodeId);
      const info = nodeInfo[nodeId] || { incoming: [], outgoing: [] };
      document.getElementById('infoTitle').textContent = attrs.label;
      let meta = '<span class="tag" style="background:' + (colors[attrs.kind] || '#333') + '20;color:' + (colors[attrs.kind] || '#999') + '">' + attrs.kind + '</span>';
      if (attrs.kind === 'file' || attrs.kind === 'lesson' || attrs.kind === 'lesson_item') meta += ' <span style="color:#8b949e;font-size:11px">' + nodeId + '</span>';
      document.getElementById('infoMeta').innerHTML = meta;
      let content = '';
      if (attrs.kind === 'lesson_item') content = '<div class="section"><div class="section-title">Lesson</div><div class="item">' + attrs.label + '</div></div>';
      else if (attrs.kind === 'lesson') {
        const items = info.outgoing.filter(e => e.type === 'lesson_contains').map(e => e.to_id);
        if (items.length) content = '<div class="section"><div class="section-title">Items (' + items.length + ')</div>' + items.slice(0, 10).map(i => '<div class="item">' + i + '</div>').join('') + '</div>';
      }
      document.getElementById('infoContent').innerHTML = content;
      document.getElementById('infoContent').style.display = content ? 'block' : 'none';
      const tags = (annotationsObj[nodeId] || []).filter(a => a.key === 'tag').map(a => a.value);
      document.getElementById('infoTags').innerHTML = tags.map(t => '<span class="tag" style="background:#22c55e20;color:#22c55e">' + t + '</span>').join('');
      document.getElementById('infoTags').style.display = tags.length ? 'block' : 'none';
      let edgesHtml = '';
      const outByType = {}, inByType = {};
      info.outgoing.forEach(e => { (outByType[e.type] = outByType[e.type] || []).push(e.to_id); });
      info.incoming.forEach(e => { (inByType[e.type] = inByType[e.type] || []).push(e.from_id); });
      for (const [t, targets] of Object.entries(outByType)) edgesHtml += '<div class="section"><div class="section-title">↓ ' + t + '</div>' + targets.slice(0, 6).map(tgt => '<div class="item">' + tgt + '</div>').join('') + '</div>';
      for (const [t, sources] of Object.entries(inByType)) edgesHtml += '<div class="section"><div class="section-title">↑ ' + t + '</div>' + sources.slice(0, 6).map(src => '<div class="item">' + src + '</div>').join('') + '</div>';
      document.getElementById('infoEdges').innerHTML = edgesHtml;
      document.getElementById('infoEdges').style.display = edgesHtml ? 'block' : 'none';
      document.getElementById('info').style.display = 'block';
    }

    const filterContainer = document.getElementById('filters');
    const typeSection = document.createElement('div');
    typeSection.className = 'filter-section';
    typeSection.innerHTML = '<div class="filter-section-title">Types</div>';
    const typeRow = document.createElement('div');
    typeRow.className = 'filter-row';
    types.forEach(t => {
      const btn = document.createElement('button');
      btn.className = 'filter-btn small active';
      btn.style.borderColor = colors[t] || '#30363d';
      btn.textContent = t;
      btn.onclick = () => { if (activeFilters.has(t)) activeFilters.delete(t); else activeFilters.add(t); btn.classList.toggle('active', activeFilters.has(t)); sigmaInstance.refresh(); };
      typeRow.appendChild(btn);
    });
    typeSection.appendChild(typeRow);
    filterContainer.appendChild(typeSection);

    const legend = document.getElementById('legend');
    types.forEach(t => { const item = document.createElement('div'); item.className = 'legend-item'; item.innerHTML = '<div class="legend-color" style="background:' + (colors[t] || '#8b949e') + '"></div><span>' + t + '</span>'; legend.appendChild(item); });

    document.getElementById('focusMode').addEventListener('click', function() { focusMode = !focusMode; this.classList.toggle('active', focusMode); if (!focusMode) { focusedNodeId = null; focusedNeighbors = new Set(); } sigmaInstance.refresh(); });

    document.getElementById('searchInput').addEventListener('input', e => {
      const term = e.target.value.toLowerCase();
      if (!term) { searchMatched = null; sigmaInstance.refresh(); return; }
      searchMatched = new Set();
      graph.forEachNode(n => { const a = graph.getNodeAttributes(n); if (a.label.toLowerCase().includes(term) || n.toLowerCase().includes(term)) searchMatched.add(n); });
      for (const [nid, anns] of Object.entries(annotationsObj)) { if (anns.some(a => a.value.toLowerCase().includes(term))) searchMatched.add(nid); }
      sigmaInstance.refresh();
    });

    document.getElementById('exportBtn').addEventListener('click', () => { const c = document.querySelector('#app canvas'); if (c) { const a = document.createElement('a'); a.download = 'omnigraph-' + new Date().toISOString().slice(0, 10) + '.png'; a.href = c.toDataURL('image/png'); a.click(); } });
    document.getElementById('resetLayoutBtn').addEventListener('click', () => {
      localStorage.removeItem('omnigraph_layout');
      graph.forEachNode(node => {
        graph.setNodeAttribute(node, 'x', (Math.random() - 0.5) * 500);
        graph.setNodeAttribute(node, 'y', (Math.random() - 0.5) * 500);
      });
      d3Nodes.forEach((n, i) => { n.x = graph.getNodeAttribute(n.id, 'x'); n.y = graph.getNodeAttribute(n.id, 'y'); n.fx = null; n.fy = null; });
      simulation.alpha(1).restart();
      sigmaInstance.refresh();
    });

    document.getElementById('stats').textContent = graph.order + ' nodes | ' + graph.size + ' edges | WebGL';
  } catch(err) { document.getElementById('debug').style.display = 'block'; document.getElementById('debug').textContent = 'ERROR: ' + err.message + ' | ' + err.stack; }
  </script>
</body>
</html>`;

  fs.writeFileSync(outputPath, html);
  db.close();
}
