import { GraphDB } from "../db.ts";

export class TimelineCommand {
  async run(
    projectPath: string,
    dbPath: string,
    args: string[],
    _options: {}
  ): Promise<void> {
    if (!this.checkDB(dbPath)) return;

    const target = args[0];
    if (!target) {
      console.log("Usage: omnigraph timeline <file-path>");
      process.exit(1);
    }

    const db = new GraphDB(dbPath);
    const allEdges = db.getAllEdges();
    const allNodes = db.getAllNodes();
    const nodeMap = new Map(allNodes.map((n: any) => [n.id, n]));
    const annotationsByNode = db.getAllAnnotations();

    const events: { date: string; type: string; label: string; nodeId: string; metadata: string }[] = [];

    const changes = allEdges
      .filter(e => e.to_id === target && e.type === "affects")
      .map(e => nodeMap.get(e.from_id))
      .filter(n => n && n.type === "change");

    for (const change of changes) {
      const anns = annotationsByNode.get(change.id) || [];
      const changeType = anns.find(a => a.key === "change_type");
      const date = change.created_at || "unknown";
      const metadata = changeType ? `[${changeType.value}]` : "";
      events.push({ date, type: "CHANGE", label: change.label, nodeId: change.id, metadata });
    }

    const issues = allEdges
      .filter(e => e.to_id === target && e.type === "affects")
      .map(e => nodeMap.get(e.from_id))
      .filter(n => n && n.type === "issue");

    for (const issue of issues) {
      const date = issue.created_at || "unknown";
      events.push({ date, type: "ISSUE", label: issue.label, nodeId: issue.id, metadata: "" });
    }

    const decisions = allEdges
      .filter(e => e.to_id === target && e.type === "applies_to")
      .map(e => nodeMap.get(e.from_id))
      .filter(n => n && n.type === "decision");

    for (const decision of decisions) {
      const date = decision.created_at || "unknown";
      events.push({ date, type: "DECISION", label: decision.label, nodeId: decision.id, metadata: "" });
    }

    const sessions = allEdges
      .filter(e => e.to_id === target && e.type === "session_modified")
      .map(e => nodeMap.get(e.from_id))
      .filter(n => n && n.type === "session");

    for (const session of sessions) {
      const date = session.created_at || "unknown";
      events.push({ date, type: "SESSION", label: session.label, nodeId: session.id, metadata: "" });
    }

    events.sort((a, b) => a.date.localeCompare(b.date));

    console.log(`\n## Timeline: ${target}\n`);
    console.log(`Total events: ${events.length}\n`);

    for (const event of events) {
      const icon = event.type === "CHANGE" ? "📝" : event.type === "ISSUE" ? "⚠️" : event.type === "DECISION" ? "💡" : "📋";
      console.log(`${event.date ? `[${event.date}]` : "[unknown]"} ${icon} ${event.type}: ${event.label.slice(0, 100)}`);
      if (event.metadata) {
        console.log(`    ${event.metadata}`);
      }
    }

    db.close();
  }

  private checkDB(dbPath: string): boolean {
    if (!Bun.file(dbPath).exists) {
      console.error("DB not found. Run 'omnigraph build' first.");
      process.exit(1);
    }
    return true;
  }
}
