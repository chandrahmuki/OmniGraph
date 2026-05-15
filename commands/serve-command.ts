import { GraphDB } from "../db.ts";
import path from "node:path";

export class ServeCommand {
  async run(
    projectPath: string,
    dbPath: string,
    args: string[],
    _options: {}
  ): Promise<void> {
    if (!this.checkDB(dbPath)) return;

    const portArg = args.find(a => a.startsWith("--port="));
    const port = portArg ? parseInt(portArg.split("=")[1], 10) : 8080;
    const readOnly = args.includes("--read-only");

    console.log(`\n🚀 OmniGraph HTTP Server`);
    console.log(`   Port: ${port}`);
    console.log(`   Mode: ${readOnly ? "read-only" : "full access"}`);
    console.log(`   DB: ${dbPath}`);
    console.log(`\n   Open http://localhost:${port} in your browser\n`);

    const server = Bun.serve({
      port,
      cors: {
        origin: "*",
        methods: "GET, POST, OPTIONS"
      },
      async fetch(req) {
        const url = new URL(req.url);
        const pathname = url.pathname;
        const method = req.method;

        if (method === "OPTIONS") {
          return new Response(null, {
            headers: {
              "Access-Control-Allow-Origin": "*",
              "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
              "Access-Control-Allow-Headers": "Content-Type"
            }
          });
        }

        try {
          const db = new GraphDB(dbPath);

          // API Routes
          if (pathname === "/api/nodes") {
            const typeFilter = url.searchParams.get("type");
            const nodes = typeFilter 
              ? db.db.query("SELECT * FROM nodes WHERE type = ?").all(typeFilter)
              : db.getAllNodes();
            return jsonResponse({ nodes });
          }

          if (pathname.startsWith("/api/nodes/")) {
            const nodeId = decodeURIComponent(pathname.replace("/api/nodes/", ""));
            const node = db.getNodeById(nodeId);
            if (!node) {
              return jsonResponse({ error: "Node not found" }, 404);
            }
            const backlinks = db.getBacklinks(nodeId, 2);
            const annotations = db.getAnnotationsForNode(nodeId);
            return jsonResponse({ node, backlinks, annotations });
          }

          if (pathname === "/api/search") {
            const q = url.searchParams.get("q");
            if (!q) {
              return jsonResponse({ error: "Missing 'q' parameter" }, 400);
            }
            const limit = parseInt(url.searchParams.get("limit") || "20", 10);
            const results = db.searchConcepts(q).slice(0, limit);
            return jsonResponse({ query: q, results });
          }

          if (pathname === "/api/semantic") {
            const q = url.searchParams.get("q");
            if (!q) {
              return jsonResponse({ error: "Missing 'q' parameter" }, 400);
            }
            const top = parseInt(url.searchParams.get("top") || "10", 10);
            const typeFilter = url.searchParams.get("type") || undefined;
            const results = db.semanticSearch(q, top, typeFilter);
            return jsonResponse({ query: q, results });
          }

          if (pathname === "/api/ask") {
            if (method !== "POST") {
              return jsonResponse({ error: "Method not allowed" }, 405);
            }
            const body = await req.json();
            const question = body.question;
            if (!question) {
              return jsonResponse({ error: "Missing 'question' in body" }, 400);
            }
            const results = db.semanticSearch(question, 5);
            return jsonResponse({
              question,
              context: results.map((r: any) => ({
                id: r.node_id,
                label: r.node?.label,
                type: r.node?.type,
                file_path: r.node?.file_path,
                score: r.score
              })),
              suggestions: [
                "Use /api/nodes/:id for details",
                "Use /api/nodes/:id/backlinks for reverse deps",
                "Use /api/impact?id=... for blast radius"
              ]
            });
          }

          if (pathname === "/api/backlinks") {
            const id = url.searchParams.get("id");
            if (!id) {
              return jsonResponse({ error: "Missing 'id' parameter" }, 400);
            }
            const depth = parseInt(url.searchParams.get("depth") || "1", 10);
            const backlinks = db.getBacklinks(id, depth);
            return jsonResponse({ id, depth, backlinks });
          }

          if (pathname === "/api/impact") {
            const id = url.searchParams.get("id");
            if (!id) {
              return jsonResponse({ error: "Missing 'id' parameter" }, 400);
            }
            const allEdges = db.getAllEdges();
            const allNodes = db.getAllNodes();
            const nodeMap = new Map(allNodes.map((n: any) => [n.id, n]));
            
            const visited = new Set<string>();
            const queue = [id];
            visited.add(id);
            const layers: Map<number, string[]> = new Map();
            let depth = 0;

            while (queue.length > 0) {
              const nextQueue: string[] = [];
              const currentLayer: string[] = [];
              for (const current of queue) {
                currentLayer.push(current);
                const reverseDeps = allEdges.filter((e: any) =>
                  e.to_id === current && !e.from_id.startsWith("2026-")
                );
                for (const edge of reverseDeps) {
                  if (!visited.has(edge.from_id)) {
                    visited.add(edge.from_id);
                    nextQueue.push(edge.from_id);
                  }
                }
              }
              if (currentLayer.length > 0) {
                layers.set(depth, currentLayer);
              }
              depth++;
              queue.length = 0;
              queue.push(...nextQueue);
            }

            const result = {
              target: id,
              total_affected: visited.size - 1,
              layers: Array.from(layers.entries()).map(([d, ids]) => ({
                depth: d,
                nodes: ids.map(id => ({ id, type: nodeMap.get(id)?.type }))
              }))
            };
            return jsonResponse(result);
          }

          if (pathname === "/api/export") {
            const format = url.searchParams.get("format") || "json";
            const filterType = url.searchParams.get("filter") || undefined;
            
            if (format === "json") {
              const data = db.exportJSON(filterType);
              return jsonResponse(data);
            }
            if (format === "graphml") {
              const xml = db.exportGraphML();
              return new Response(xml, {
                headers: { "Content-Type": "application/xml" }
              });
            }
            if (format === "gexf") {
              const xml = db.exportGEXF();
              return new Response(xml, {
                headers: { "Content-Type": "application/xml" }
              });
            }
            return jsonResponse({ error: "Invalid format" }, 400);
          }

          if (pathname === "/api/stats") {
            const stats = db.count();
            const nodes = db.getAllNodes();
            const edges = db.getAllEdges();
            const byType = new Map<string, number>();
            for (const n of nodes) {
              byType.set(n.type, (byType.get(n.type) || 0) + 1);
            }
            const byEdgeType = new Map<string, number>();
            for (const e of edges) {
              byEdgeType.set(e.type, (byEdgeType.get(e.type) || 0) + 1);
            }
            return jsonResponse({
              total: stats,
              nodes_by_type: Object.fromEntries(byType),
              edges_by_type: Object.fromEntries(byEdgeType)
            });
          }

          if (pathname === "/api/analytics") {
            const analytics = db.computeAnalytics();
            return jsonResponse(analytics);
          }

          if (pathname.startsWith("/api/summarize/")) {
            const nodeId = decodeURIComponent(pathname.replace("/api/summarize/", ""));
            const result = db.generateSummary(nodeId);
            if (!result) {
              return jsonResponse({ error: "Node not found" }, 404);
            }
            return jsonResponse(result);
          }

          if (pathname === "/api/webhook/git-push") {
            if (readOnly) {
              return jsonResponse({ error: "Read-only mode" }, 403);
            }
            if (method !== "POST") {
              return jsonResponse({ error: "Method not allowed" }, 405);
            }
            const body = await req.json();
            console.log(`[webhook] Git push received:`, body.ref);
            return jsonResponse({ 
              status: "received", 
              message: "Rebuild triggered (not implemented)"
            });
          }

          if (pathname === "/") {
            const htmlPath = path.join(projectPath, ".omnigraph", "index.html");
            if (Bun.file(htmlPath).exists) {
              const html = await Bun.file(htmlPath).text();
              return new Response(html, {
                headers: { "Content-Type": "text/html" }
              });
            }
            return new Response("Graph visualization not found. Run 'omnigraph build' first.", { status: 404 });
          }

          return new Response("Not found", { status: 404 });
        } catch (err) {
          return jsonResponse({ error: (err as Error).message }, 500);
        }
      }
    });

    process.on("SIGINT", () => {
      console.log("\n👋 Shutting down...");
      server.stop();
      process.exit(0);
    });
  }

  private checkDB(dbPath: string): boolean {
    if (!Bun.file(dbPath).exists) {
      console.error("DB not found. Run 'omnigraph build' first.");
      process.exit(1);
    }
    return true;
  }
}

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
