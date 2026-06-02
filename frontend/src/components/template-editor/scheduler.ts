/**
 * scheduler.ts — Forward Scheduler with Critical Path Method (CPM)
 *
 * Calculates plan dates for all tasks using forward scheduling from a start date,
 * then performs a backward pass to compute slack and identify the critical path.
 *
 * Features:
 * - Forward pass: earliest start/finish dates
 * - Parent task aggregation: derived from children's span
 * - Backward pass: latest start/finish dates
 * - Slack = lateStart - earlyStart (wiggle room)
 * - Critical path = tasks with slack === 0
 * - Overdue handling: uses `today` for overdue incomplete tasks
 * - Early completion: uses actual completion date for finished tasks
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SchedulerTaskInput {
  id: string;
  durationDays: number;
  dependencies: string[];   // IDs of tasks this depends on
  parentId?: string | null;
  status?: string;          // 'Completed', 'Pending', etc.
  completedAt?: Date | null;        // legacy – kept for compatibility
  actualCompletedDate?: Date | null; // from DB schema (Phase 6A)
  isSkipped?: boolean;
  isFixed?: boolean;
  manualStartDate?: Date | null;
}

export interface SchedulerTaskOutput {
  id: string;
  planStartDate: Date;
  planEndDate: Date;
  lateStartDate: Date;
  lateEndDate: Date;
  slack: number;            // days of wiggle room
  isCriticalPath: boolean;
  isParent: boolean;
}

export interface SchedulerResult {
  tasks: Map<string, SchedulerTaskOutput>;
  targetLaunchDate: Date;
  criticalPathLength: number; // total days of the critical path
}

export function calculateTemplateSchedule(flatTasks: any[]) {
  const startDate = new Date();
  startDate.setHours(0,0,0,0);

  const schedulerInput: SchedulerTaskInput[] = flatTasks.map(t => ({
    id: t.id,
    durationDays: t.durationDays || 1,
    dependencies: t.dependsOn?.map((d: any) => d.dependsOnId || d.dependsOn?.id).filter(Boolean) || [],
    parentId: t.parentId,
    status: 'Pending',
    completedAt: null,
    isSkipped: false,
  }));

  const result = runScheduler(startDate, schedulerInput);
  
  // Map result back to a format similar to what we had (Map<id, {startDay, endDay, slack}>)
  const memo = new Map<string, any>();
  result.tasks.forEach((val, key) => {
    const startDay = diffDays(val.planStartDate, startDate);
    const endDay = diffDays(val.planEndDate, startDate);
    memo.set(key, { 
      startDay, 
      endDay, 
      slack: val.slack,
      isCriticalPath: val.isCriticalPath 
    });
  });

  return memo;
}

// ─── Work Calendar Types ──────────────────────────────────────────────────────

export interface WorkCalendarConfig {
  workDays: number[];       // 1=Mon … 7=Sun (ISO)
  holidays: string[];       // ISO date strings 'YYYY-MM-DD'
}

export const DEFAULT_WORK_CALENDAR: WorkCalendarConfig = {
  workDays: [1, 2, 3, 4, 5],
  holidays: [],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function diffDays(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));
}

function maxDate(...dates: Date[]): Date {
  return new Date(Math.max(...dates.map(d => d.getTime())));
}

function minDate(...dates: Date[]): Date {
  return new Date(Math.min(...dates.map(d => d.getTime())));
}

/**
 * Returns true if the given date is a working day according to the calendar.
 * JS getDay() returns 0=Sun, 1=Mon … 6=Sat; we convert to ISO 1=Mon … 7=Sun.
 */
export function isWorkDay(date: Date, cal: WorkCalendarConfig): boolean {
  const jsDay = date.getDay(); // 0=Sun
  const isoDay = jsDay === 0 ? 7 : jsDay; // convert Sun to 7
  if (!cal.workDays.includes(isoDay)) return false;

  const iso = date.toISOString().split('T')[0];
  if (cal.holidays.includes(iso)) return false;

  return true;
}

/**
 * Advances a date by `n` working days, skipping weekends and holidays.
 * If n === 0 returns the same date (or advances to next work day if it's not one).
 */
export function addWorkDays(date: Date, days: number, cal: WorkCalendarConfig): Date {
  if (days === 0) return date;
  let result = new Date(date);
  let remaining = Math.abs(days);
  const direction = days > 0 ? 1 : -1;

  while (remaining > 0) {
    result = addDays(result, direction);
    if (isWorkDay(result, cal)) remaining--;
  }
  return result;
}

/**
 * Counts working days between two dates (exclusive of start, inclusive of end).
 */
export function diffWorkDays(start: Date, end: Date, cal: WorkCalendarConfig): number {
  if (start >= end) return 0;
  let count = 0;
  let current = new Date(start);
  while (current < end) {
    current = addDays(current, 1);
    if (isWorkDay(current, cal)) count++;
  }
  return count;
}


// ─── Duration Formatting ──────────────────────────────────────────────────────

export function formatDurationHuman(days: number): string {
  if (days <= 0) return '0 días';
  if (days >= 30) {
    const months = Math.floor(days / 30);
    const remaining = days % 30;
    const weeks = Math.floor(remaining / 7);
    let result = `${months} mes${months !== 1 ? 'es' : ''}`;
    if (weeks > 0) result += ` ${weeks} sem`;
    return result;
  }
  if (days >= 7) {
    const weeks = Math.floor(days / 7);
    const remaining = days % 7;
    let result = `${weeks} sem`;
    if (remaining > 0) result += ` ${remaining}d`;
    return result;
  }
  return `${days} día${days !== 1 ? 's' : ''}`;
}

// ─── Topological Sort ─────────────────────────────────────────────────────────

function topologicalSort(
  taskIds: number[],
  depsMap: Map<string, number[]>
): number[] {
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, number[]>(); // dependsOn → successor

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

  const queue: number[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  const sorted: number[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    sorted.push(id);
    for (const successor of (adjacency.get(id) || [])) {
      const newDeg = (inDegree.get(successor) || 1) - 1;
      inDegree.set(successor, newDeg);
      if (newDeg === 0) queue.push(successor);
    }
  }

  if (sorted.length !== taskIds.length) {
    console.warn('Scheduler: circular dependency detected. Some tasks could not be scheduled.');
  }

  return sorted;
}

// ─── Main Scheduler ───────────────────────────────────────────────────────────

export function runScheduler(
  startDate: Date,
  inputTasks: SchedulerTaskInput[],
  today?: Date, // for overdue recalculation
  workCalendar?: WorkCalendarConfig // Phase 6B/C: work calendar integration
): SchedulerResult {
  const now = today || new Date();
  const cal = workCalendar || DEFAULT_WORK_CALENDAR;

  // Separate parents and leaf tasks
  const parentIds = new Set<string>();
  const childrenByParent = new Map<string, number[]>();

  for (const t of inputTasks) {
    if (t.parentId) {
      parentIds.add(t.parentId);
      const existing = childrenByParent.get(t.parentId) || [];
      existing.push(t.id);
      childrenByParent.set(t.parentId, existing);
    }
  }

  // Mark parents
  for (const t of inputTasks) {
    if (childrenByParent.has(t.id)) {
      parentIds.add(t.id);
    }
  }

  // Build task lookup
  const taskMap = new Map<string, SchedulerTaskInput>();
  for (const t of inputTasks) {
    taskMap.set(t.id, t);
  }

  // ── Dependency Propagation ──────────────────────────────────────────────
  // If a parent depends on X, all its children depend on X.
  // If Y depends on a parent, Y depends on all children of that parent.
  const propagatedDeps = new Map<string, Set<string>>();
  
  for (const t of inputTasks) {
    if (t.isSkipped) continue;
    const deps = new Set(t.dependencies);
    propagatedDeps.set(t.id, deps);
  }

  // Simple propagation (one level for now as per schema)
  for (const t of inputTasks) {
    if (t.isSkipped) continue;
    const deps = propagatedDeps.get(t.id)!;
    
    // 1. If this task has a parent, and the parent has dependencies, inherit them
    if (t.parentId && propagatedDeps.has(t.parentId)) {
      const parentDeps = propagatedDeps.get(t.parentId)!;
      parentDeps.forEach(d => deps.add(d));
    }

    // 2. If this task depends on a parent, replace that dependency with all children of that parent
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

  // Build dependency map (only for leaf tasks)
  const leafTaskIds: number[] = [];
  const depsMap = new Map<string, number[]>();

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

  const sorted = topologicalSort(leafTaskIds, depsMap);

  const earlyStart = new Map<string, Date>();
  const earlyFinish = new Map<string, Date>();

  for (const id of sorted) {
    const task = taskMap.get(id)!;
    const deps = depsMap.get(id) || [];

    // Determine earliest start
    let es: Date;
    
    if (task.isFixed && task.manualStartDate) {
      es = new Date(task.manualStartDate);
    } else {
      let depEs: Date;
      if (deps.length === 0) {
        depEs = new Date(startDate);
      } else {
        const depFinishes = deps
          .filter(d => earlyFinish.has(d))
          .map(d => earlyFinish.get(d)!);
        depEs = depFinishes.length > 0 ? maxDate(...depFinishes) : new Date(startDate);
      }

      // Use manualStartDate as a "no earlier than" constraint (delayed start)
      if (task.manualStartDate) {
        es = maxDate(depEs, new Date(task.manualStartDate));
      } else {
        es = depEs;
      }

    // Overdue handling: if task is not completed and its planned end < today,
      // push start to today (next working day)
      if (task.status !== 'Completed' && task.status !== 'Skipped') {
        const plannedEnd = addWorkDays(es, task.durationDays, cal);
        if (plannedEnd < now) {
          // Find next working day from today
          let overdueStart = new Date(now);
          while (!isWorkDay(overdueStart, cal)) {
            overdueStart = addDays(overdueStart, 1);
          }
          es = overdueStart;
        }
      }
    }

    // Early completion: use actualCompletedDate (Phase 6A) or legacy completedAt
    const completionDate = task.actualCompletedDate || task.completedAt;
    let ef: Date;
    if (task.status === 'Completed' && completionDate) {
      ef = new Date(completionDate);
      // Recalculate start based on actual finish and work days
      es = addWorkDays(ef, -task.durationDays, cal);
    } else {
      ef = addWorkDays(es, task.durationDays, cal);
    }

    earlyStart.set(id, es);
    earlyFinish.set(id, ef);
  }

  // ── Parent Task Aggregation ───────────────────────────────────────────────

  const parentStart = new Map<string, Date>();
  const parentFinish = new Map<string, Date>();

  for (const [parentId, childIds] of childrenByParent) {
    const validChildren = childIds.filter(c => earlyStart.has(c));
    if (validChildren.length === 0) continue;

    const starts = validChildren.map(c => earlyStart.get(c)!);
    const finishes = validChildren.map(c => earlyFinish.get(c)!);

    parentStart.set(parentId, minDate(...starts));
    parentFinish.set(parentId, maxDate(...finishes));
  }

  // ── Compute target launch date ────────────────────────────────────────────

  const allFinishes: Date[] = [
    ...Array.from(earlyFinish.values()),
    ...Array.from(parentFinish.values()),
  ];

  const targetLaunchDate = allFinishes.length > 0
    ? maxDate(...allFinishes)
    : addWorkDays(startDate, 1, cal);

  // ── Backward Pass ─────────────────────────────────────────────────────────

  // Build successor map
  const successorMap = new Map<string, number[]>();
  for (const id of leafTaskIds) {
    successorMap.set(id, []);
  }
  for (const id of leafTaskIds) {
    const deps = depsMap.get(id) || [];
    for (const depId of deps) {
      if (successorMap.has(depId)) {
        successorMap.get(depId)!.push(id);
      }
    }
  }

  const lateStart = new Map<string, Date>();
  const lateFinish = new Map<string, Date>();

  // Reverse topological order
  const reverseSorted = [...sorted].reverse();

  for (const id of reverseSorted) {
    const task = taskMap.get(id)!;
    const successors = successorMap.get(id) || [];

    // Determine latest finish
    let lf: Date;
    if (successors.length === 0) {
      lf = new Date(targetLaunchDate);
    } else {
      const sucStarts = successors
        .filter(s => lateStart.has(s))
        .map(s => lateStart.get(s)!);
      lf = sucStarts.length > 0 ? minDate(...sucStarts) : new Date(targetLaunchDate);
    }

    const ls = addWorkDays(lf, -task.durationDays, cal);

    lateStart.set(id, ls);
    lateFinish.set(id, lf);
  }

  // ── Build Output ──────────────────────────────────────────────────────────

  const results = new Map<string, SchedulerTaskOutput>();

  // Leaf tasks
  for (const id of leafTaskIds) {
    let es = earlyStart.get(id);
    let ef = earlyFinish.get(id);

    if (!es || !ef) {
      // Fallback for tasks omitted by topological sort (e.g. circular dependency)
      es = new Date(startDate);
      const task = taskMap.get(id);
      ef = addDays(es, task ? task.durationDays : 0);
    }

    const ls = lateStart.get(id) || es;
    const lf = lateFinish.get(id) || ef;
    const slack = Math.max(0, diffWorkDays(es, ls, cal));

    results.set(id, {
      id,
      planStartDate: es,
      planEndDate: ef,
      lateStartDate: ls,
      lateEndDate: lf,
      slack,
      isCriticalPath: slack === 0,
      isParent: false,
    });
  }

  // Parent tasks
  for (const [parentId, childIds] of childrenByParent) {
    const ps = parentStart.get(parentId);
    const pf = parentFinish.get(parentId);
    if (!ps || !pf) continue;

    // Parent slack = min slack of children
    const childSlacks = childIds
      .filter(c => results.has(c))
      .map(c => results.get(c)!.slack);
    const parentSlack = childSlacks.length > 0 ? Math.min(...childSlacks) : 0;

    results.set(parentId, {
      id: parentId,
      planStartDate: ps,
      planEndDate: pf,
      lateStartDate: ps, // parent doesn't have its own late dates
      lateEndDate: pf,
      slack: parentSlack,
      isCriticalPath: parentSlack === 0,
      isParent: true,
    });
  }

  // Critical path length
  const criticalTasks = Array.from(results.values()).filter(t => t.isCriticalPath && !t.isParent);
  const criticalPathLength = criticalTasks.reduce((sum, t) => {
    const task = taskMap.get(t.id);
    return sum + (task?.durationDays || 0);
  }, 0);

  return {
    tasks: results,
    targetLaunchDate,
    criticalPathLength,
  };
}

// ─── Template Scheduler (for preview before instantiation) ────────────────────

export interface TemplateTaskInput {
  id: string;
  durationDays: number;
  dependencies: string[];
  parentId?: string | null;
  module: string;
}

/**
 * Runs the scheduler on template tasks (no status/completion data).
 * Used for:
 * - Template duration badge (critical path length)
 * - Project creation modal preview
 */
export function runTemplateScheduler(
  startDate: Date,
  templateTasks: TemplateTaskInput[],
): SchedulerResult {
  const schedulerInput: SchedulerTaskInput[] = templateTasks.map(t => ({
    id: t.id,
    durationDays: t.durationDays,
    dependencies: t.dependencies,
    parentId: t.parentId,
    status: 'Pending',
    completedAt: null,
    isSkipped: false,
  }));

  return runScheduler(startDate, schedulerInput);
}
