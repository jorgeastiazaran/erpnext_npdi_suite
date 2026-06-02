# Combined Implementation Plan: NPDI Project Template UI Enhancement
## `erpnext_npdi_suite` — Native React/Vite Extension

> *Synthesized from Antigravity's npdi_app analysis + DeepSeek's ERPNext architecture recommendations.*

---

## ⚠️ Architecture Correction: React/Vite Compatibility

**Thank you for catching the flaw in the previous Vanilla JS proposal.** 

The `erpnext_npdi_suite` app *already* implements the Gantt view using a bundled React application (via Vite) located in `erpnext_npdi_suite/frontend`.

Because this robust hybrid architecture (React frontend mounted on a Frappe Page) is already in place, **we do NOT need to rewrite anything in Vanilla JS.** 

This approach is **100% compatible** with the current Gantt view implementation because we will simply extend the *existing* React application to handle the Template Editor and Instantiation views. 

### Answers to your specific questions:

1. **Feature Parity & Risks:** Since we are extending the existing React app, there are **ZERO risks** of losing functionality. We can port the Next.js components (`TemplateEditorClient.tsx`, `GanttView.tsx`, `TaskRow.tsx` with its SVG drag-and-drop overlays) almost verbatim into the Vite React frontend.
2. **Switching to the "NPDI Suite View":** 
   - Standard Frappe hooks (`project_template.js`) will inject a button.
   - Clicking it routes to the `npdi_project_dashboard` page but passes `template` or `create` as the route parameter.
   - Inside `App.tsx` (the React entry point), we read `window.frappe.get_route()` (which it already does) and render a new `<TemplateEditorView />` or `<ProjectFromTemplateView />` component instead of the standard Project timeline.
3. **Vanilla JS vs Next.js:** We are officially using React. We will drop the Next.js server actions and replace them with standard `frappe.call` API wrappers, just like the current `App.tsx` does for the Gantt view.

---

## Data Model Changes Required

### New DocType: `NPDI Template Task Dependency`
```
DocType: NPDI Template Task Dependency
Parent: Project Template (parentfield: npdi_task_dependencies, parenttype: Project Template)
Fields:
  - task        Link → Project Template Task  [mandatory, label: "Tarea"]
  - depends_on  Link → Project Template Task  [mandatory, label: "Depende de"]
```
This mirrors the standard ERPNext dependency pattern. Server-side validation will include DFS cycle detection.

---

## API Layer (`erpnext_npdi_suite/api.py`)

All methods are `@frappe.whitelist()`. They replace the Next.js server procedures used in the prototype.

- `get_template_editor_data(template)`
- `upsert_template_task(template, task_data)`
- `delete_template_task(template, task_name)`
- `add_template_dependency(template, task, depends_on)`
- `get_template_preview_data(template)`
- `create_project_from_npdi_template(project_data)`
- `get_project_dashboard_data(project)`

---

## Frontend Structure (inside `frontend/src`)

The existing structure will be augmented:

```text
frontend/src/
├── App.tsx                        # Router – maps route to component
├── components/
│   ├── GanttView.tsx              # (existing) will be enhanced
│   ├── ListView.tsx               # (existing) will be enhanced
│   ├── TaskDetailDrawer.tsx       # new – slide-in panel
│   ├── template-editor/
│   │   ├── TemplateEditorView.tsx # main container
│   │   ├── TaskRow.tsx            # tree row with inline editing
│   │   └── DependencyManager.tsx  # modal for adding/removing deps
│   └── project-creation/
│       ├── ProjectFromTemplateView.tsx  # main container
│       ├── ModuleFilter.tsx       # module checkboxes
│       └── ProjectScheduler.tsx   # live CPM display
├── lib/
│   ├── npdi_cpm_scheduler.ts      # ported from scheduler.ts
│   └── api.ts                     # frappe.call wrappers
└── ...
```

---

## Component 1: `TemplateEditorView.tsx` (Visual Template Editor)

### UX
- **Direct port from `npdi_app`**: We will copy `TemplateEditorClient.tsx` and `TaskRow.tsx`.
- **Visual Drag & Drop Dependencies:** Preserved exactly using the absolute positioned SVG overlay.
- **State & Save**: All changes are stored in React state. A "Guardar cambios" button calls a batch-oriented API that updates all modified, added, and deleted tasks in one transaction.

---

## Component 2: `ProjectFromTemplateView.tsx` (Preview & Instantiation)

### UX
- **Recursive Skip Logic:** Toggling a module dynamically updates the state, instantly hiding/disabling child tasks recursively.
- **Live Schedule:** Changing the start date, duration, or skipping a task triggers the local `npdi_cpm_scheduler.ts` to preview the Gantt before instantiation.
- **Creation:** A final `frappe.call` sends the JSON state to the backend to generate the standard DocTypes, mapping template task IDs to new Task names, and then running the server-side CPM engine.

---

## Component 3: Enhanced `GanttView`, `ListView`, and `TaskDetailDrawer`

### `TaskDetailDrawer` (Slide-in Panel)
- **Layout**: Fixed right panel, 480px wide, sliding in from the right.
- **Content**: Status buttons, assignee dropdown, date pickers, duration input, dependency manager, attachment dropzone, comment thread.
- **Integration**: Opened by clicking a task row in the ListView or Gantt bar. State updates directly call `frappe.call`.

### `ListView` & `GanttView` Upgrades
- **ListView**: Implement the `npdi_app`'s grouped list view with stage headers, status dots, module badges, and critical path indicators.
- **GanttView**: Add baseline ghost tasks (`baseline_<taskname>`), critical path coloring (`#ef4444`), stage grouping rows, view modes, and fullscreen toggles.

---

## Implementation Phases

| Phase | Deliverable | Key Activities |
|---|---|---|
| **1** | Data Model & Backend API | `NPDI Template Task Dependency` DocType, Frappe API endpoints (`api.py`), DFS cycle validation. |
| **2** | CPM Scheduler Utility | Port `scheduler.ts` to `frontend/src/lib/npdi_cpm_scheduler.ts`. |
| **3** | `TemplateEditorView` | Port React template editor components into the Vite bundle. Integrate SVG overlay. |
| **4** | `ProjectFromTemplateView` | Port the live preview instantiation React components and connect the local scheduler. |
| **5** | Dashboard Enhancements | Refactor `GanttView`, `ListView`, create `TaskDetailDrawer`. |
| **6** | Bundle & Test | Run `npm run build` inside `frontend`. Test integration in ERPNext. |

---

## Open Questions for Approval

> [!IMPORTANT]
> Please review and approve these final technical decisions before coding begins:

1. **Dependency storage**: We will proceed with creating the new `NPDI Template Task Dependency` DocType. Do you approve?
2. **Project creation entry**: We will add a "Crear Proyecto (NPDI)" button to the standard Project List View to launch the React instantiator. Do you approve?
3. **ERPNext Task status mapping**: We will map the reference app statuses ("Open, Working, Pending Review, Completed, Cancelled") to ERPNext standard values. Do you approve?
4. **CPM scheduling calendar**: We will implement a standard Mon-Fri working calendar initially to match the reference app. Do you approve?

### Update 2026-06-01:
- Fixed CPM dependency circular loops by relaxing the backward pass algorithm, safely ignoring parent-child cycle bugs.
- Implemented frontend visual circular dependency validation in the React UI (TemplateEditorView and ListView) to stop cycles being formed via drag-and-drop.
- Extracted inline task editing capability into `ListView.tsx`, allowing instantiated project tasks to be edited in place (name, duration, module, role).
- Hooked up `update_project_task` backend API to persist inline changes and automatically trigger a CPM recalculation upon duration changes.
