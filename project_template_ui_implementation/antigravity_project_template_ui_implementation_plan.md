# Antigravity Implementation Plan: Project Template UI Enhancement
## `erpnext_npdi_suite` — Based on `npdi_app` Reference Analysis

---

## Executive Summary

This plan adapts the rich UI patterns proven in `npdi_app` (Next.js) into the ERPNext v13 Frappe framework using vanilla JS Pages. Four components will be built:

1. **`npdi_template_editor` Page** — Visual tree editor for Project Templates
2. **`npdi_project_from_template` Page** — Live CPM preview before creating a project
3. **Upgraded `npdi_project_dashboard`** — Enhanced task list + Gantt + Task Detail Drawer

All backend logic is in Python (`@frappe.whitelist`). All frontend is vanilla JS + Frappe UI primitives.

---

## Architecture Decisions (from npdi_app Analysis)

### What to Port Directly
From `scheduler.ts` (554 lines): the entire CPM engine — forward pass, backward pass, topological sort, working calendar, parent aggregation — will be rewritten as `public/js/npdi_cpm_scheduler.js` (a shared JS module). This is the heart of the npdi_app and must live client-side for live preview.

### What to Adapt
- `ProjectCreationModal.tsx` → `npdi_project_from_template` Frappe Page
- `GanttView.tsx` → Enhanced Frappe Gantt with stage groups and baseline overlay
- `TaskDetailDrawer.tsx` → Vanilla JS slide-in drawer panel
- `ProjectCreationModal.handleToggleSkip()` → JS skip/restore recursive logic

### Key Differences from npdi_app
| Feature | npdi_app | ERPNext Adaptation |
|---|---|---|
| Rendering | React components | Vanilla JS DOM + `frappe.render_template` |
| State | React useState | JS module-level state objects |
| Gantt | `gantt-task-react` | Frappe Gantt (SVG) + custom overlay |
| Data | Prisma/DB | `frappe.call` → `@frappe.whitelist` |
| Routing | Next.js router | `frappe.set_route` |
| File upload | Next.js API | Frappe File DocType |

---

## Data Model Additions Required

### 1. `Project Template Task` — already has custom fields (via install.py):
`npdi_stage_name`, `npdi_module`, `npdi_responsible_role`, `npdi_requires_attachment`, `npdi_launch_milestone`, `duration`

### 2. NEW: Inter-task dependency for templates
ERPNext v13's `Project Template Task` has no `depends_on` mechanism. We need a new child DocType:

**`NPDI Template Task Dependency`** (new DocType in `erpnext_npdi_suite`):
```
parent        → Link: Project Template (parentfield: npdi_task_dependencies)
task          → Link: Project Template Task (the task that has the dependency)
depends_on    → Link: Project Template Task (the task it depends on)
```

This mirrors how `Task Depends On` works for live Tasks.

---

## Component 1: `npdi_template_editor` Page (Visual Template Editor)

### Purpose
Replace the default `tasks` child table in the Project Template form with a visual, interactive tree editor.

### Files
```
erpnext_npdi_suite/erpnext_npdi_suite/page/
  npdi_template_editor/
    npdi_template_editor.json
    npdi_template_editor.html
    npdi_template_editor.js
    npdi_template_editor.py

erpnext_npdi_suite/public/js/
  npdi_cpm_scheduler.js          ← shared CPM engine (ported from scheduler.ts)
  project_template_form.js       ← Client Script: adds "Open Visual Editor" button
```

### Entry Point
In `hooks.py`, add a doctype JS override:
```python
doctype_js = {
    "Project Template": "public/js/project_template_form.js"
}
```

The `project_template_form.js` adds a button that navigates to:
```javascript
frappe.set_route('npdi-template-editor', { template: frm.doc.name });
```

### Backend APIs (`npdi_template_editor.py`)

```python
@frappe.whitelist()
def get_template_full_data(template):
    """Return tasks, their NPDI fields, dependencies, and parent-child hierarchy."""
    tasks = frappe.get_all("Project Template Task",
        filters={"parent": template},
        fields=["name", "task", "subject", "idx", "npdi_stage_name",
                "npdi_module", "npdi_responsible_role", "npdi_requires_attachment",
                "npdi_launch_milestone", "duration"],
        order_by="idx asc"
    )
    # Fetch inter-task dependencies
    for t in tasks:
        t.depends_on = frappe.get_all("NPDI Template Task Dependency",
            filters={"parent": template, "task": t.name},
            fields=["depends_on"]
        )
    return {"tasks": tasks, "template": frappe.get_doc("Project Template", template).as_dict()}

@frappe.whitelist()
def save_template_tasks(template, tasks_json):
    """Batch save: update durations, stage, module, etc. + rebuild dependencies."""
    import json
    tasks_data = json.loads(tasks_json)
    # ... implementation: update each task, rebuild NPDI Template Task Dependency rows
    frappe.db.commit()
    return {"status": "ok"}
```

### HTML Structure (`npdi_template_editor.html`)
```html
<div class="npdi-template-editor">
  <div class="editor-header">
    <h3 id="editor-title"></h3>
    <div class="editor-actions">
      <button id="btn-add-stage" class="btn btn-sm btn-default">+ Etapa</button>
      <button id="btn-save-all" class="btn btn-sm btn-primary">Guardar</button>
    </div>
  </div>
  <div id="stages-container" class="stages-container">
    <!-- Dynamically populated -->
  </div>
</div>
```

### Stage/Task Tree Rendering (JS)
Adapted from `ProjectCreationModal.renderRecursiveTasks()` and `GanttView` stage headers:

```javascript
function renderStage(stageName, tasks) {
    const stageEl = document.createElement('div');
    stageEl.className = 'npdi-stage-group';
    stageEl.innerHTML = `
        <div class="stage-header" data-stage="${stageName}">
            <span class="chevron">▼</span>
            <span class="stage-name">${stageName}</span>
            <span class="stage-meta">${tasks.length} tareas</span>
            <button class="btn-add-task">+ Tarea</button>
        </div>
        <div class="stage-tasks" id="stage-${stageName}"></div>
    `;
    renderTaskTree(tasks, document.getElementById(`stage-${stageName}`), 0);
    return stageEl;
}

function renderTaskRow(task, level) {
    return `
        <div class="task-row" data-task-id="${task.name}" 
             style="padding-left: ${16 + level * 24}px">
            <span class="toggle-children">${task.children.length ? '▶' : ''}</span>
            <input class="task-name-input" value="${task.subject || ''}">
            <span class="module-badge badge-${task.npdi_module?.toLowerCase()}">${task.npdi_module || 'Core'}</span>
            <input class="duration-input" type="number" min="1" value="${task.duration || 1}"> días
            <span class="dep-chips">${renderDepChips(task.depends_on)}</span>
            <label><input type="checkbox" class="milestone-check" ${task.npdi_launch_milestone ? 'checked' : ''}> Hito</label>
            <button class="btn-add-child">+</button>
            <button class="btn-delete-task">🗑</button>
        </div>
    `;
}
```

### Key JS Patterns
- **Inline editing**: `blur` event on name/duration inputs → mark task as `dirty`, show "Guardar" button highlight
- **Dependency dialog**: `frappe.prompt` with a multi-select list of all tasks; validate DAG (DFS cycle detection) before accepting
- **Stage ordering**: Predefined order `['Idea','Concepto','Desarrollo','Lanzamiento','Post-Lanzamiento']`; unknown stages added at end
- **Add task**: appends new row with default values; new tasks get a local `_new_` ID prefix
- **Delete task**: confirm dialog (`frappe.confirm`), then mark as deleted in local state

---

## Component 2: `npdi_project_from_template` Page (Project Creation Preview)

### Purpose
Full-featured project creation wizard with live CPM preview. Mirrors `ProjectCreationModal.tsx` + `scheduler.ts` from npdi_app.

### Files
```
page/
  npdi_project_from_template/
    npdi_project_from_template.json
    npdi_project_from_template.html
    npdi_project_from_template.js
    npdi_project_from_template.py

public/js/
  npdi_cpm_scheduler.js    ← shared, same file as above
```

Entry: button on Project list view → `frappe.set_route('npdi-project-from-template')`

### Backend APIs (`npdi_project_from_template.py`)

```python
@frappe.whitelist()
def get_template_preview_data(template):
    """All tasks with deps for client-side CPM preview."""
    # Returns full task tree including NPDI custom fields and dependency graph

@frappe.whitelist()
def create_project_from_preview(project_data):
    """
    Creates Project + Tasks from finalized preview config.
    project_data = {
        project_name, template, start_date,
        tasks: [{template_task_id, duration, is_skipped, is_launch_milestone}]
    }
    After creation: runs CPMEngine to set CPM fields on new tasks.
    """
```

### `npdi_cpm_scheduler.js` (Ported from `scheduler.ts`)

Core functions (all vanilla JS):
```javascript
// Topological sort (Kahn's algorithm)
function topologicalSort(taskIds, depsMap) { ... }

// Working day arithmetic
function addWorkDays(date, days, calendar) { ... }

// Forward pass
function forwardPass(sortedIds, taskMap, depsMap, startDate) {
    // ES = max(EF of predecessors) || startDate
    // EF = addWorkDays(ES, duration)
}

// Backward pass
function backwardPass(sortedIds, taskMap, successorMap, projectFinish) {
    // LF = min(LS of successors) || projectFinish
    // LS = addWorkDays(LF, -duration)
    // float = LS - ES (workdays)
}

// Main entry
function runScheduler(startDate, tasks, calendar) {
    // Returns Map<taskId, {es, ef, ls, lf, float, isCritical, isParent}>
}
```

Calendar: weekends-only initially (Sat/Sun skip). Holiday list from ERPNext Holiday List via one API call on page load.

### HTML Structure

```html
<div class="npdi-project-preview">
  <!-- Step 1: Wizard header -->
  <div class="preview-controls card">
    <div class="controls-row">
      <div class="control-group">
        <label>Nombre del Proyecto</label>
        <input id="project-name" class="form-control" placeholder="Nuevo Producto...">
      </div>
      <div class="control-group">
        <label>Plantilla</label>
        <div id="template-selector-wrapper"></div>  <!-- frappe Link control -->
      </div>
      <div class="control-group">
        <label>Fecha de Inicio</label>
        <input id="start-date" type="date" class="form-control">
      </div>
    </div>
    <div class="module-toggles">
      <label>Módulos Activos:</label>
      <label><input type="checkbox" value="Core" checked disabled> Core</label>
      <label><input type="checkbox" class="module-toggle" value="Formula"> Fórmula</label>
      <label><input type="checkbox" class="module-toggle" value="Pack"> Empaque</label>
      <label><input type="checkbox" class="module-toggle" value="Brand"> Marca</label>
    </div>
  </div>

  <!-- Preview table (mirrors ProjectCreationModal) -->
  <div class="preview-table-container card">
    <table class="npdi-preview-table">
      <thead>
        <tr>
          <th>Tarea</th><th>Módulo</th><th>Duración</th>
          <th>Inicio</th><th>Fin</th><th>Lanzamiento</th><th>Acción</th>
        </tr>
      </thead>
      <tbody id="preview-table-body">
        <!-- Populated by JS: stage header rows + task rows -->
      </tbody>
    </table>
  </div>

  <!-- Footer with launch date + confirm -->
  <div class="preview-footer card">
    <div class="launch-date-display">
      <span>📅 Fecha estimada de lanzamiento:</span>
      <strong id="projected-launch-date">—</strong>
    </div>
    <div class="footer-actions">
      <button id="btn-cancel" class="btn btn-default">Cancelar</button>
      <button id="btn-confirm-create" class="btn btn-primary">Confirmar y Crear Proyecto</button>
    </div>
  </div>
</div>
```

### JS State Machine

Mirrors `ProjectCreationModal` state pattern:
```javascript
const state = {
    templateData: null,    // raw from API
    taskConfigs: {},       // {taskId: {isSkipped, duration}}
    launchMilestoneId: null,
    activeModules: { Core: true, Formula: false, Pack: false, Brand: false },
    schedulerResult: null
};

function recalculate() {
    const inputs = buildSchedulerInputs();
    state.schedulerResult = runScheduler(getStartDate(), inputs);
    renderTable();
    updateLaunchDate();
}
```

### Skip Logic (from `ProjectCreationModal.handleToggleSkip`)
```javascript
function toggleSkip(taskId) {
    const newIsSkipped = !isTaskSkipped(taskId);
    state.taskConfigs[taskId] = { ...state.taskConfigs[taskId], isSkipped: newIsSkipped };

    if (newIsSkipped) {
        // Deactivate all descendants
        getDescendants(taskId).forEach(id => setSkipped(id, true));
        // Deactivate parent if all siblings skipped
        checkAndSkipAncestors(taskId);
    } else {
        // Activate all descendants + ancestors
        getDescendants(taskId).forEach(id => setSkipped(id, false));
        getAncestors(taskId).forEach(id => setSkipped(id, false));
    }
    recalculate();
}
```

### Stage Header Rows
```javascript
function renderStageHeaderRow(stageName, stageTaskIds) {
    const results = stageTaskIds.map(id => state.schedulerResult?.tasks.get(id)).filter(Boolean);
    const start = minDate(results.map(r => r.es));
    const end = maxDate(results.map(r => r.ef));
    const days = diffWorkDays(start, end);
    return `<tr class="stage-header-row">
        <td colspan="5"><strong>${stageName}</strong></td>
        <td colspan="2">${formatDate(start)} - ${formatDate(end)} · ${days} días</td>
    </tr>`;
}
```

---

## Component 3: Enhanced `npdi_project_dashboard`

### Subsection A: Task List Tab (upgraded)

Replace existing grid with a **Frappe DataTable** instance with custom cell renderers:

```javascript
const dt = new DataTable('#task-list-wrapper', {
    columns: [
        { id: 'status', name: 'Estado', width: 90,
          format: (value) => `<span class="status-dot dot-${value.toLowerCase()}"></span> ${value}` },
        { id: 'subject', name: 'Tarea', width: 280 },
        { id: 'npdi_module', name: 'Módulo', width: 90,
          format: (value) => `<span class="module-badge badge-${(value||'core').toLowerCase()}">${value||'Core'}</span>` },
        { id: 'npdi_cpm_is_critical', name: '', width: 30,
          format: (value) => value ? '🔥' : '' },
        { id: 'exp_start_date', name: 'Inicio', width: 100 },
        { id: 'exp_end_date', name: 'Fin', width: 100 },
        { id: 'npdi_cpm_total_float', name: 'Holgura (h)', width: 80 }
    ],
    data: [],
    inlineFilters: false,
    noDataMessage: 'Selecciona un proyecto'
});
```

Group rows by `npdi_stage_name` as visual dividers (inject synthetic "group header" rows into data array with `_isGroupHeader: true` and custom formatting).

### Subsection B: Gantt Tab (enhanced)

Keep Frappe Gantt but post-process for NPDI features:

**Critical path coloring**:
```javascript
// After Gantt.init(), find and style bars
function applyGanttStyles(tasks) {
    tasks.forEach(task => {
        if (!task.npdi_cpm_is_critical) return;
        const bar = document.querySelector(`[data-id="${task.name}"] .bar`);
        if (bar) bar.style.fill = '#ef4444';
    });
}
```

**Baseline ghost bars**:
```javascript
// Add extra tasks to Frappe Gantt data with prefix 'bl_' and custom class
const ganttData = tasks.map(t => ({
    id: t.name,
    name: t.subject,
    start: t.exp_start_date,
    end: t.exp_end_date,
    progress: t.status === 'Completed' ? 100 : 0,
    color: t.npdi_cpm_is_critical ? '#ef4444' : undefined
}));

if (showBaseline) {
    tasks.filter(t => t.npdi_baseline_start).forEach(t => {
        ganttData.push({
            id: `bl_${t.name}`,
            name: `[Base] ${t.subject}`,
            start: t.npdi_baseline_start,
            end: t.npdi_baseline_end,
            progress: 100,
            custom_class: 'baseline-bar'
        });
    });
}
```

CSS for baseline bars:
```css
.baseline-bar .bar { fill: rgba(156, 163, 175, 0.3) !important; stroke: #9ca3af; }
.baseline-bar .bar-label { display: none; }
```

**Stage grouping**: Inject synthetic "stage" tasks as project-type rows:
```javascript
const stageMap = groupBy(tasks, t => t.npdi_stage_name || 'General');
Object.entries(stageMap).forEach(([stage, stageTasks]) => {
    const stageStart = minDate(stageTasks.map(t => t.exp_start_date));
    const stageEnd = maxDate(stageTasks.map(t => t.exp_end_date));
    ganttData.unshift({ // Add before stage tasks
        id: `stage_${stage}`,
        name: stage.toUpperCase(),
        start: stageStart,
        end: stageEnd,
        progress: 0,
        custom_class: 'stage-group-bar'
    });
});
```

**View mode toggle**:
```javascript
['Day', 'Week', 'Month'].forEach(mode => {
    $(`#btn-view-${mode.toLowerCase()}`).on('click', () => {
        gantt.change_view_mode(mode);
    });
});
```

### Subsection C: Task Detail Drawer

Slide-in drawer panel, adapted from `TaskDetailDrawer.tsx`:

**CSS**:
```css
.task-detail-drawer {
    position: fixed;
    right: -480px;
    top: 0;
    width: 480px;
    height: 100vh;
    background: var(--fg-color);
    box-shadow: -8px 0 30px rgba(0,0,0,0.15);
    z-index: 1000;
    transition: right 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    overflow-y: auto;
    border-left: 1px solid var(--border-color);
}
.task-detail-drawer.open { right: 0; }
```

**Status buttons** (from npdi_app `STATUS_OPTIONS`):
```javascript
const STATUS_OPTIONS = [
    { value: 'Open', label: 'Abierta', color: '#9ca3af' },
    { value: 'Working', label: 'En curso', color: '#3b82f6' },
    { value: 'Pending Review', label: 'En revisión', color: '#f59e0b' },
    { value: 'Completed', label: 'Completada', color: '#22c55e' },
    { value: 'Cancelled', label: 'Cancelada', color: '#ef4444' }
];
// Note: ERPNext Task uses different status values than npdi_app
```

**Dependency management** (adapted from `TaskDetailDrawer` typeahead):
```javascript
// Simple typeahead using a datalist
async function searchTasks(query, projectName) {
    return frappe.call({
        method: 'frappe.client.get_list',
        args: {
            doctype: 'Task',
            filters: [['project', '=', projectName], ['subject', 'like', `%${query}%`]],
            fields: ['name', 'subject', 'status'],
            limit: 20
        }
    });
}
```

---

## Shared Module: `npdi_cpm_scheduler.js`

This is the most critical shared file. Full port of `scheduler.ts`:

```javascript
// Public API
window.NPDIScheduler = {
    runScheduler,          // main entry
    addWorkDays,           // date utility
    diffWorkDays,          // count working days between dates
    topologicalSort,       // exposed for testing
    formatDurationHuman    // '14 días' → '2 sem'
};
```

---

## Backend: `erpnext_npdi_suite/api.py`

Central API file:
```python
import frappe, json
from erpnext_npdi_suite.erpnext_npdi_suite.engine.cpm import CPMEngine

@frappe.whitelist()
def get_template_full_data(template): ...

@frappe.whitelist()
def save_template_tasks(template, tasks_json): ...

@frappe.whitelist()
def create_project_from_preview(project_data): ...

@frappe.whitelist()
def get_project_dashboard_data(project): ...

@frappe.whitelist()
def update_task_dependencies(task_name, dep_names_json): ...
```

---

## Implementation Order

| Phase | Component | Estimated Scope |
|---|---|---|
| 1 | `npdi_cpm_scheduler.js` (port scheduler.ts) | ~400 lines JS |
| 2 | Backend API file (`api.py`) | ~200 lines Python |
| 3 | `npdi_project_from_template` Page | ~600 lines JS/HTML |
| 4 | `npdi_template_editor` Page | ~500 lines JS/HTML |
| 5 | Enhanced Dashboard (task list + Gantt + drawer) | ~800 lines JS/HTML |

---

## Open Questions for Approval

1. **Dependency child table**: Should we add `NPDI Template Task Dependency` as a full DocType, or encode dependencies as a JSON string custom field on Project Template Task?
2. **Project Creation entry**: Should the "Create from Template with Preview" be a button on the Project List, a button on the Project Template form, or replace ERPNext's default "from template" dialog via Client Script override?
3. **ERPNext Task status values**: ERPNext uses `Open, Working, Pending Review, Completed, Cancelled`. npdi_app used `Pending, In Progress, Awaiting Approval, Completed, Blocked`. Do we want to map these or add custom statuses?
4. **Holiday calendar**: Should the CPM scheduler use ERPNext's configured Holiday List, or a hardcoded Mon-Fri calendar initially?
5. **Scope of Task Detail Drawer**: Should it support comments (Frappe uses `Communication` DocType) and file attachments (Frappe's File DocType) or limit to status/dates/duration/dependencies in Phase 1?
