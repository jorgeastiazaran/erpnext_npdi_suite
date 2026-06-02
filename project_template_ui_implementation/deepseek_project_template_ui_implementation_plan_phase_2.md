### DeepSeek Architect Reasoning:
```text
We need to create a detailed implementation plan for Phase 2: replicating template and task creation UI from npdi_app to ERPNext app. The user wants a markdown file named deepseek_project_template_ui_implementation_plan_phase_2.md focusing on React component architecture, Frappe API integration, and UX design matching the reference app. Context: npdi_app components TemplateEditorClient.tsx, TaskRow.tsx, TaskDetailDrawer.tsx. ERPNext frontend uses Frappe calls. Project Templates: tasks must only have duration (no specific start/end dates). Exclude user management/auth/roles. Provide architecture, plan.

I need to produce a detailed plan. It should cover:

1. Overview of Phase 2 goals.
2. Component architecture: mapping from npdi_app components to new components in erpnext_npdi_suite, how they will interact, state management, etc.
3. Frappe API integration: which Frappe doctypes (Project Template? Task?) will be used, how we'll create/update tasks within a template, endpoints, data models.
4. UX design matching reference app: inline task creation (add tasks, edit inline fields) and side panel for task details (TaskDetailDrawer). Ensure only duration field for tasks, no dates.
5. Step-by-step implementation tasks, possibly grouped.
6. Considerations: theme matching ERPNext, using frappe-ui or custom components, etc.

The plan should be thorough and act as a blueprint for development.

I must output the markdown content directly, with the filename as specified (deepseek_project_template_ui_implementation_plan_phase_2.md). I'll structure it well.

Let's brainstorm the architecture:

- In npdi_app, TemplateEditorClient.tsx is likely the container. It holds state for a template, list of tasks, drag-drop ordering. TaskRow handles inline editing of task name, duration, maybe assignees, etc., and has drag handle. TaskDetailDrawer is a side panel that opens when a task is selected, with additional fields (description, subtasks, etc.) but for project templates we'll keep it minimal: maybe description, resources (excluded roles). Since user said "Exclude user management, auth, and roles execution functionalities," we won't have assignees. So TaskDetailDrawer might just show task description and maybe duration again for editing. But we can simplify. The reference app likely had more fields, but we need to replicate the UI pattern.

- For ERPNext: We need to integrate with a Project Template doctype and Project Template Task doctype. In ERPNext, there is a "Project Template" doctype that has a child table "Tasks" (type Project Template Task) with fields: subject, description, start (int days), duration (int days), and maybe others. But requirement says "tasks must only have duration (no specific start/end dates)". So we'll store duration (in days) but no start/end. We might need a custom doctype or modify existing ERPNext's Project Template? Since this is an ERPNext app, we can rely on custom doctypes. Likely we'll create a new doctype "NPDI Project Template" with child table "NPDI Task Template" that has subject, description, duration (integer), sequence (for ordering). Or we can extend existing ERPNext's Project Template by adding fields and using the child table. Simpler to build custom doctypes within the app. The user expects Frappe API integration, so we'll use frappe.call to CRUD.

- Vite React frontend: We need to set up a Vite app within the ERPNext app's public directory, or separate? The description says "erpnext_npdi_suite using a Vite React frontend". Likely the app has a custom page that loads the Vite build. We'll assume that's set up (Phase 1 probably). So we just develop components.

Now, design the React components:

- Page: TemplateEditor: This will be the main route for editing a specific project template. It will fetch the template document and its tasks. State: template name, tasks list, selected task ID (for drawer). It will use hooks to interact with Frappe.

- Components:
  - TaskList: Renders list of TaskRow components, maybe using react-beautiful-dnd or dnd-kit for drag and drop to reorder tasks.
  - TaskRow: displays task subject, inline editable duration (maybe an input number), maybe an expand icon to open side panel. Indentation for hierarchy? Not mentioned, but reference might have subtasks? npdi_app TaskRow has drag-drop, so likely outliner style with indentation and parent-child? The context says "inline task editing and drag-drop", so inline editing likely of task name and duration. TaskRow would have an input for subject (inline editable, on blur/enter save), and a duration input (inline editable). Also a handle for drag.
  - TaskDetailDrawer: side panel (drawer from right) that shows detailed properties of a selected task. Could include subject (maybe title), description (rich text?), duration (if need), additional fields (like "Billable" etc., but keep minimal). For now, just description and duration. Since no roles, skip assignee.

We need to handle saving changes: optimize by auto-save or explicit "Save" button? The reference app likely auto-saves on blur. We'll implement auto-save for inline edits (subject and duration), and maybe a debounced save for description in drawer. Also reordering triggers save of new sequence.

- Frappe API endpoints:
  - Custom DocType: "NPDI Project Template" (name, title?, project_template_name? Actually maybe just use ERPNext's existing Project Template; we can add custom fields if needed. But since we're in control, better to create our own to avoid conflicts and have full flexibility. ERPNext's Project Template has a "Tasks" child table with subject, description, start, duration. We'll need to ignore start. So we can use that and just not render start date. Or create a new Doctype "NPDI Project Template" and child "NPDI Task Template". I'd recommend using the standard ERPNext Project Template because projects might later be created from it using standard functionality. We can keep the UI hiding start date, or ensure start is set to 0 automatically. That's easier. So we'll rely on the existing "Project Template" doctype. It already has a "tasks" child table of type "Project Template Task". The child table fields are: subject (Data), description (Text Editor), start (Int) - days from start, duration (Int) - days. We can just ignore "start" in UI and always set it to 0. The requirement "tasks must only have duration" means the user should not see or edit start/end dates. So in UI we only show duration. Internally, start will be 0, end will be calculated from duration? Not needed. So we'll just not expose start, and always set start to 0 when creating/updating tasks. This aligns with "no specific start/end dates" – the template just knows how many days a task takes, not when.

  So API: frappe.db.get_doc("Project Template", name) to fetch template and its tasks. Task child table entries have idx for ordering. We'll use frappe.db.insert/update for saving the whole document or partial updates? For inline editing of individual task fields, we could update the parent doc's child table row. To avoid reloading whole doc, we can use frappe.call to update a specific child table row via server-side method or use the document API to set value and save. Simplest: load the parent document, modify child table rows locally, and debounced save the whole document. That way we can batch saves after reorder, subject edit, duration edit. We'll hold the whole template doc in state, manipulate child table array, then call frappe.call('frappe.desk.form.save.savedocs', {doc: doc}) or just doc.save(). But doc.save() from custom JS might be tricky. The recommended way: use frappe.call with 'frappe.client.save' or 'frappe.client.set_value'. For child tables, it's easier to save the whole parent document. So:

  - Use frappe.db.get_doc("Project Template", templateId).then(doc => setTemplateDoc(doc)).
  - On any change to tasks (subject, duration, order, description), update the local doc tasks array accordingly.
  - Implement a debounced save function: frappe.call('frappe.client.save', {doc: templateDoc}).then( ... )

  However, careful: doc.save() might not be available client-side; frappe.client.save is the standard way.

  For drag and drop reorder: update the idx property of each child row, or more robustly, maintain an order and set sequence/index. Standard child tables use idx, which is auto-set based on order. When we save, Frappe will re-index. So we just need to reorder the array.

  For task description (in drawer): the child table row has a "description" field (Text Editor). So we'll edit that.

- UX: Match reference app. Inline task creation: likely a button "Add Task" that adds a new blank row at the end, with auto-focus on the subject field. Inline editing means that fields become editable on click or are always editable (like input fields always shown). The reference might use click to edit, but duration could be an input. We'll need to decide. Since it's "inline editing", we can have the subject displayed as text, and on double-click or click, it turns into an input. Or we could have it always an input for quick edits. Often in outliner editors, clicking on a field activates it. We'll make subject an input that appears as plain text but on focus becomes editable; on enter/blur/tab it saves. Duration will be a number input, always visible, incremented by arrows? Duration could be small numeric input. Drag handle on left.

  Side panel (TaskDetailDrawer): slides in from the right when a task is clicked (row selection). Show task name (subject), description field (expandable rich text, but maybe just a Textarea for simplicity or a simple Quill/ Frappe's text editor; we can use a lightweight rich editor or plain textarea). Duration field also displayed, possibly editable. Also maybe task status? Not needed.

  UI should look like ERPNext's style? We are building within ERPNext, so should use ERPNext's CSS framework (Frappe/Desk) or at least mimic it. We could use frappe-ui components (like buttons, inputs, icons) via @frappe/icons, @frappe/react-ui? There's a frappe-ui library. I think we should use it to match.

Now, plan content:

- Introduction, goals.
- Component tree: TemplateEditor page container.
- Data flow: Frappe API integration, state management (useReducer or context).
- Detailed design of each component.
- Task creation flow: inline adding.
- Drag and drop: use dnd-kit for simplicity.
- Task detail drawer: side panel implementation.
- Styling approach: using CSS modules or frappe-ui.
- Implementation steps: setting up doctype (if needed), creating Vite app structure, building components, connections.
- Testing considerations.

I'll structure the markdown accordingly. Let's start writing.
```

### Recommended Architecture / Solution:
```markdown
# deepseek_project_template_ui_implementation_plan_phase_2.md

## 1. Goal
Replicate the project template and task creation UI from the reference React app (`npdi_app`) into the `erpnext_npdi_suite` ERPNext app. This phase focuses on:
- Inline creation and editing of template tasks
- A side panel (`TaskDetailDrawer`) for viewing/modifying task properties
- Drag‑and‑drop task reordering
- Tasks hold **only a duration** (no explicit start/end dates)
- No user management, authentication, or role‑execution logic

The interface must match the UX of the reference app and integrate natively with ERPNext’s data layer via Frappe API calls.

## 2. Architecture Overview

### 2.1 Technology Stack (Frontend)
- **Vite + React** (TypeScript) – bundled as a custom page inside the ERPNext app
- **State management** – React `useReducer` with a context provider (avoids heavier state libs)
- **Drag and drop** – `@dnd-kit/core` and `@dnd-kit/sortable` (lightweight, accessible)
- **UI components** – ERPNext’s own `frappe-ui` (buttons, inputs, dialogs, text editor) to maintain visual consistency
- **Styling** – CSS Modules scoped per component

### 2.2 Backend – ERPNext DocTypes
We reuse the standard ERPNext `Project Template` DocType and its child table `Project Template Task`.
- **Project Template**  
  - Fields: `name`, `project_template_name`  
- **Project Template Task** (child table, `tasks`)  
  - `subject` (Data)  
  - `description` (Text Editor)  
  - `start` (Int) – *always set to 0 and hidden in UI*  
  - `duration` (Int) – days required, the only date‑like field exposed  

No custom DocTypes are needed; we simply suppress the `start` field from the frontend.

### 2.3 Data Flow
1. On page load, fetch the full `Project Template` document (`frappe.db.get_doc`).
2. Maintain the document (including its `tasks` child table) in a reducer.
3. Every local change (task reorder, subject edit, duration edit, description edit) updates the reducer state immediately and triggers a **debounced save** of the whole document via `frappe.client.save`.
4. For new tasks, a blank row is appended; the document is saved after the user enters a subject (or on explicit “Add Task” click).
5. All Frappe calls are collected in a custom `useFrappeDoc` hook to encapsulate fetch/save logic.

## 3. Component Hierarchy

```
TemplateEditorPage
 ├─ TemplateEditorContext.Provider
 │    ├─ Header (template name, maybe save indicator)
 │    ├─ MainLayout (flex: task list left, drawer right when open)
 │    │    ├─ TaskList (sortable container)
 │    │    │    ├─ SortableTaskRow (for each task)
 │    │    │    │    ├─ DragHandle
 │    │    │    │    ├─ InlineSubject
 │    │    │    │    ├─ InlineDuration
 │    │    │    │    └─ OpenDrawerButton
 │    │    │    └─ AddTaskButton (triggers new row)
 │    │    └─ TaskDetailDrawer (slide‑out right panel)
 │    │         ├─ SubjectInput
 │    │         ├─ DurationInput (editable)
 │    │         └─ DescriptionEditor (Frappe Text Editor)
```

- `TemplateEditorContext` exposes:  
  `templateDoc`, `selectedTaskId`, `dispatch` actions: `SET_DOC`, `UPDATE_TASK`, `REORDER_TASKS`, `ADD_TASK`, `REMOVE_TASK`, `SELECT_TASK`, etc.

## 4. Detailed Component Design

### 4.1 Inline Task Editing (`SortableTaskRow`)

**Purpose**  
Allow quick editing of task subject and duration directly in the list.

**Behavior**
- `subject` is displayed as a plain text span.  
  - On **click** or **Enter** while focused, it becomes an `<input>` with auto‑focus.  
  - On **blur** or **Enter** (with non‑empty value), the subject is updated in state.  
  - On **Escape**, revert to original value.  
- `duration` is always an `<input type="number" min="0" step="1">`.  
  - On change, validation (non‑negative integer) and immediate dispatch of update.  
- A **drag handle** (icon) on the left enables drag‑and‑drop reordering.
- Clicking the row (but not the handle) selects the task and opens the detail drawer.  
- A subtle background color indicates the selected row.

**Props**  
- task (child table row object: `{name?, subject, duration, idx, description}`)
- isSelected (boolean)
- onSelect (callback)

**Implementation Notes**
- Use `@dnd-kit/sortable`’s `useSortable` to wrap each row. The `id` for sorting is the task’s `idx` (or a unique local id).  
- Dispatch `REORDER_TASKS` with new indices after drag.

### 4.2 `TaskDetailDrawer` – Side Panel

**Purpose**  
Display and edit extended task properties, notably the description.

**Layout**  
- Slides in from the right, anchored to the viewport, with a fixed width (e.g., 400px).  
- Contains:
  - Task subject (large, editable text field)
  - Duration (number input, synced with list)
  - Description: ERPNext’s rich text editor (the same `frappe.ui.form.ControlTextEditor` can be wrapped in a React portal, or we use a light Markdown editor if full ERPNext editor is heavy). For consistency, use ERPNext’s text editor component via a custom `DescriptionEditor` that loads Frappe’s editor script.
- Close button (×) and clicking outside the drawer (or a mask) dismisses it.

**Integration with State**
- The drawer receives the selected task’s data from context.
- On any field change, dispatch `UPDATE_TASK` with the delta; the debounced save handles persistence.

### 4.3 Drag‑and‑Drop Reordering

- Use `DndContext` and `SortableContext` from `@dnd-kit`.  
- The `SortableContext` items are the `tasks` array (using `idx` as key).  
- After a drag ends, the `onDragEnd` handler computes the new order and dispatches `REORDER_TASKS`.
- The reducer updates the task array order; `idx` properties are reassigned sequentially before the next save.

### 4.4 Adding a Task

- An “+ Add Task” button at the bottom of the task list.
- On click, dispatch `ADD_TASK` which pushes a new row:
  ```json
  { "subject": "", "duration": 1, "description": "", "start": 0 }
  ```
- The new row appears at the end, the subject field is automatically in edit mode (focused).  
- An empty subject is allowed temporarily; the task is not saved until the user provides a subject (or we can save immediately and handle empty subject server‑side). For better UX, we allow blank subjects during editing but block saving of an entirely blank row – the row is removed if no subject is entered and the user clicks away / saves.

## 5. Frappe API Integration Strategy

### 5.1 Fetching the Template

```typescript
async function fetchTemplate(templateName: string) {
  const doc = await frappe.db.get_doc('Project Template', templateName);
  // Normalise: ensure every task has a deterministic local id (e.g., `idx` or a generated uid)
  return doc;
}
```

### 5.2 Saving the Document

- Use a **debounced** (500ms) save triggered by any change.
- The save function:
  ```typescript
  async function saveTemplate(doc: object) {
    await frappe.call('frappe.client.save', { doc });
    // Optionally update local state with returned doc to keep server‑generated fields in sync.
  }
  ```
- The debounce ensures that rapid typing in description or duration does not fire multiple saves.

### 5.3 Partial Updates (Alternative)
If later needed for performance, we could update a single child table row using `frappe.client.set_value` on the parent with the child table row index. However, full document save is simpler and sufficient for typical template sizes (< 100 tasks).

## 6. UX Matching and Styling

- **Visual design** – follow ERPNext’s current desk theme:  
  - Font: Inter, colours, spacing as per ERPNext’s CSS custom properties (`var(--text-color)`, `var(--bg-color)`, etc.).  
  - Use `frappe-ui` components (`Button`, `Input`) for consistent look and feel.
- **Interactive states** –  
  - Drag handle: cursor `grab`, subtle opacity change on hover.  
  - Subject editing: dashed border on the editable span when not focused, solid border on focus.  
  - Selected row: light blue background (`var(--bg-light-blue)`).  
  - Add Task button: secondary style, placed below the task list.  
- **Side panel** –  
  - Transition: slide‑in from right (CSS `transform` with `transition`).  
  - Backdrop: semi‑transparent overlay that dims the task list.  
  - Close on overlay click, close button, or `Escape` key.
- **Drag and drop** –  
  - While dragging, the dragged item is lifted slightly and shows a shadow.  
  - Drop indicator (line between rows) as the user reorders.

## 7. Implementation Steps

### Step 1 – Prepare the Vite React Environment
- Ensure the Vite‑based frontend is integrated into the ERPNext app as a custom page (e.g., `/app/npdi-project-template-editor`).
- Set up routing with `react-router-dom` (only one route for now: `/template/:name`).
- Install dependencies: `@dnd-kit/core`, `@dnd-kit/sortable`, `frappe-ui`.

### Step 2 – Create State Management
- Create `TemplateContext.tsx` with reducer and provider.
- Define actions: `SET_DOC`, `UPDATE_TASK`, `REORDER_TASKS`, `ADD_TASK`, `REMOVE_TASK`, `SELECT_TASK`.
- The reducer maintains `templateDoc` and `selectedTaskIdx`.

### Step 3 – Fetch and Save Logic
- Implement `useFrappeTemplate(name)` hook that:
  - Fetches the document on mount.
  - Sets up a debounced save callback that watches for changes to the task list.
  - Returns the document, dispatch, and a loading/saving status.

### Step 4 – Build Basic Task List without Drag‑and‑Drop
- Render a static list of tasks using the child table array.
- Each `TaskRow` shows subject (inline editable) and duration input.
- Clicking a row selects it; `selectedTaskId` is stored in context.

### Step 5 – Implement Inline Editing
- Create `InlineSubject` component with click‑to‑edit behavior.
- On blur/enter, dispatch `UPDATE_TASK` with the new subject.
- Duration input dispatches on change.

### Step 6 – Add Task Creation
- “Add Task” button dispatches `ADD_TASK`.
- Ensure new row’s subject field auto‑focuses.

### Step 7 – Integrate Drag‑and‑Drop
- Wrap `TaskList` in `DndContext` and `SortableContext`.
- Make each `SortableTaskRow` a sortable item.
- On `onDragEnd`, recalc order and dispatch `REORDER_TASKS`.

### Step 8 – Develop `TaskDetailDrawer`
- Build a slide‑out panel component with backdrop.
- Show selected task’s subject, duration, description.
- Use a `<textarea>` initially for description; later upgrade to Frappe’s rich text editor (wrapping `frappe.ui.form.make_control` with a React ref).
- Wire changes to `UPDATE_TASK`.

### Step 9 – Polish UX and Styling
- Apply ERPNext theme variables and `frappe-ui` components.
- Add transitions, focus management, keyboard shortcuts (Escape to close drawer).
- Ensure mobile responsiveness (drawer becomes full‑screen on small devices).

### Step 10 – Testing and Edge Cases
- Test with large task lists, rapid reorder + edit.
- Validate that `start` is always 0 when saving.
- Handle concurrent saves (debounce should suffice, but add a saving indicator).
- Verify that empty or invalid data is handled gracefully.

## 8. Key Technical Decisions

| Decision | Rationale |
|----------|-----------|
| Reuse ERPNext’s existing `Project Template` DocType | Avoids custom DocTypes, leverages standard project creation features later. |
| Full document save (debounced) | Simpler to implement than partial row updates; fine for typical template sizes. |
| `@dnd-kit` instead of `react-beautiful-dnd` | `react-beautiful-dnd` is unmaintained; `@dnd-kit` is modular and accessible. |
| Inline subject editing via click‑to‑edit | Matches the reference app’s “click on text to edit” pattern, reduces clutter. |
| `frappe-ui` for buttons/inputs | Ensures visual consistency with the rest of ERPNext. |
| Rich text editor for description (ERPNext control) | Gives users the same editing experience they have in forms; can be loaded on‑demand. |

## 9. Risks and Mitigations

- **ERPNext text editor loading in a React portal** – need to handle lifecycle (create/destroy). Mitigation: use a custom `FrappeTextEditor` component that wraps `frappe.ui.form.ControlTextEditor`, mounting it in a ref and cleaning up on unmount.
- **Debounced save may conflict with rapid drag‑and‑drop** – mitigate by canceling the previous debounce on new changes, and saving after a short quiet period.
- **Child table row identity** – ERPNext child rows have no unique `name` until saved. Use `idx` as key, but after reorder, the array order changes. We must assign a temporary unique ID to each row upon creation (e.g., using `crypto.randomUUID()`).  

## 10. Deliverables
- Fully functional `TemplateEditor` page built in Vite React, integrated with ERPNext.
- All Frappe API calls documented.
- UX matches reference app’s inline editing and slide‑out detail panel.

This plan provides a clear, stepwise blueprint for Phase 2 implementation.
```

---
**DeepSeek Token Usage & Cache Report:**
- **Disk Cache Hits:** `0` tokens
- **Cache Misses:** `230` tokens
- **Total Output Usage:** `5932` tokens
