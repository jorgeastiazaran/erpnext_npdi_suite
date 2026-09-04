/**
 * previewScheduler.ts — Lightweight Forward-Pass Scheduler for Project Creation Preview
 *
 * Computes estimated plan dates for template tasks purely on the client side.
 * Used exclusively in the ProjectCreationModal to give a live preview of the
 * project timeline as the user tweaks durations and skips tasks.
 *
 * This does NOT replace the server-side CPM engine — the real scheduling
 * happens in Frappe after the project is created.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PreviewTaskInput {
  id: string;
  durationDays: number;
  dependencies: string[];   // IDs of tasks this one depends on
  parentId: string | null;
  isSkipped: boolean;
}

export interface PreviewTaskOutput {
  id: string;
  planStartDate: Date;
  planEndDate: Date;
  isParent: boolean;
}

export interface PreviewSchedulerResult {
  tasks: Map<string, PreviewTaskOutput>;
  estimatedEndDate: Date;
  totalDurationDays: number;
  hasCircularDependency: boolean;
  circularTasks: string[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Add calendar days to a date. */
export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/** Difference in calendar days between two dates. */
export function diffDays(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));
}

function maxDate(...dates: Date[]): Date {
  return new Date(Math.max(...dates.map(d => d.getTime())));
}

function minDate(...dates: Date[]): Date {
  return new Date(Math.min(...dates.map(d => d.getTime())));
}

// ─── Topological Sort ─────────────────────────────────────────────────────────

function topologicalSort(
  taskIds: string[],
  depsMap: Map<string, string[]>
): { sorted: string[]; hasCircularDependency: boolean; circularTaskIds: string[] } {
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const id of taskIds) {
    inDegree.set(id, 0);
    adjacency.set(id, []);
  }

  for (const id of taskIds) {
    const deps = depsMap.get(id) || [];
    inDegree.set(id, deps.length);
    for (const depId of deps) {
      if (adjacency.has(depId)) {
        adjacency.get(depId)!.push(id);
      }
    }
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  const sorted: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    sorted.push(id);
    for (const successor of (adjacency.get(id) || [])) {
      const newDeg = (inDegree.get(successor) || 1) - 1;
      inDegree.set(successor, newDeg);
      if (newDeg === 0) queue.push(successor);
    }
  }

  const hasCircularDependency = sorted.length !== taskIds.length;
  const circularTaskIds: string[] = [];
  if (hasCircularDependency) {
    const sortedSet = new Set(sorted);
    for (const id of taskIds) {
      if (!sortedSet.has(id)) {
        circularTaskIds.push(id);
      }
    }
    console.warn('PreviewScheduler: circular dependency detected, some tasks unscheduled:', circularTaskIds);
  }

  return { sorted, hasCircularDependency, circularTaskIds };
}

// ─── Main Scheduler ───────────────────────────────────────────────────────────

/**
 * Runs a forward-pass scheduler on template tasks for preview purposes.
 *
 * @param startDate  - The project start date.
 * @param inputTasks - Flat array of all template tasks (including parents).
 * @returns A PreviewSchedulerResult with computed dates for each task.
 */
export function runPreviewScheduler(
  startDate: Date,
  inputTasks: PreviewTaskInput[]
): PreviewSchedulerResult {
  const normalizedStart = new Date(startDate);
  normalizedStart.setHours(0, 0, 0, 0);

  // Identify parents and children
  const parentIds = new Set<string>();
  const childrenByParent = new Map<string, string[]>();
  const taskMap = new Map<string, PreviewTaskInput>();

  for (const t of inputTasks) {
    taskMap.set(t.id, t);
    if (t.parentId) {
      parentIds.add(t.parentId);
      const existing = childrenByParent.get(t.parentId) || [];
      existing.push(t.id);
      childrenByParent.set(t.parentId, existing);
    }
  }
  // Also mark tasks that have children
  for (const t of inputTasks) {
    if (childrenByParent.has(t.id)) {
      parentIds.add(t.id);
    }
  }

  // ── Dependency Propagation ──────────────────────────────────────────────
  const propagatedDeps = new Map<string, Set<string>>();

  for (const t of inputTasks) {
    if (t.isSkipped) continue;
    propagatedDeps.set(t.id, new Set(t.dependencies));
  }

  for (const t of inputTasks) {
    if (t.isSkipped) continue;
    const deps = propagatedDeps.get(t.id);
    if (!deps) continue;

    // Inherit parent's dependencies
    if (t.parentId && propagatedDeps.has(t.parentId)) {
      const parentDeps = propagatedDeps.get(t.parentId)!;
      parentDeps.forEach(d => deps.add(d));
    }

    // Expand parent dependencies to their children
    const expandedDeps = new Set<string>();
    deps.forEach(depId => {
      if (childrenByParent.has(depId)) {
        const children = childrenByParent.get(depId)!;
        children.forEach(c => expandedDeps.add(c));
      } else {
        expandedDeps.add(depId);
      }
    });
    propagatedDeps.set(t.id, expandedDeps);
  }

  // Build leaf task list and final deps map
  const leafTaskIds: string[] = [];
  const depsMap = new Map<string, string[]>();

  for (const t of inputTasks) {
    if (t.isSkipped) continue;
    if (parentIds.has(t.id)) continue;

    leafTaskIds.push(t.id);
    const finalDeps = Array.from(propagatedDeps.get(t.id) || [])
      .filter(depId => {
        const dep = taskMap.get(depId);
        return dep && !dep.isSkipped && !parentIds.has(depId);
      });
    depsMap.set(t.id, finalDeps);
  }

  // ── Forward Pass ──────────────────────────────────────────────────────────

  const { sorted, hasCircularDependency, circularTaskIds } = topologicalSort(leafTaskIds, depsMap);

  const earlyStart = new Map<string, Date>();
  const earlyFinish = new Map<string, Date>();

  for (const id of sorted) {
    const task = taskMap.get(id)!;
    const deps = depsMap.get(id) || [];

    let es: Date;
    if (deps.length === 0) {
      es = new Date(normalizedStart);
    } else {
      const depFinishes = deps
        .filter(d => earlyFinish.has(d))
        .map(d => earlyFinish.get(d)!);
      es = depFinishes.length > 0 ? maxDate(...depFinishes) : new Date(normalizedStart);
    }

    const ef = addDays(es, task.durationDays);

    earlyStart.set(id, es);
    earlyFinish.set(id, ef);
  }

  // ── Parent Task Aggregation ───────────────────────────────────────────────

  const parentStart = new Map<string, Date>();
  const parentFinish = new Map<string, Date>();

  for (const [pId, childIds] of childrenByParent) {
    const validChildren = childIds.filter(c => earlyStart.has(c));
    if (validChildren.length === 0) continue;

    const starts = validChildren.map(c => earlyStart.get(c)!);
    const finishes = validChildren.map(c => earlyFinish.get(c)!);

    parentStart.set(pId, minDate(...starts));
    parentFinish.set(pId, maxDate(...finishes));
  }

  // ── Build Output ──────────────────────────────────────────────────────────

  const results = new Map<string, PreviewTaskOutput>();

  // Leaf tasks
  for (const id of leafTaskIds) {
    const es = earlyStart.get(id) || normalizedStart;
    const ef = earlyFinish.get(id) || normalizedStart;
    results.set(id, { id, planStartDate: es, planEndDate: ef, isParent: false });
  }

  // Parent tasks
  for (const [pId] of childrenByParent) {
    const ps = parentStart.get(pId);
    const pf = parentFinish.get(pId);
    if (ps && pf) {
      results.set(pId, { id: pId, planStartDate: ps, planEndDate: pf, isParent: true });
    }
  }

  // Skipped tasks — give them the start date as both start/end
  for (const t of inputTasks) {
    if (t.isSkipped && !results.has(t.id)) {
      results.set(t.id, {
        id: t.id,
        planStartDate: new Date(normalizedStart),
        planEndDate: new Date(normalizedStart),
        isParent: false,
      });
    }
  }

  // Compute estimated end date
  const allFinishes = [
    ...Array.from(earlyFinish.values()),
    ...Array.from(parentFinish.values()),
  ];
  const estimatedEndDate = allFinishes.length > 0
    ? maxDate(...allFinishes)
    : addDays(normalizedStart, 1);

  const totalDurationDays = diffDays(estimatedEndDate, normalizedStart);

  return {
    tasks: results,
    estimatedEndDate,
    totalDurationDays,
    hasCircularDependency,
    circularTasks: circularTaskIds,
  };
}
