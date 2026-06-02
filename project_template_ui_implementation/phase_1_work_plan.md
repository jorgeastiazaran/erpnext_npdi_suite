# Phase 1 — Data Model & Backend API: Detailed Work Plan

## Overview
Phase 1 creates the `NPDI Template Task Dependency` DocType, implements the API layer (`api.py`), and adds DFS cycle validation.  
All code is added to the `erpnext_npdi_suite` Frappe app. 

**Crucially, all schema changes are designed to run automatically when the app is installed (`bench install-app`) so no manual setup is required.**

---

## 1. Data Model Setup (Automatic on Install)

To ensure that installing the app on a new instance automatically provides all features, we will use standard Frappe mechanisms: bundled JSON for the new DocType, and an `after_install` hook for the Custom Field on the standard `Project Template`.

### 1.1 Bundled DocType JSON
- **File**: `erpnext_npdi_suite/erpnext_npdi_suite/doctype/npdi_template_task_dependency/npdi_template_task_dependency.json`
- Content (Note `custom: 0` ensures it is treated as a core app DocType, not a user-created one):
```json
{
 "autoname": "hash",
 "creation": "2025-04-10 10:00:00",
 "doctype": "DocType",
 "editable_grid": 1,
 "engine": "InnoDB",
 "fields": [
  {
   "fieldname": "task",
   "fieldtype": "Link",
   "label": "Tarea",
   "options": "Project Template Task",
   "reqd": 1,
   "in_list_view": 1
  },
  {
   "fieldname": "depends_on",
   "fieldtype": "Link",
   "label": "Depende de",
   "options": "Project Template Task",
   "reqd": 1,
   "in_list_view": 1
  }
 ],
 "istable": 1,
 "modified": "2025-04-10 10:00:00",
 "module": "ERPNext NPDI Suite",
 "name": "NPDI Template Task Dependency",
 "owner": "Administrator",
 "permissions": [],
 "custom": 0,
 "track_changes": 1
}
```

### 1.2 The `after_install` Hook (For Custom Fields)
Because `Project Template` is a standard ERPNext DocType, we add our child table as a Custom Field during the app's installation process.

- **File**: `erpnext_npdi_suite/erpnext_npdi_suite/hooks.py`
- Add to hooks:
```python
after_install = "erpnext_npdi_suite.setup.install.after_install"
```

- **File**: `erpnext_npdi_suite/erpnext_npdi_suite/setup/install.py` (Create the `setup` directory with `__init__.py` if needed)
- Content:
```python
import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

def after_install():
    custom_fields = {
        "Project Template": [
            {
                "fieldname": "npdi_task_dependencies",
                "fieldtype": "Table",
                "label": "Dependencies (NPDI)",
                "options": "NPDI Template Task Dependency",
                "insert_after": "tasks"
            }
        ]
    }
    create_custom_fields(custom_fields)
```

### 1.3 Server-Side Validation (Cycle Detection)
We will attach a Document Hook to validate the parent `Project Template`. This automatically runs every time a user saves a template.

- **File**: `erpnext_npdi_suite/erpnext_npdi_suite/hooks.py`
- Add to `doc_events`:
```python
doc_events = {
    "Project Template": {
        "validate": "erpnext_npdi_suite.api.validate_project_template_dependencies"
    }
}
```

- **File**: `erpnext_npdi_suite/erpnext_npdi_suite/api.py` (Create if missing)
- Add the validation logic:
```python
import frappe
import json

def validate_project_template_dependencies(doc, method):
    if not doc.get("npdi_task_dependencies"):
        return
        
    edges = []
    all_tasks = set()
    for row in doc.get("npdi_task_dependencies"):
        if row.task == row.depends_on:
            frappe.throw("Una tarea no puede depender de sí misma.")
        edges.append((row.task, row.depends_on))
        all_tasks.add(row.task)
        all_tasks.add(row.depends_on)
        
    # DFS Cycle Detection
    graph = {}
    for task, dep in edges:
        graph.setdefault(task, []).append(dep)

    state = {node: 0 for node in all_tasks} # 0=unvisited, 1=visiting, 2=visited

    def dfs(node):
        if state[node] == 1:
            return True
        if state[node] == 2:
            return False
        state[node] = 1
        for neighbor in graph.get(node, []):
            if dfs(neighbor):
                return True
        state[node] = 2
        return False

    for node in all_tasks:
        if state[node] == 0:
            if dfs(node):
                frappe.throw("Error: Las dependencias agregadas crean un ciclo circular.")
```

---

## 2. Implement API Layer (`api.py`)

In the same `api.py` file, append the following `@frappe.whitelist()` methods.

#### 2.2.1 `get_template_editor_data(template)`

```python
@frappe.whitelist()
def get_template_editor_data(template):
    template_doc = frappe.get_doc("Project Template", template)
    tasks = []
    for t in template_doc.tasks:
        tasks.append({
            "name": t.name,
            "subject": t.subject,
            "description": t.get("description", ""),
            "duration": getattr(t, "duration", 1),
        })
    deps = []
    for d in template_doc.get("npdi_task_dependencies", []):
        deps.append({
            "name": d.name,
            "task": d.task,
            "depends_on": d.depends_on
        })
    return {
        "message": "success",
        "data": {
            "template": {
                "name": template_doc.name,
            },
            "tasks": tasks,
            "dependencies": deps
        }
    }
```

#### 2.2.2 `upsert_template_task(template, task_data)`

```python
@frappe.whitelist()
def upsert_template_task(template, task_data):
    if isinstance(task_data, str):
        task_data = json.loads(task_data)
        
    parent_doc = frappe.get_doc("Project Template", template)
    
    if task_data.get("name"):
        task_name = task_data["name"]
        found = False
        for row in parent_doc.tasks:
            if row.name == task_name:
                row.subject = task_data.get("subject", row.subject)
                row.description = task_data.get("description", row.description)
                if "duration" in task_data:
                    row.duration = task_data["duration"]
                found = True
                break
        if not found:
            frappe.throw(f"Task {task_name} not found in template")
    else:
        parent_doc.append("tasks", {
            "subject": task_data["subject"],
            "description": task_data.get("description", ""),
            "duration": task_data.get("duration", 1)
        })
        
    parent_doc.save(ignore_permissions=True)
    
    saved_task_name = task_name if task_data.get("name") else parent_doc.tasks[-1].name
    return {"message": "success", "task_name": saved_task_name}
```

#### 2.2.3 `delete_template_task(template, task_name)`

```python
@frappe.whitelist()
def delete_template_task(template, task_name):
    parent_doc = frappe.get_doc("Project Template", template)
    
    # Remove dependencies pointing to or from this task
    deps_to_keep = [d for d in parent_doc.get("npdi_task_dependencies", [])
                      if d.task != task_name and d.depends_on != task_name]
    parent_doc.set("npdi_task_dependencies", deps_to_keep)

    # Remove the task
    tasks_to_keep = [t for t in parent_doc.tasks if t.name != task_name]
    if len(tasks_to_keep) == len(parent_doc.tasks):
        frappe.throw(f"Task {task_name} not found in template")
        
    parent_doc.set("tasks", tasks_to_keep)
    parent_doc.save(ignore_permissions=True)
    return {"message": "success"}
```

#### 2.2.4 `add_template_dependency(template, task, depends_on)`

```python
@frappe.whitelist()
def add_template_dependency(template, task, depends_on):
    parent_doc = frappe.get_doc("Project Template", template)
    
    for d in parent_doc.get("npdi_task_dependencies", []):
        if d.task == task and d.depends_on == depends_on:
            return {"message": "error", "error": "Dependency already exists"}

    task_names = [t.name for t in parent_doc.tasks]
    if task not in task_names or depends_on not in task_names:
        return {"message": "error", "error": "One or both tasks not found in template"}

    parent_doc.append("npdi_task_dependencies", {
        "task": task,
        "depends_on": depends_on
    })
    
    # parent_doc.save() automatically triggers the validate hook
    try:
        parent_doc.save(ignore_permissions=True)
    except Exception as e:
        return {"message": "error", "error": str(e)}
        
    return {"message": "success", "dependency_name": parent_doc.npdi_task_dependencies[-1].name}
```

#### 2.2.5 `get_template_preview_data(template)`
```python
@frappe.whitelist()
def get_template_preview_data(template):
    return get_template_editor_data(template)
```

#### 2.2.6 `create_project_from_npdi_template(project_data)`
```python
@frappe.whitelist()
def create_project_from_npdi_template(project_data):
    # Placeholder
    return {"message": "success", "data": {}}
```

#### 2.2.7 `get_project_dashboard_data(project)`
```python
@frappe.whitelist()
def get_project_dashboard_data(project):
    # Placeholder
    return {"message": "success", "data": {}}
```

---

## Verification Checklist

- `[ ]` Create `npdi_template_task_dependency.json`.
- `[ ]` Add `after_install` hook in `hooks.py` and create `setup/install.py`.
- `[ ]` Run `bench migrate` to simulate an install/update.
- `[ ]` Verify `NPDI Template Task Dependency` DocType and `npdi_task_dependencies` custom field exist.
- `[ ]` Add the validation hook in `hooks.py`.
- `[ ]` Ensure `api.py` contains all whitelisted methods and the `validate_project_template_dependencies` function.
- `[ ]` Test `add_template_dependency` to verify cycle detection works.
- `[ ]` Verify `upsert_template_task` and `delete_template_task` correctly persist changes.
