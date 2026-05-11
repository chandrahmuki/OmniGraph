# OmniGraph — Technical Guidelines

## Code Organization Standards

### File Size Limits

| Component | Max Lines | Action Required |
|-----------|-----------|-----------------|
| Source files (`.ts`) | 500 | Refactor if exceeded |
| CLI entry point | 800 | Extract commands to modules |
| Database class | 600 | Split by feature |
| Extractor modules | 400 | Split by entity type |
| Functions | 50 | Extract sub-functions |
| Test files | 300 | Split by test suite |

**Current violations:**
- `omnigraph.ts`: 2286 lines ❌ (target: 800)
- `extractors/tree-sitter.ts`: 1418 lines ❌ (target: 400)
- `extractors/memory.ts`: 849 lines ❌ (target: 400)
- `db.ts`: 888 lines ❌ (target: 600)

---

## Architecture Principles

### 1. Single Responsibility Principle (SRP)

**Rule:** Each module/class/function has ONE reason to change.

**Examples:**
```typescript
// ❌ BAD: CLI + business logic mixed
case "build": {
  // 100 lines of scanning, DB ops, HTML generation
}

// ✅ GOOD: Delegate to specialized module
case "build": {
  await buildCommand.run(projectPath, { incremental });
}
```

### 2. Command Pattern for CLI

**Structure:**
```
commands/
  build.ts       # BuildCommand class
  query.ts       # QueryCommand class
  cleanup.ts     # CleanupCommand class
  ...
```

**Interface:**
```typescript
interface Command {
  name: string;
  description: string;
  run(args: string[], options: Options): Promise<void>;
}
```

### 3. Layered Architecture

```
┌─────────────────────────────────────┐
│ CLI Layer (omnigraph.ts)            │  ← Router only, no business logic
│   - Parse args                      │
│   - Dispatch to commands            │
│   - Format output                   │
├─────────────────────────────────────┤
│ Command Layer (commands/*.ts)       │  ← Business logic orchestration
│   - Validate input                  │
│   - Call services                   │
│   - Handle errors                   │
├─────────────────────────────────────┤
│ Service Layer (services/*.ts)       │  ← Core business logic
│   - GraphService                    │
│   - ScanService                     │
│   - MemoryService                   │
│   - SemanticService                 │
├─────────────────────────────────────┤
│ Data Access Layer                   │  ← DB operations only
│   - GraphDB (db.ts)                 │
│   - Repositories                    │
├─────────────────────────────────────┤
│ Extractors (extractors/*.ts)        │  ← File parsing only
│   - generic.ts                      │
│   - tree-sitter.ts                  │
│   - memory.ts                       │
│   - git.ts                          │
└─────────────────────────────────────┘
```

---

## Code Quality Rules

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Files | `kebab-case.ts` | `build-command.ts` |
| Classes | `PascalCase` | `GraphDB`, `BuildCommand` |
| Functions | `camelCase` | `scanAndExtract`, `cleanupDeadNodes` |
| Interfaces | `PascalCase` | `Node`, `Edge`, `Command` |
| Constants | `UPPER_SNAKE` | `BATCH_SIZE`, `STOP_WORDS` |
| Private | `_prefix` | `_mtimeMs`, `_prepareStatements` |

### Function Signatures

```typescript
// ❌ BAD: Too many parameters
function buildGraph(
  projectPath: string,
  dbPath: string,
  htmlPath: string,
  incremental: boolean,
  verbose: boolean,
  config?: Config
)

// ✅ GOOD: Options object
interface BuildOptions {
  incremental: boolean;
  verbose?: boolean;
  config?: Config;
}

function buildGraph(
  projectPath: string,
  options: BuildOptions
)
```

### Error Handling

```typescript
// ❌ BAD: Silent failure without context
try {
  riskyOperation();
} catch {}

// ✅ GOOD: Log with context
try {
  riskyOperation();
} catch (error) {
  console.warn(`[build] Failed to ${operation}: ${error.message}`);
  // Continue if non-fatal
}

// ✅ GOOD: Re-throw with context
try {
  riskyOperation();
} catch (error) {
  throw new BuildError(`Failed to ${operation}: ${error.message}`, error);
}
```

### Type Safety

```typescript
// ❌ BAD: Any everywhere
function process(node: any): any {
  return node.data as any;
}

// ✅ GOOD: Explicit types
interface ProcessResult {
  nodes: Node[];
  edges: Edge[];
}

function process(node: Node): ProcessResult {
  return { nodes: [...], edges: [...] };
}
```

---

## Refactoring Guidelines

### When to Refactor

**Triggers:**
- File > 500 lines
- Function > 50 lines
- Nested conditionals > 3 levels
- Duplicate code (3+ occurrences)
- "God class" with multiple responsibilities
- Test is hard to write

### Refactoring Patterns

#### 1. Extract Command

**Before:**
```typescript
// omnigraph.ts:2000 lines
case "cleanup": {
  // 50 lines of logic
}
case "orphans": {
  // 50 lines of logic
}
```

**After:**
```typescript
// commands/cleanup.ts
export class CleanupCommand implements Command {
  async run(args: string[], options: Options) {
    // 50 lines isolated here
  }
}

// omnigraph.ts
case "cleanup": {
  await new CleanupCommand().run(args, options);
}
```

#### 2. Extract Service

**Before:**
```typescript
// db.ts:800 lines
class GraphDB {
  // DB ops + analytics + export + semantic search
}
```

**After:**
```typescript
// db.ts
class GraphDB {
  // Only CRUD operations
}

// services/analytics-service.ts
class AnalyticsService {
  constructor(private db: GraphDB) {}
  computeAnalytics() { /* ... */ }
}
```

#### 3. Extract Strategy

**Before:**
```typescript
// extract.ts
if (isTreeSitterReady()) {
  // 100 lines
} else {
  // 100 lines
}
```

**After:**
```typescript
// extractors/strategy.ts
interface ExtractionStrategy {
  extract(content: string, path: string): ExtractionResult;
}

class TreeSitterStrategy implements ExtractionStrategy { /* ... */ }
class RegexStrategy implements ExtractionStrategy { /* ... */ }
```

---

## Testing Standards

### Test File Structure

```typescript
describe('CleanupCommand', () => {
  describe('run()', () => {
    it('removes dead references', async () => {
      // Arrange
      // Act
      // Assert
    });

    it('removes orphan nodes', async () => {
      // ...
    });

    it('vacuums database when requested', async () => {
      // ...
    });
  });
});
```

### Coverage Requirements

| Component | Min Coverage |
|-----------|--------------|
| Commands | 90% |
| Services | 85% |
| Extractors | 80% |
| DB layer | 95% |
| CLI router | 70% |

---

## Documentation Standards

### Code Comments

```typescript
// ❌ BAD: What the code does
// Loop through nodes
for (const node of nodes) {
  // Delete node
  db.deleteNode(node);
}

// ✅ GOOD: Why the code does it
// Remove orphaned nodes to prevent memory leaks
// These nodes have no edges and are not session/lesson types
for (const node of nodes) {
  if (isOrphan(node) && !isPreservedType(node)) {
    db.deleteNode(node);
  }
}
```

### JSDoc for Public APIs

```typescript
/**
 * Remove dead nodes (files that no longer exist) and orphans.
 * 
 * @param projectPath - Root path to resolve file paths against
 * @returns Statistics about removed nodes
 * 
 * @example
 * ```typescript
 * const stats = db.cleanupDeadNodes('/path/to/project');
 * console.log(`Removed ${stats.removed} dead, ${stats.orphans} orphans`);
 * ```
 */
cleanupDeadNodes(projectPath: string): { removed: number; orphans: number }
```

---

## Performance Guidelines

### Database Operations

```typescript
// ❌ BAD: N+1 queries
for (const node of nodes) {
  const edges = db.getEdgesForNode(node.id);
}

// ✅ GOOD: Batch operations
const allEdges = db.getAllEdges();
const edgesByNode = groupBy(allEdges, 'from_id');
```

### Batch Inserts

```typescript
// ❌ BAD: One query per item
for (const node of nodes) {
  db.insertNode(node);
}

// ✅ GOOD: Single transaction
db.beginTransaction();
db.insertNodesBatch(nodes);
db.commitTransaction();
```

---

## Git & Commit Standards

### Commit Message Format

```
<type>: <subject>

<body>

<footer>
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `refactor`: Code restructuring (no behavior change)
- `docs`: Documentation only
- `test`: Test additions/changes
- `chore`: Build/config changes

**Example:**
```
refactor: extract cleanup command from omnigraph.ts

- Move cleanup logic to commands/cleanup-command.ts
- Add CleanupCommand class implementing Command interface
- Reduce omnigraph.ts from 2286 to 1800 lines

Breaks: none
Refs: #142
```

### Branch Naming

```
feat/<description>
fix/<description>
refactor/<description>
docs/<description>
```

---

## Code Review Checklist

- [ ] File size < 500 lines (or justified exception)
- [ ] Function size < 50 lines
- [ ] No `as any` without comment explaining why
- [ ] Error handling present and appropriate
- [ ] Types are explicit (interfaces for complex objects)
- [ ] No duplicate code (DRY)
- [ ] Single responsibility per module/class
- [ ] Tests updated/added
- [ ] Documentation updated if public API changed
- [ ] Commit message follows format

---

## Migration Plan: omnigraph.ts Refactor

### Phase 1: Extract Commands (Priority: HIGH)

| Command | Lines | New File | Status |
|---------|-------|----------|--------|
| build | 30 | `commands/build-command.ts` | ⏳ |
| save | 130 | `commands/save-command.ts` | ⏳ |
| query | 50 | `commands/query-command.ts` | ⏳ |
| cleanup | 30 | `commands/cleanup-command.ts` | ✅ Done |
| orphans | 50 | `commands/orphans-command.ts` | ⏳ |
| ... | ... | ... | ⏳ |

### Phase 2: Extract Services (Priority: MEDIUM)

| Service | Responsibility | New File |
|---------|----------------|----------|
| GraphService | Node/edge operations | `services/graph-service.ts` |
| ScanService | File scanning | `services/scan-service.ts` |
| MemoryService | Session/lesson extraction | `services/memory-service.ts` |
| SemanticService | BM25 search | `services/semantic-service.ts` |

### Phase 3: Type Safety (Priority: MEDIUM)

- Replace all `as any` with proper interfaces
- Add generics where appropriate
- Strict null checks

### Phase 4: Performance (Priority: LOW)

- Profile slow commands
- Add missing indexes
- Optimize N+1 queries

---

## Enforcement

### Pre-commit Hook

```bash
#!/bin/bash
# Check file sizes
for file in $(git diff --cached --name-only); do
  lines=$(wc -l < "$file")
  if [ $lines -gt 500 ]; then
    echo "⚠️  $file has $lines lines (max: 500)"
    echo "   Consider refactoring before commit"
  fi
done
```

### CI Checks (Future)

- File size limits
- Type check strictness
- Test coverage minimum
- Linting rules

---

## References

- [Clean Code by Robert Martin](https://www.amazon.com/Clean-Code-Handbook-Software-Craftsmanship/dp/0132350882)
- [Refactoring by Martin Fowler](https://www.amazon.com/Refactoring-Improving-Design-Existing-Code/dp/0134757599)
- [TypeScript Deep Dive](https://basarat.gitbook.io/typescript/)
- [Command Pattern](https://refactoring.guru/design-patterns/command)
