# DeepSeek Implementation Plan: NPDI Project Template & Dashboard UI Enhancement
## `erpnext_npdi_suite` — React/Vite Extension of Existing Frontend

> *Revision 2 — Corrected architecture: leverages the already-present Vite+React frontend.*

---

## Overview

This plan extends the existing React application inside `erpnext_npdi_suite/frontend` to deliver four major features, all ported from the `npdi_app` Next.js prototype:

1. **Visual Template Editor** – Interactive, stage‑grouped task tree with drag‑and‑drop dependency links.
2. **Project Creation Preview** – Live CPM‑scheduled preview with module filtering, skip logic, and instantiation.
3. **Enhanced Project Dashboard** – Upgraded Gantt (baseline, critical path, stage groups), grouped task list with DataTable, and a slide‑in detail drawer.
4. **Task Detail Drawer** – Inline editing of status, assignee, duration, dependencies, attachments, and comments.

All UI will be built as React components inside the existing Vite bundle, reusing the already‑established router and `frappe.call` communication layer.

---

## Architecture

The `erpnext_npdi_suite` app already provides:
- A Frappe page `npdi_project_dashboard` that mounts a React root element.
- A Vite‑built JavaScript bundle (`frontend/dist/bundle.js`) included on that page.
- An `App.tsx` entry point that reads `window.frappe.get_route()` to decide which view to render (currently only the live project Gantt/list).

We will:
- **Keep the hybrid architecture** – no new Frappe pages; all new views become React routes inside `App.tsx`.
- **Extend the existing `frontend/src` tree** with new component directories and shared utilities.
- **Add a new path parameter** so the same page can serve both live projects and template‑related views. For example:
  - `/npdi-project-dashboard` → live project view (current behavior).
  - `/npdi-project-dashboard?template=<name>` → template editor view.
  - `/npdi-project-dashboard?create=<template>` → project creation preview.
- **Replace Next.js server actions** with standard `frappe.call` calls to new API endpoints defined in `api.py`.

---

## Data Model

### New DocType: `NPDI Template Task Dependency`

- **Parent**: `Project Template` (child table, parentfield: `npdi_task_dependencies`)
- Fields:
  - `task` (Link → **Project Template Task**, mandatory)
  - `depends_on` (Link → **Project Template Task**, mandatory)
- Server‑side validation will include **DFS cycle detection** before save.

### Existing Doctypes Already Used

- **Project Template** – already has `npdi_task_dependencies` (child table we’ll create).
- **Project Template Task** – existing child table of Project Template; we may add a `task_name` field for display.
- **Task** (standard ERPNext) – already extended with NPDI custom fields; dependencies will be managed via the standard Task dependency child table.

No other schema changes are required.

---

## API Layer (`erpnext_npdi_suite/api.py`)

All methods are `@frappe.whitelist()`. They replace the Next.js server procedures used in the prototype.

### For Template Editor

```python
@frappe.whitelist()
def get_template_editor_data(template):
    """Return full template tasks (with child table dependencies) ordered by stage."""
    # Returns { stages: [...], tasks: [...] }

@frappe.whitelist()
def upsert_template_task(template, task_data):
    """Create or update a single template task (name, duration, module, etc.)."""

@frappe.whitelist()
def delete_template_task(template, task_name):
    """Delete a template task and its dependencies."""

@frappe.whitelist()
def add_template_dependency(template, task, depends_on):
    """Add a dependency link; validated for cycles."""
```

### For Project Creation Preview & Instantiation

```python
@frappe.whitelist()
def get_template_preview_data(template):
    """Return all tasks with full dependency info for the live preview scheduler."""

@frappe.whitelist()
def create_project_from_npdi_template(project_data):
    """
    Instantiate a Project and all Tasks from a template.
    project_data: {
        template, project_name, start_date,
        tasks: [{ template_task_id, skip, duration_override, dependencies, launch_milestone }]
    }
    """
```

### For Enhanced Dashboard

```python
@frappe.whitelist()
def get_project_dashboard_data(project):
    """Return all tasks with CPM dates, status, dependencies, comments, attachments."""
```

Task updates (status, assignee, duration, dependencies) will reuse standard `frappe.client.set_value` and a custom `update_task_dependencies` method.

---

## Frontend Structure (inside `frontend/src`)

The existing structure will be augmented:

```
frontend/src/
├── App.tsx                        # Router – maps route to component
├── components/
│   ├── GanttView.tsx              # (existing) will be enhanced
│   ├── ListView.tsx               # (existing) will be enhanced
│   ├── TaskDetailDrawer.tsx       # new – slide‑in panel
│   ├── template-editor/
│   │   ├── TemplateEditorView.tsx # main container
│   │   ├── TaskRow.tsx            # tree row with inline editing
│   │   └── DependencyManager.tsx  # modal for adding/removing deps
│   └── project-creation/
│       ├── ProjectFromTemplateView.tsx  # main container
│       ├── ModuleFilter.tsx       # module checkboxes
│       └── ProjectScheduler.tsx   # live CPM display (uses npdi_cpm_scheduler)
├── lib/
│   ├── npdi_cpm_scheduler.ts     # ported from scheduler.ts
│   └── api.ts                    # frappe.call wrappers
└── ...
```

The shared CPM scheduler (`npdi_cpm_scheduler.ts`) is identical to the `npdi_app` version but will be adapted to work with plain objects (no React state) and accept a working calendar.

---

## Component 1: `TemplateEditorView` (Visual Template Editor)

**Entry**  
User clicks a custom button “Abrir Editor Visual NPDI” on the Project Template form. A client‑side script in `public/js/project_template.js` redirects to `/npdi-project-dashboard?template=<template_name>`.

`App.tsx` reads the `template` parameter and mounts `<TemplateEditorView template={template} />`.

**UI – Directly Ported from `npdi_app`**

- Uses `TaskRow.tsx` for each task, displayed in a collapsible stage group (`Idea`, `Concepto`, `Desarrollo`, `Lanzamiento`, `Post‑Lanzamiento`).
- Each row shows:
  - Expand/collapse toggle (if children)
  - Task name (inline editable)
  - Module badge (color‑coded)
  - Duration input
  - Dependency chips (click opens `DependencyManager`)
  - Buttons to add a child task or delete.
- **Dependency Drawing** – A full‑width SVG overlay renders arrows exactly as in the prototype, with handles on each row to drag from one task to another.

**State & Save**  
All changes are stored in React state. A “Guardar cambios” button calls a batch‑oriented API that updates all modified, added, and deleted tasks in one transaction (using the `upsert_template_task` and `add_template_dependency` methods).

---

## Component 2: `ProjectFromTemplateView` (Live Preview & Instantiation)

**Entry**  
From the Project list view, a custom action “Crear Proyecto desde Plantilla (NPDI)” redirects to `/npdi-project-dashboard?create=<template>`.

**UI**

- **Top controls**: template selector, project name, start date, and module toggles (Core, Formula, Pack, Brand).
- **Preview tree**: stage‑grouped tasks with:
  - Computed early/late dates from the CPM scheduler.
  - Inline duration override.
  - Skip checkbox (with recursive logic).
  - Launch milestone radio (only one task can be the launch milestone).
- **Footer**: displays the projected launch date and a “Crear Proyecto” button.

**Client‑Side Scheduler**  
Every change (duration, start date, skip, module filter) runs `npdi_cpm_scheduler` locally to recompute:

- Topological sort, forward/backward pass.
- Critical path (float = 0).
- Overdue handling (if start date is in the past).
- Module filtering automatically skips tasks not in the selected modules.
- Recursive skip: skipping a parent skips all descendants; un‑skipping re‑enables children only if the parent is active.

The scheduler output feeds the preview tree, showing updated start/end dates and highlighting the critical path.

**Instantiation**  
On “Crear Proyecto”, the final state is collected and sent to `create_project_from_npdi_template`. The backend creates the Project and its Tasks, mapping template task IDs to new `Task` names, and then runs the server‑side CPM engine to set NPDI fields on the tasks.

---

## Component 3: Enhanced Project Dashboard

Existing components `GanttView.tsx` and `ListView.tsx` will be upgraded, and a new `TaskDetailDrawer.tsx` will be integrated.

### ListView

- Replace the simple table with **Frappe DataTable** through a React wrapper (available in Frappe Gantt’s dependencies; Note: we can use a lightweight React table if preferable, but the prototype used a custom tree view. We will adopt the `npdi_app`’s grouped list view with stage headers, status dots, module badges, and critical path indicators.
- Each row click opens the `TaskDetailDrawer`.

### GanttView

- **Baseline bars**: Render `baseline_` tasks as transparent background bars. The existing Gantt library supports custom bar classes; we’ll utilize that.
- **Critical path coloring**: tasks with `is_critical == true` get a distinctive color (e.g., `#ef4444`).
- **Stage grouping rows**: Synthesize “project” tasks with `custom_class` to act as group headers, spanning the children’s date range.
- **View modes**: Add Day/Week/Month buttons that call `gantt.change_view_mode()`.
- **Fullscreen toggle**: `element.requestFullscreen()`.
- **Auto‑scroll**: When a task is selected from the drawer or table, locate its bar in the SVG and scroll into view.

### TaskDetailDrawer (Slide‑in Panel)

- **Layout**: Fixed right panel, 480px wide, sliding in from the right with a smooth transition.
- **Content**:
  - Status buttons (Open, Working, Pending Review, Completed, Closed).
  - Assignee dropdown (loaded via `frappe.client.get_list`).
  - Plan date pickers and duration input.
  - Dependencies manager (chips + typeahead search to add).
  - Attachment dropzone (drag & drop + clipboard paste) using `frappe.ui.FileUploader`.
  - Comment thread with input and send button.
- **Integration**: Opened by clicking a task row in the ListView or Gantt bar; closed by the ‘×’ button or pressing `Escape`.
- **State updates**: Directly call `frappe.call` for each change and update local dashboard data after success.

---

## Implementation Phases

| Phase | Deliverable | Key Activities |
|-------|-------------|----------------|
| **1** | Data Model & Backbone API | Create `NPDI Template Task Dependency` DocType, implement all whitelisted methods in `api.py`, validate cycles. |
| **2** | CPM Scheduler Utility | Port `scheduler.ts` to `frontend/src/lib/npdi_cpm_scheduler.ts`. Write unit tests within Vite. |
| **3** | Template Editor | Build `TemplateEditorView`, `TaskRow`, `DependencyManager`. Integrate with new APIs and SVG overlay. |
| **4** | Project Creation Preview | Build `ProjectFromTemplateView`, `ModuleFilter`, and connect the scheduler. Implement the create‑project flow. |
| **5** | Dashboard Enhancements | Refactor `GanttView`, `ListView`, create `TaskDetailDrawer`. Add baseline, critical path, stage grouping, and full‑feature drawer. |
| **6** | Integration & Testing | Run `npm run build` inside `frontend`. Test all user journeys in ERPNext. Update the frontend build pipeline if needed. |

---

## Risk Mitigation

- **Preserving Existing Gantt Functionality** – Since we are extending the existing React components, we can branch from the current code and merge incrementally, ensuring no regression.
- **Performance** – The CPM scheduler already runs in under 10ms for typical projects (tested in `npdi_app`). The React port will maintain that performance.
- **Dependency Drawing** – The SVG overlay logic from `TaskRow.tsx` requires careful integration with the React reconciliation process; we will lift the overlay state into a shared context to avoid re‑attachment issues.

---

## Conclusion

This plan fully embraces the discovered React/Vite architecture, guaranteeing zero feature loss and a straightforward port of the proven `npdi_app` UX. By extending the existing `App.tsx` router and adding new components and a shared CPM utility, we deliver all four enhancements in a maintainable, performant manner. The five‑phase rollout ensures clear milestones and the ability to validate incremental progress.
