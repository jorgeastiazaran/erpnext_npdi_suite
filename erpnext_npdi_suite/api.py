import frappe
import json

# ── Existing project-level endpoints (unchanged) ──────────────────────────────

@frappe.whitelist()
def get_project_gantt_data(project=None, template=None):
    """
    Fetch tasks formatted exactly as the React Gantt components expect.
    """
    filters = {}
    project_meta = {}
    if project:
        filters['project'] = project
        meta = frappe.db.get_value("Project", project, ["name", "npdi_baseline_locked"], as_dict=True)
        if meta:
            project_meta = {
                "name": meta.name,
                "npdi_baseline_locked": int(meta.npdi_baseline_locked or 0)
            }
    elif template:
        filters['project_template'] = template
    else:
        return {"success": False, "error": "No Project or Template provided"}

    # Fetch Tasks
    raw_tasks = frappe.get_all(
        'Task',
        filters=filters,
        fields=[
            'name as id', 'subject as name', 'exp_start_date as planStartDate',
            'exp_end_date as planEndDate', 'status', 'parent_task as parentTaskId',
            'is_milestone as isMilestone', 'is_group as isGroup', 'npdi_stage_name as stageName',
            'npdi_module as npdiModule',
            'npdi_cpm_is_critical as isCritical', 'npdi_cpm_total_float as slack',
            'npdi_baseline_start as baselineStartDate', 'npdi_baseline_end as baselineEndDate',
            'npdi_responsible_role as npdiResponsibleRole', 'task_owner',
            'npdi_cpm_manual_dates as isFixed', 'npdi_requires_attachment as requiresAttachment'
        ]
    )

    # Sort tasks according to template sequence if template exists
    template_name = template
    if project:
        template_name = frappe.db.get_value("Project", project, "project_template")
        
    if template_name:
        template_tasks = frappe.get_all(
            "Project Template Task",
            filters={"parent": template_name},
            fields=["task", "idx"],
            order_by="idx asc"
        )
        template_task_order = {}
        for tt in template_tasks:
            subject = frappe.db.get_value("Task", tt.task, "subject")
            if subject:
                template_task_order[subject] = tt.idx
                
        def sort_key(t):
            idx = template_task_order.get(t.get('name'))
            if idx is not None:
                return (0, idx)
            return (1, str(t.get('planStartDate') or ''))
            
        raw_tasks.sort(key=sort_key)
    else:
        raw_tasks.sort(key=lambda t: str(t.get('planStartDate') or ''))

    # We need to map dependencies for each task
    tasks_with_deps = []
    for t in raw_tasks:
        if not t.planStartDate or not t.planEndDate:
            continue
            
        t['planStartDate'] = str(t['planStartDate'])
        t['planEndDate'] = str(t['planEndDate'])
        t['isCritical'] = bool(t.get('isCritical'))
        t['isGroup'] = bool(t.get('isGroup'))
        t['isMilestone'] = bool(t.get('isMilestone'))
        t['slack'] = float(t.get('slack') or 0.0)

        if t.get('baselineStartDate'):
            t['baselineStartDate'] = str(t['baselineStartDate'])
        if t.get('baselineEndDate'):
            t['baselineEndDate'] = str(t['baselineEndDate'])

        # Map Role & Assignee
        if t.get('npdiResponsibleRole'):
            t['role'] = {'name': t['npdiResponsibleRole']}
        else:
            t['role'] = None

        if t.get('task_owner'):
            user_email = t.get('task_owner')
            user_name = frappe.db.get_value("User", user_email, "full_name") or user_email
            t['assignedTo'] = user_name
        else:
            t['assignedTo'] = None
        
        # Fetch Dependencies
        deps = frappe.get_all(
            'Task Depends On',
            filters={'parent': t.id},
            fields=['task as dependentOnId']
        )
        t['dependencies'] = deps
        t['isFixed'] = bool(t.get('isFixed'))
        
        # Check File attachments
        has_file = frappe.db.exists("File", {"attached_to_doctype": "Task", "attached_to_name": t.id})
        t['attachmentUrl'] = f"/app/file/{has_file}" if has_file else None
        
        # Determine isSkipped based on Cancelled status
        t['isSkipped'] = t.get('status') == 'Cancelled'
        
        # Provide default stage if missing
        if not t.get('stageName'):
            t['stageName'] = 'General'
            
        # Expose native ERPNext status directly
        t['status'] = t.get('status') or 'Open'
            
        tasks_with_deps.append(t)

    return {"success": True, "tasks": tasks_with_deps, "project_meta": project_meta}

@frappe.whitelist()
def update_task_status(task_id, status):
    """
    Update Task status from Gantt.
    """
    from erpnext_npdi_suite.erpnext_npdi_suite.engine.cpm import CPMEngine
    
    try:
        task = frappe.get_doc('Task', task_id)
        task.check_permission('write')
        
        reverse_map = {
            'Pending': 'Open',
            'In Progress': 'Working',
            'Awaiting Approval': 'Pending Review',
            'Completed': 'Completed',
            'Blocked': 'Overdue',
            'Skipped': 'Cancelled',
            'Open': 'Open',
            'Working': 'Working',
            'Pending Review': 'Pending Review',
            'Cancelled': 'Cancelled',
            'Overdue': 'Overdue'
        }
        
        task.status = reverse_map.get(status, status)
        
        if task.status == 'Completed':
            task.completed_on = frappe.utils.nowdate()
        else:
            task.completed_on = None
            
        task.save(ignore_permissions=True)
        
        if task.project:
            engine = CPMEngine(task.project)
            engine.compute()
            
        return {"success": True}
    except frappe.PermissionError:
        return {"success": False, "error": "Not permitted"}
    except Exception as e:
        return {"success": False, "error": str(e)}

@frappe.whitelist()
def update_task_dates(task_id, start, end):
    from erpnext_npdi_suite.erpnext_npdi_suite.engine.cpm import CPMEngine
    try:
        frappe.has_permission('Task', 'write', doc=task_id, throw=True)
        
        # Calculate duration
        from frappe.utils import date_diff
        start_date = start.split('T')[0]
        end_date = end.split('T')[0]
        duration_days = date_diff(end_date, start_date) + 1
        
        # Update task dates silently without triggering Frappe's check_if_latest or standard hooks.
        # This completely avoids TimestampMismatchError from concurrent React requests, 
        # and engine.compute() will natively handle all the heavy lifting and parent rollups anyway.
        frappe.db.set_value("Task", task_id, {
            "exp_start_date": start_date,
            "exp_end_date": end_date,
            "duration": duration_days
        })
        
        task_project = frappe.db.get_value('Task', task_id, 'project')
        if task_project:
            engine = CPMEngine(task_project)
            engine.compute()
            
        return {"success": True}
    except frappe.PermissionError:
        return {"success": False, "error": "Not permitted"}
    except Exception as e:
        return {"success": False, "error": str(e)}

@frappe.whitelist()
def update_project_task(task_id, task_data):
    """
    Update instantiated project task inline (name, duration, module, role).
    """
    import json
    from frappe.utils import add_days
    from erpnext_npdi_suite.erpnext_npdi_suite.engine.cpm import CPMEngine
    
    try:
        if isinstance(task_data, str):
            task_data = json.loads(task_data)
            
        task = frappe.get_doc('Task', task_id)
        task.check_permission('write')
        
        # Mapping frontend values
        if "name" in task_data:
            task.subject = task_data["name"]
        if "module" in task_data:
            module_map = {"core": "Core", "formula": "Formula", "pack": "Pack", "brand": "Brand"}
            task.npdi_module = module_map.get(str(task_data["module"]).lower(), task_data["module"])
        if "roleId" in task_data:
            task.npdi_responsible_role = task_data["roleId"]
        if "stageName" in task_data:
            task.npdi_stage_name = task_data["stageName"]
            
        # Update duration and dates if provided
        if "durationValue" in task_data and task.exp_start_date:
            duration_days = int(task_data["durationValue"])
            if duration_days > 0:
                task.expected_time = duration_days * 24  # Assuming hours for legacy, but dates are what matter
                task.exp_end_date = add_days(task.exp_start_date, duration_days - 1)
        
        task.flags.ignore_validate = True
        task.save(ignore_permissions=True)
        
        # Trigger CPM recalculation if project exists
        if task.project:
            engine = CPMEngine(task.project)
            engine.compute()
            
        return {"success": True}
    except frappe.PermissionError:
        return {"success": False, "error": "No tienes permisos para editar tareas."}
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "update_project_task")
        return {"success": False, "error": str(e)}

@frappe.whitelist()
def delete_task(task_id):
    """
    Delete a Task and trigger CPM recalculation for the project.
    """
    from erpnext_npdi_suite.erpnext_npdi_suite.engine.cpm import CPMEngine

    try:
        task = frappe.get_doc('Task', task_id)
        task.check_permission('delete')
        project = task.project
        frappe.delete_doc('Task', task_id)

        if project:
            engine = CPMEngine(project)
            engine.compute()

        return {"success": True}
    except frappe.PermissionError:
        return {"success": False, "error": "Not permitted"}
    except Exception as e:
        return {"success": False, "error": str(e)}

@frappe.whitelist()
def recalculate_cpm(project):
    """
    Manually force a full CPM recalculation for a given project.
    """
    from erpnext_npdi_suite.erpnext_npdi_suite.engine.cpm import CPMEngine

    try:
        frappe.has_permission('Project', 'write', doc=project, throw=True)
        engine = CPMEngine(project)
        engine.compute()
        return {"success": True, "message": "Ruta crítica recalculada exitosamente."}
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "Manual CPM Recalculation Error")
        return {"success": False, "error": str(e)}

@frappe.whitelist()
def add_task_dependency(task_id, depends_on):
    """
    Add a dependency relation: task_id depends on depends_on.
    """
    from erpnext_npdi_suite.erpnext_npdi_suite.engine.cpm import CPMEngine

    try:
        task = frappe.get_doc('Task', task_id)
        task.check_permission('write')
        exists = any(d.task == depends_on for d in task.depends_on)
        if not exists:
            task.append('depends_on', {
                'task': depends_on
            })
            task.save(ignore_permissions=True)
            if task.project:
                engine = CPMEngine(task.project)
                engine.compute()
        return {"success": True}
    except frappe.PermissionError:
        return {"success": False, "error": "Not permitted"}
    except Exception as e:
        return {"success": False, "error": str(e)}

@frappe.whitelist()
def capture_project_baseline(project_name):
    """
    Capture baseline for a project.
    """
    try:
        frappe.has_permission('Project', 'write', doc=project_name, throw=True)
        from erpnext_npdi_suite.erpnext_npdi_suite.engine import cpm
        res = cpm.capture_project_baseline(project_name)
        return {"success": True, "message": res.get("message") if isinstance(res, dict) else str(res)}
    except frappe.PermissionError:
        return {"success": False, "error": "Not permitted"}
    except frappe.ValidationError as e:
        return {"success": False, "error": str(e)}
    except Exception as e:
        return {"success": False, "error": str(e)}


# ── Project Template validation hook ──────────────────────────────────────────

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

    state = {node: 0 for node in all_tasks}

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


# ══════════════════════════════════════════════════════════════════════════════
# TEMPLATE EDITOR API — Ported from npdi_app reference
# Returns data shaped to match the npdi_app frontend component expectations.
# ══════════════════════════════════════════════════════════════════════════════

def _get_template_children(parent_row_name, template_doc):
    """Recursively collect all descendant child row names for a given parent."""
    children = []
    for row in template_doc.tasks:
        if row.task:
            parent_task_stub = frappe.db.get_value("Task", row.task, "parent_task")
            if parent_task_stub:
                # Find the row that owns that parent stub
                for pr in template_doc.tasks:
                    if pr.task == parent_task_stub and pr.name == parent_row_name:
                        children.append(row.name)
                        children.extend(_get_template_children(row.name, template_doc))
                        break
    return children


@frappe.whitelist()
def get_template_editor_data(template):
    """
    Returns template data shaped exactly like npdi_app's getTemplateDetail().
    Builds a tree structure with nested children, dependencies with nested objects.
    """
    try:
        template_doc = frappe.get_doc("Project Template", template)
        
        # Build flat task list with all needed fields
        flat_tasks = []
        for t in template_doc.tasks:
            parent_task_id = None
            is_group = 0
            is_milestone = 0
            if t.task:
                task_data = frappe.db.get_value(
                    "Task", t.task, 
                    ["parent_task", "is_group", "is_milestone"], 
                    as_dict=True
                )
                if task_data:
                    parent_task_id = task_data.parent_task
                    is_group = int(task_data.is_group or 0)
                    is_milestone = int(task_data.is_milestone or 0)
            
            # Resolve parentId: find the row name of the parent task in this template
            parent_row_name = None
            if parent_task_id:
                for other_row in template_doc.tasks:
                    if other_row.task == parent_task_id:
                        parent_row_name = other_row.name
                        break
            
            role_name = t.get("npdi_responsible_role") or ""
            module_val = (t.get("npdi_module") or "Core").lower()
            is_shared = module_val == "core"
            
            flat_tasks.append({
                "id": t.name,                          # child table row name (string)
                "task": t.task,                         # linked Task stub name
                "taskName": t.subject,
                "stageName": t.get("npdi_stage_name") or "General",
                "durationDays": int(getattr(t, "duration", 1) or 1),
                "durationUnit": t.get("npdi_duration_unit") or "days",
                "order": t.idx * 10,
                "roleId": role_name,                    # string, not int
                "responsibleRole": {"id": role_name, "name": role_name} if role_name else None,
                "module": module_val,
                "isShared": is_shared,
                "isMilestone": bool(is_milestone),
                "isLaunchMilestone": bool(int(t.get("npdi_launch_milestone", 0) or 0)),
                "description": t.get("description") or None,
                "parentId": parent_row_name,
                "is_group": is_group,
            })
        
        # Build dependency map: task_row_name → list of dependency objects
        dep_map = {}  # task_row_name → [{id, dependsOn: {id, taskName, stageName}}]
        for d in (template_doc.get("npdi_task_dependencies") or []):
            task_row = d.task
            dep_row = d.depends_on
            
            # Find the dep task's info
            dep_task_info = next((t for t in flat_tasks if t["id"] == dep_row), None)
            
            if dep_task_info:
                if task_row not in dep_map:
                    dep_map[task_row] = []
                dep_map[task_row].append({
                    "id": d.name,   # dependency row name
                    "dependsOn": {
                        "id": dep_task_info["id"],
                        "taskName": dep_task_info["taskName"],
                        "stageName": dep_task_info["stageName"]
                    }
                })
        
        # Attach dependencies to each task
        for t in flat_tasks:
            t["dependsOn"] = dep_map.get(t["id"], [])
            
            # Fallback to standard Frappe task dependencies
            if not t["dependsOn"] and t.get("task"):
                try:
                    standard_deps = frappe.get_all("Task Depends On", filters={"parent": t["task"]}, fields=["depends_on"])
                    for std_dep in standard_deps:
                        dep_row = next((r for r in flat_tasks if r["task"] == std_dep.depends_on), None)
                        if dep_row:
                            t["dependsOn"].append({
                                "id": "std_" + dep_row["id"],
                                "dependsOn": {
                                    "id": dep_row["id"],
                                    "taskName": dep_row["taskName"],
                                    "stageName": dep_row["stageName"]
                                }
                            })
                except Exception:
                    pass
        
        # Build tree structure
        task_map = {}
        for t in flat_tasks:
            t["children"] = []
            task_map[t["id"]] = t
        
        top_level = []
        for t in flat_tasks:
            if t["parentId"] and t["parentId"] in task_map:
                task_map[t["parentId"]]["children"].append(t)
            else:
                top_level.append(t)
        
        return {
            "success": True,
            "data": {
                "template": {
                    "id": template_doc.name,
                    "name": template_doc.name,
                },
                "tasks": top_level,
            }
        }
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "get_template_editor_data")
        return {"success": False, "error": str(e)}


@frappe.whitelist()
def upsert_template_task(template, task_data):
    """
    Create or update a template task row + its linked Task stub.
    Accepts all fields from the reference dialog.
    """
    try:
        if isinstance(task_data, str):
            task_data = json.loads(task_data)
            
        parent_doc = frappe.get_doc("Project Template", template)
        
        # Duration conversion
        duration_value = int(task_data.get("durationDays") or task_data.get("duration") or 1)
        duration_unit = task_data.get("durationUnit") or task_data.get("npdi_duration_unit") or "days"
        
        # Module mapping: "core" → "Core", etc.
        module_map = {"core": "Core", "formula": "Formula", "pack": "Pack", "brand": "Brand"}
        module_raw = (task_data.get("module") or task_data.get("npdi_module") or "core").lower()
        module_val = module_map.get(module_raw, "Core")
        
        # Stage name
        stage_name = task_data.get("stageName") or task_data.get("npdi_stage_name") or "General"
        
        # Role
        role_id = task_data.get("roleId") or task_data.get("npdi_responsible_role") or ""
        
        # Milestone flags
        is_milestone = bool(task_data.get("isMilestone", False))
        is_launch_milestone = bool(task_data.get("isLaunchMilestone") or task_data.get("npdi_launch_milestone", False))
        
        # Description
        description = task_data.get("description") or ""
        
        # Subject / name
        subject = task_data.get("name") or task_data.get("taskName") or task_data.get("subject") or "Untitled"
        
        # Parent task resolution
        parent_id = task_data.get("parentId") or task_data.get("parent_task")
        parent_task_stub = None
        if parent_id:
            # parent_id is a row name — find the linked Task stub
            for row in parent_doc.tasks:
                if row.name == parent_id:
                    parent_task_stub = row.task
                    break
        
        # Is shared
        is_shared = task_data.get("isShared", module_raw == "core")
        
        # If isLaunchMilestone, clear any previous launch milestone
        if is_launch_milestone:
            for row in parent_doc.tasks:
                if int(row.get("npdi_launch_milestone") or 0):
                    row.npdi_launch_milestone = 0
        
        task_row_name = task_data.get("id")
        task_stub_name = task_data.get("task")
        
        if task_row_name:
            # ── UPDATE existing row ──
            found = False
            for row in parent_doc.tasks:
                if row.name == task_row_name:
                    row.subject = subject
                    row.description = description
                    row.duration = duration_value
                    row.npdi_duration_unit = duration_unit
                    row.npdi_stage_name = stage_name
                    row.npdi_module = module_val
                    row.npdi_responsible_role = role_id
                    row.npdi_launch_milestone = int(is_launch_milestone)
                    
                    # Update linked Task stub
                    if row.task:
                        task_doc = frappe.get_doc("Task", row.task)
                        task_doc.subject = subject
                        task_doc.description = description
                        task_doc.is_milestone = int(is_milestone)
                        task_doc.is_group = 1 if parent_task_stub is None and _has_children(row.name, parent_doc) else int(task_doc.is_group or 0)
                        task_doc.parent_task = parent_task_stub
                        task_doc.save(ignore_permissions=True)
                    
                    found = True
                    break
            if not found:
                return {"success": False, "error": f"Task row {task_row_name} not found in template"}
        else:
            # ── CREATE new row ──
            # Create Task stub first
            task_doc = frappe.get_doc({
                "doctype": "Task",
                "subject": subject,
                "description": description,
                "is_milestone": int(is_milestone),
                "is_group": 0,
                "parent_task": parent_task_stub,
                "is_template": 1
            })
            task_doc.insert(ignore_permissions=True)
            task_stub_name = task_doc.name
            
            # Mark parent as group
            if parent_task_stub:
                frappe.db.set_value("Task", parent_task_stub, "is_group", 1)
            
            # Add child table row
            parent_doc.append("tasks", {
                "task": task_stub_name,
                "subject": subject,
                "description": description,
                "duration": duration_value,
                "npdi_duration_unit": duration_unit,
                "npdi_stage_name": stage_name,
                "npdi_module": module_val,
                "npdi_responsible_role": role_id,
                "npdi_launch_milestone": int(is_launch_milestone),
            })
            
            task_row_name = None  # will be set after save
            
            # If the new task has a parent, inherit parent's dependencies
            if parent_id:
                deps_to_inherit = []
                for dep in (parent_doc.get("npdi_task_dependencies") or []):
                    if dep.task == parent_id:
                        deps_to_inherit.append(dep.depends_on)
                # We'll add these after save when we have the row name
        
        parent_doc.save(ignore_permissions=True)
        
        # Get the saved row name
        if task_row_name is None:
            task_row_name = parent_doc.tasks[-1].name
            
            # Inherit parent dependencies for new tasks
            if parent_id and deps_to_inherit:
                for dep_row in deps_to_inherit:
                    try:
                        parent_doc.append("npdi_task_dependencies", {
                            "task": task_row_name,
                            "depends_on": dep_row
                        })
                    except Exception:
                        pass
                parent_doc.save(ignore_permissions=True)
        
        return {
            "success": True, 
            "task_row_name": task_row_name,
            "task": task_stub_name or parent_doc.tasks[-1].task
        }
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "upsert_template_task")
        return {"success": False, "error": str(e)}


def _has_children(row_name, template_doc):
    """Check if a template task row has children."""
    row = next((r for r in template_doc.tasks if r.name == row_name), None)
    if not row or not row.task:
        return False
    for other in template_doc.tasks:
        if other.task and other.name != row_name:
            parent_stub = frappe.db.get_value("Task", other.task, "parent_task")
            if parent_stub == row.task:
                return True
    return False


@frappe.whitelist()
def delete_template_task(template, task_row_name):
    """Delete a template task row and cascade-remove dependencies."""
    try:
        parent_doc = frappe.get_doc("Project Template", template)
        
        # Collect this task and all its descendants
        rows_to_delete = {task_row_name}
        
        def collect_children(row_name):
            row = next((r for r in parent_doc.tasks if r.name == row_name), None)
            if not row or not row.task:
                return
            for other in parent_doc.tasks:
                if other.task and other.name != row_name:
                    parent_stub = frappe.db.get_value("Task", other.task, "parent_task")
                    if parent_stub == row.task:
                        rows_to_delete.add(other.name)
                        collect_children(other.name)
        
        collect_children(task_row_name)
        
        # Remove dependencies referencing any of these tasks
        for d in list(parent_doc.get("npdi_task_dependencies") or []):
            if d.task in rows_to_delete or d.depends_on in rows_to_delete:
                parent_doc.remove(d)
        
        # Remove the task rows
        for t in list(parent_doc.tasks):
            if t.name in rows_to_delete:
                parent_doc.remove(t)
                
        parent_doc.save(ignore_permissions=True)
        return {"success": True}
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "delete_template_task")
        return {"success": False, "error": str(e)}


@frappe.whitelist()
def add_template_task_dependency(task_row_name, depends_on_row_name, template):
    """
    Add a template task dependency with full cycle detection and child propagation.
    Mirrors npdi_app's addTemplateTaskDependency().
    """
    try:
        if task_row_name == depends_on_row_name:
            return {"success": False, "error": "Una tarea no puede depender de sí misma."}
        
        parent_doc = frappe.get_doc("Project Template", template)
        
        # Check: task can't depend on its own parent
        task_row = next((r for r in parent_doc.tasks if r.name == task_row_name), None)
        dep_row = next((r for r in parent_doc.tasks if r.name == depends_on_row_name), None)
        
        if not task_row or not dep_row:
            return {"success": False, "error": "Una o ambas tareas no se encontraron en la plantilla."}
        
        # Check parent relationship
        if task_row.task:
            parent_stub = frappe.db.get_value("Task", task_row.task, "parent_task")
            if parent_stub and dep_row.task == parent_stub:
                return {"success": False, "error": "Una subtarea no puede depender directamente de su tarea padre."}
        
        # Collect children of the task (they'll also get the dependency)
        children_rows = []
        def collect_children(row_name):
            row = next((r for r in parent_doc.tasks if r.name == row_name), None)
            if not row or not row.task:
                return
            for other in parent_doc.tasks:
                if other.task and other.name != row_name:
                    ps = frappe.db.get_value("Task", other.task, "parent_task")
                    if ps == row.task:
                        children_rows.append(other.name)
                        collect_children(other.name)
        collect_children(task_row_name)
        
        # ── Cycle Detection (DFS) ──
        # Build adjacency from all existing dependencies + parent→child edges
        all_task_names = [r.name for r in parent_doc.tasks]
        adj = {name: [] for name in all_task_names}
        
        for d in (parent_doc.get("npdi_task_dependencies") or []):
            if d.task in adj:
                adj[d.task].append(d.depends_on)
        
        # Parent → child implicit edges
        for r in parent_doc.tasks:
            if r.task:
                ps = frappe.db.get_value("Task", r.task, "parent_task")
                if ps:
                    parent_row = next((pr for pr in parent_doc.tasks if pr.task == ps), None)
                    if parent_row and parent_row.name in adj:
                        adj[parent_row.name].append(r.name)
        
        # Simulate proposed edges
        adj[task_row_name].append(depends_on_row_name)
        for child_row in children_rows:
            if child_row in adj:
                adj[child_row].append(depends_on_row_name)
        
        # DFS cycle check
        visited = set()
        rec_stack = set()
        has_cycle = False
        
        def dfs(node):
            nonlocal has_cycle
            if has_cycle:
                return
            if node in rec_stack:
                has_cycle = True
                return
            if node in visited:
                return
            visited.add(node)
            rec_stack.add(node)
            for n in adj.get(node, []):
                dfs(n)
            rec_stack.discard(node)
        
        for name in all_task_names:
            if name not in visited and not has_cycle:
                dfs(name)
        
        if has_cycle:
            return {"success": False, "error": "No se puede agregar esta dependencia porque generaría un ciclo circular."}
        
        # ── Add the dependencies ──
        rows_to_add = [task_row_name] + children_rows
        
        for row_name in rows_to_add:
            # Check if already exists
            already_exists = False
            for d in (parent_doc.get("npdi_task_dependencies") or []):
                if d.task == row_name and d.depends_on == depends_on_row_name:
                    already_exists = True
                    break
            
            if not already_exists:
                parent_doc.append("npdi_task_dependencies", {
                    "task": row_name,
                    "depends_on": depends_on_row_name
                })
        
        parent_doc.save(ignore_permissions=True)
        return {"success": True}
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "add_template_task_dependency")
        return {"success": False, "error": str(e)}


@frappe.whitelist()
def remove_template_task_dependency(dep_row_name, template):
    """
    Remove a template task dependency and cascade from children.
    """
    try:
        parent_doc = frappe.get_doc("Project Template", template)
        
        # Find the dependency record
        dep_record = None
        for d in (parent_doc.get("npdi_task_dependencies") or []):
            if d.name == dep_row_name:
                dep_record = d
                break
        
        if not dep_record:
            return {"success": True}  # Already gone
        
        task_row_name = dep_record.task
        depends_on_row_name = dep_record.depends_on
        
        # Collect children that also have this dependency
        children_rows = []
        def collect_children(row_name):
            row = next((r for r in parent_doc.tasks if r.name == row_name), None)
            if not row or not row.task:
                return
            for other in parent_doc.tasks:
                if other.task and other.name != row_name:
                    ps = frappe.db.get_value("Task", other.task, "parent_task")
                    if ps == row.task:
                        children_rows.append(other.name)
                        collect_children(other.name)
        collect_children(task_row_name)
        
        # Remove dependency from task + all children
        affected = {task_row_name} | set(children_rows)
        for d in list(parent_doc.get("npdi_task_dependencies") or []):
            if d.depends_on == depends_on_row_name and d.task in affected:
                parent_doc.remove(d)
        
        parent_doc.save(ignore_permissions=True)
        return {"success": True}
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "remove_template_task_dependency")
        return {"success": False, "error": str(e)}


@frappe.whitelist()
def add_stage_template_dependency(template, stage_name, depends_on_row_name):
    """
    Apply a milestone dependency to ALL tasks in a given stage.
    """
    try:
        parent_doc = frappe.get_doc("Project Template", template)
        
        # Verify depends_on is a milestone
        dep_row = next((r for r in parent_doc.tasks if r.name == depends_on_row_name), None)
        if not dep_row:
            return {"success": False, "error": "Tarea de dependencia no encontrada."}
        
        if dep_row.task:
            is_milestone = frappe.db.get_value("Task", dep_row.task, "is_milestone")
            if not is_milestone:
                return {"success": False, "error": "Solo se pueden establecer dependencias de etapa hacia tareas hito (milestones)."}
        
        # Find all tasks in the stage
        stage_tasks = [r for r in parent_doc.tasks if (r.get("npdi_stage_name") or "General") == stage_name]
        
        if not stage_tasks:
            return {"success": True}
        
        # Add dependency to each stage task using existing logic
        errors = []
        for task_row in stage_tasks:
            res = add_template_task_dependency(task_row.name, depends_on_row_name, template)
            if isinstance(res, str):
                res = json.loads(res)
            if not res.get("success"):
                if "circular" in (res.get("error") or ""):
                    return res
                errors.append(res.get("error"))
        
        return {"success": True}
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "add_stage_template_dependency")
        return {"success": False, "error": str(e)}


@frappe.whitelist()
def remove_stage_template_dependency(template, stage_name, depends_on_row_name):
    """
    Remove a milestone dependency from ALL tasks in a given stage.
    """
    try:
        parent_doc = frappe.get_doc("Project Template", template)
        
        # Find all tasks in the stage
        stage_task_names = set()
        for r in parent_doc.tasks:
            if (r.get("npdi_stage_name") or "General") == stage_name:
                stage_task_names.add(r.name)
                # Also include children
                if r.task:
                    for other in parent_doc.tasks:
                        if other.task:
                            ps = frappe.db.get_value("Task", other.task, "parent_task")
                            if ps == r.task:
                                stage_task_names.add(other.name)
        
        # Remove matching dependencies
        for d in list(parent_doc.get("npdi_task_dependencies") or []):
            if d.depends_on == depends_on_row_name and d.task in stage_task_names:
                parent_doc.remove(d)
        
        parent_doc.save(ignore_permissions=True)
        return {"success": True}
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "remove_stage_template_dependency")
        return {"success": False, "error": str(e)}


@frappe.whitelist()
def get_template_preview_data(template):
    return get_template_editor_data(template)


@frappe.whitelist()
def create_project_from_npdi_template(project_data):
    # Placeholder
    return {"success": True, "data": {}}


@frappe.whitelist()
def get_project_dashboard_data():
    """
    Returns aggregated dashboard statistics and a list of active NPDI projects.
    """
    try:
        print("====== DEBUGGING GET PROJECT DASHBOARD DATA WITH BASELINE ======")
        active_projects = frappe.get_all(
            "Project",
            filters={"status": "Open"},
            fields=["name", "project_name", "expected_end_date", "status", "npdi_baseline_end", "npdi_baseline_locked"]
        )

        total_active = len(active_projects)
        delayed_tasks = 0
        global_progress_sum = 0.0

        projects = []
        all_tasks = []
        unique_owners = set()

        for proj in active_projects:
            tasks = frappe.get_all(
                "Task",
                filters={"project": proj.name},
                fields=["name as id", "subject as taskName", "status", "exp_end_date", "exp_start_date", "npdi_stage_name", "task_owner"],
                order_by="exp_start_date asc"
            )

            completed = 0
            total = len(tasks)
            delayed = 0
            for t in tasks:
                if t.status == "Completed":
                    completed += 1
                
                is_delayed = t.status == "Overdue" or (t.exp_end_date and frappe.utils.getdate(t.exp_end_date) < frappe.utils.getdate() and t.status != "Completed")

                if is_delayed:
                    delayed += 1
                
                if t.task_owner:
                    unique_owners.add(t.task_owner)
                    
                all_tasks.append({
                    "id": t.id,
                    "taskName": t.taskName,
                    "status": t.status,
                    "project": proj.name,
                    "projectName": proj.project_name or proj.name,
                    "stage": t.npdi_stage_name or "-",
                    "startDate": str(t.exp_start_date or ""),
                    "endDate": str(t.exp_end_date or ""),
                    "owner": t.task_owner or "Sin asignar",
                    "isDelayed": bool(is_delayed)
                })

            active_task = next((t for t in tasks if t.status not in ("Completed", "Cancelled", "Template", "Skipped")), None)
            
            current_stage = "-"
            if active_task and active_task.npdi_stage_name:
                current_stage = active_task.npdi_stage_name
            elif total > 0 and completed == total:
                current_stage = "Completado"

            progress = round((completed / total * 100), 1) if total > 0 else 0.0

            delayed_tasks += delayed
            global_progress_sum += progress

            projects.append({
                "name": proj.name,
                "title": proj.project_name or proj.name,
                "stage": current_stage,
                "targetLaunchDate": str(proj.expected_end_date or ""),
                "baselineLaunchDate": str(proj.npdi_baseline_end or ""),
                "isBaselineLocked": bool(proj.npdi_baseline_locked),
                "progress": progress,
                "status": "Active" if proj.status == "Open" else proj.status
            })

        global_progress = round(global_progress_sum / total_active, 1) if total_active > 0 else 0.0

        data = {
            "stats": {
                "activeProjects": total_active,
                "delayedTasks": delayed_tasks,
                "globalProgress": global_progress
            },
            "projects": projects,
            "tasks": all_tasks,
            "owners": list(unique_owners)
        }

        return {"success": True, "data": data}

    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "get_project_dashboard_data")
        return {"success": False, "data": None, "error": str(e)}


# ══════════════════════════════════════════════════════════════════════════════
# TASK DETAIL DRAWER API — Phase 1 UI Parity
# Provides rich task detail, comments, dependency management for the
# slide-out TaskDetailDrawer component.
# ══════════════════════════════════════════════════════════════════════════════

@frappe.whitelist()
def get_task_detail(task_id):
    """Return comprehensive task data for the slide-out drawer."""
    try:
        task = frappe.get_doc("Task", task_id)
        task.check_permission("read")

        # Status mapping (ERPNext → UI)
        status_map = {
            'Open': 'Pending',
            'Working': 'In Progress',
            'Pending Review': 'Awaiting Approval',
            'Completed': 'Completed',
            'Overdue': 'Blocked',
            'Cancelled': 'Skipped'
        }

        # Parse task_owner (custom field)
        assigned_to = None
        if task.get("task_owner"):
            try:
                user_email = task.task_owner
                full_name = frappe.db.get_value("User", user_email, "full_name") or user_email
                assigned_to = {"name": full_name, "email": user_email}
            except Exception:
                pass
        # Dependencies (tasks this one depends on)
        dependencies = []
        for dep in (task.depends_on or []):
            try:
                dep_data = frappe.db.get_value("Task", dep.task,
                    ["name", "subject", "status", "npdi_stage_name"], as_dict=True)
                if dep_data:
                    dependencies.append({
                        "id": dep_data.name,
                        "name": dep_data.subject,
                        "status": status_map.get(dep_data.status, dep_data.status),
                        "stageName": dep_data.npdi_stage_name or "General"
                    })
            except Exception:
                continue

        # Blocked by (tasks that depend on THIS task - reverse lookup)
        blocked_by = []
        blocking_links = frappe.get_all("Task Depends On",
            filters={"task": task_id},
            fields=["parent"])
        for link in blocking_links:
            try:
                parent_data = frappe.db.get_value("Task", link.parent,
                    ["name", "subject", "status", "npdi_stage_name"], as_dict=True)
                if parent_data:
                    blocked_by.append({
                        "id": parent_data.name,
                        "name": parent_data.subject,
                        "status": status_map.get(parent_data.status, parent_data.status),
                        "stageName": parent_data.npdi_stage_name or "General"
                    })
            except Exception:
                continue

        # Comments (using Frappe's native Comment doctype)
        raw_comments = frappe.get_all("Comment",
            filters={
                "reference_doctype": "Task",
                "reference_name": task_id,
                "comment_type": "Comment"
            },
            fields=["name", "content", "owner", "creation"],
            order_by="creation asc")
        comments = []
        for c in raw_comments:
            author_name = frappe.db.get_value("User", c.owner, "full_name") or c.owner
            comments.append({
                "id": c.name,
                "content": c.content,
                "author": {"name": author_name},
                "createdAt": str(c.creation)
            })

        # Attachments
        attachments = frappe.get_all("File",
            filters={
                "attached_to_doctype": "Task",
                "attached_to_name": task_id
            },
            fields=["name", "file_url", "file_name"])

        if task.exp_start_date and task.exp_end_date:
            from frappe.utils import date_diff
            duration_days = date_diff(task.exp_end_date, task.exp_start_date) + 1
        else:
            duration_days = int(task.duration or 0)

        data = {
            "id": task.name,
            "name": task.subject,
            "status": status_map.get(task.status, task.status),
            "planStartDate": str(task.exp_start_date) if task.exp_start_date else None,
            "planEndDate": str(task.exp_end_date) if task.exp_end_date else None,
            "parentTaskId": task.parent_task,
            "project": task.project,
            "isMilestone": bool(task.is_milestone),
            "isGroup": bool(task.is_group),
            "durationDays": duration_days,
            "completedOn": str(task.completed_on) if task.completed_on else None,
            "description": task.description,
            "role": {"name": task.get("npdi_responsible_role") or ""},
            "assignedTo": assigned_to,
            "stageName": task.get("npdi_stage_name") or "General",
            "npdiModule": task.get("npdi_module") or "Core",
            "requiresAttachment": bool(task.get("npdi_requires_attachment")),
            "isLaunchMilestone": bool(task.get("npdi_launch_milestone")),
            "isCritical": bool(task.get("npdi_cpm_is_critical")),
            "slack": float(task.get("npdi_cpm_total_float") or 0),
            "isFixed": bool(task.get("npdi_cpm_manual_dates")),
            "manualStartDate": str(task.get("npdi_manual_start")) if task.get("npdi_manual_start") else None,
            "baselineStartDate": str(task.get("npdi_baseline_start")) if task.get("npdi_baseline_start") else None,
            "baselineEndDate": str(task.get("npdi_baseline_end")) if task.get("npdi_baseline_end") else None,
            "dependencies": dependencies,
            "blockedBy": blocked_by,
            "comments": comments,
            "attachments": attachments,
            "isSkipped": task.status == "Cancelled",
        }
        return {"success": True, "data": data}

    except frappe.PermissionError:
        return {"success": False, "error": "No tienes permisos para ver esta tarea."}
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "get_task_detail")
        return {"success": False, "error": str(e)}


@frappe.whitelist()
def add_task_comment(task_id, content):
    """Add a comment to a task using Frappe's native Comment doctype."""
    try:
        task = frappe.get_doc("Task", task_id)
        task.check_permission("write")

        comment = frappe.get_doc({
            "doctype": "Comment",
            "comment_type": "Comment",
            "reference_doctype": "Task",
            "reference_name": task_id,
            "content": content
        }).insert(ignore_permissions=True)

        author_name = frappe.db.get_value("User", comment.owner, "full_name") or comment.owner

        return {
            "success": True,
            "comment": {
                "id": comment.name,
                "content": comment.content,
                "author": {"name": author_name},
                "createdAt": str(comment.creation)
            }
        }
    except frappe.PermissionError:
        return {"success": False, "error": "No tienes permisos para comentar."}
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "add_task_comment")
        return {"success": False, "error": str(e)}


@frappe.whitelist()
def upload_task_attachment(task_id, filename, filedata):
    """Upload a file to a Task using base64 encoded data."""
    try:
        task = frappe.get_doc("Task", task_id)
        task.check_permission("write")

        if filedata.startswith("data:"):
            filedata = filedata.split(",", 1)[1]

        file_doc = frappe.get_doc({
            "doctype": "File",
            "file_name": filename,
            "attached_to_doctype": "Task",
            "attached_to_name": task_id,
            "content": filedata,
            "decode_base64": 1,
            "is_private": 0
        })
        file_doc.save(ignore_permissions=True)

        return {
            "success": True,
            "attachment": {
                "name": file_doc.name,
                "file_name": file_doc.file_name,
                "file_url": file_doc.file_url
            }
        }
    except frappe.PermissionError:
        return {"success": False, "error": "No tienes permisos para subir archivos."}
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "upload_task_attachment")
        return {"success": False, "error": str(e)}



@frappe.whitelist()
def delete_task_comment(comment_id):
    """Delete a comment by its ID."""
    try:
        comment = frappe.get_doc("Comment", comment_id)
        if comment.reference_doctype == "Task":
            task = frappe.get_doc("Task", comment.reference_name)
            task.check_permission("write")
        frappe.delete_doc("Comment", comment_id, ignore_permissions=True)
        return {"success": True}
    except frappe.PermissionError:
        return {"success": False, "error": "No tienes permisos para eliminar comentarios."}
    except frappe.DoesNotExistError:
        return {"success": False, "error": "Comentario no encontrado."}
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "delete_task_comment")
        return {"success": False, "error": str(e)}


@frappe.whitelist()
def remove_task_dependency(task_id, depends_on):
    """Remove a dependency and trigger CPM recalculation."""
    from erpnext_npdi_suite.erpnext_npdi_suite.engine.cpm import CPMEngine

    try:
        task = frappe.get_doc("Task", task_id)
        task.check_permission("write")

        removed = False
        for dep in list(task.depends_on or []):
            if dep.task == depends_on:
                task.remove(dep)
                removed = True
                break

        if not removed:
            return {"success": False, "error": "Dependencia no encontrada."}

        task.save(ignore_permissions=True)

        if task.project:
            engine = CPMEngine(task.project)
            engine.compute()

        return {"success": True}
    except frappe.PermissionError:
        return {"success": False, "error": "No tienes permisos."}
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "remove_task_dependency")
        return {"success": False, "error": str(e)}


@frappe.whitelist()
def assign_task_user(task_id, user_email=None):
    """Assign a user to the task, or clear assignment if no email provided."""
    from frappe.desk.form.assign_to import add as assign_add, clear as assign_clear

    try:
        task = frappe.get_doc("Task", task_id)
        task.check_permission("write")

        if user_email:
            assign_add({
                "assign_to": [user_email],
                "doctype": "Task",
                "name": task_id
            })
        else:
            assign_clear("Task", task_id)

        return {"success": True}
    except frappe.PermissionError:
        return {"success": False, "error": "No tienes permisos."}
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "assign_task_user")
        return {"success": False, "error": str(e)}


@frappe.whitelist()
def update_task_duration(task_id, duration_days):
    """Update task duration, recalculate end date, and trigger CPM."""
    from frappe.utils import add_days
    from erpnext_npdi_suite.erpnext_npdi_suite.engine.cpm import CPMEngine

    try:
        task = frappe.get_doc("Task", task_id)
        task.check_permission("write")

        duration_days = int(duration_days)
        if duration_days < 1:
            return {"success": False, "error": "La duración debe ser al menos 1 día."}

        task.duration = duration_days
        if task.exp_start_date:
            task.exp_end_date = add_days(task.exp_start_date, duration_days - 1)

        task.flags.ignore_validate = True
        task.save(ignore_permissions=True)

        if task.project:
            engine = CPMEngine(task.project)
            engine.compute()

        return {"success": True, "exp_end_date": str(task.exp_end_date) if task.exp_end_date else None}
    except frappe.PermissionError:
        return {"success": False, "error": "No tienes permisos."}
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "update_task_duration")
        return {"success": False, "error": str(e)}
import frappe
from frappe import _
from typing import List, Dict, Optional
import csv
from io import StringIO
from collections import defaultdict, deque

@frappe.whitelist()
def create_empty_template(template_name):
    try:
        if frappe.db.exists("Project Template", template_name):
            return {"success": False, "error": f"La plantilla '{template_name}' ya existe."}
            
        doc = frappe.get_doc({
            "doctype": "Project Template",
            "name": template_name,
            "project_template_name": template_name,
            "project_type": "Internal"
        })
        doc.insert(ignore_mandatory=True)
        return {"success": True, "name": doc.name}
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "create_empty_template Error")
        return {"success": False, "error": str(e)}

@frappe.whitelist()
def get_erpnext_roles():
    """Returns a list of active ERPNext roles formatted for the frontend."""
    try:
        roles = frappe.get_all("Role", filters={"disabled": 0}, fields=["name as id", "role_name as name"])
        return {"success": True, "data": roles}
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "get_erpnext_roles Error")
        return {"success": False, "error": str(e), "data": []}

@frappe.whitelist()
def get_template_list():
    """Return list of all Project Templates with summary info."""
    try:
        templates = frappe.get_all(
            "Project Template",
            fields=["name", "project_type"]
        )
        result = []
        for t in templates:
            description = t.project_type or "" 
            result.append({
                "name": t.name,
                "description": description,
                "module": "Core",
                "taskCount": 0,
                "durationDays": 0
            })
        return {"success": True, "data": result}
    except Exception as e:
        frappe.log_error(f"Error in get_template_list: {str(e)}")
        return {"success": False, "error": str(e)}

def _compute_longest_path(tasks: List[Dict], deps: List[Dict]) -> float:
    """Compute longest path duration using CPM logic.
    tasks: list of dicts with 'name' (row name) and 'duration'.
    deps: list of dicts with 'task' and 'depends_on' (both are row names? or actual task links? 
    Assumes dependencies are between tasks in the same template; we use row names for mapping.
    For simplicity, we assume 'task' field contains the row name of the dependent task, 
    and 'depends_on' contains the row name of the predecessor task.
    In real usage, these might be links to Task doctype. We'll adjust based on actual schema.
    Here we treat them as row names (i.e., the `name` field in child table) for mapping.
    """
    if not tasks:
        return 0

    # Build graph: task -> list of predecessors (tasks that must finish before this task)
    # Also duration map
    dur_map = {t["name"]: t.get("duration", 0) or 0 for t in tasks}
    predecessors = defaultdict(list)
    all_task_names = {t["name"] for t in tasks}

    for dep in deps:
        task_name = dep.get("task")
        dep_on = dep.get("depends_on")
        if task_name in all_task_names and dep_on in all_task_names:
            # task depends on dep_on
            predecessors[task_name].append(dep_on)

    # Topological sort to get longest path
    # We'll use DP: longest_path[node] = max over predecessors(longest_path[pre] + dur[node])
    # First find nodes with no predecessors
    in_degree = {name: 0 for name in all_task_names}
    for pred_list in predecessors.values():
        for p in pred_list:
            if p in in_degree:
                in_degree[p] += 1  # This is incorrect; we need in-degree for dependency direction.
                # Actually we want nodes that are sources: they have no predecessors.
                # Let's recalc: in_degree should be number of predecessors for each node.
    # Simpler: compute DP via DFS or use Kahn's algorithm.
    # We'll do DFS with memoization.
    longest = {}
    def dfs(node):
        if node in longest:
            return longest[node]
        if node not in dur_map:
            # should not happen
            longest[node] = 0
            return 0
        max_pred = 0
        for pred in predecessors.get(node, []):
            max_pred = max(max_pred, dfs(pred))
        longest[node] = max_pred + dur_map[node]
        return longest[node]

    max_dur = 0
    for name in all_task_names:
        max_dur = max(max_dur, dfs(name))
    return max_dur

@frappe.whitelist()
def duplicate_template(template_name: str):
    """Deep duplicate a Project Template with new Task stubs."""
    try:
        source = frappe.get_doc("Project Template", template_name)
        new_name = f"Copy of {template_name}"
        # Ensure unique name (simple increment)
        counter = 1
        while frappe.db.exists("Project Template", new_name):
            new_name = f"Copy of {template_name} ({counter})"
            counter += 1

        # Create new Project Template doc
        new_template = frappe.new_doc("Project Template")
        new_template.update({
            "name": new_name,
            "description": source.description,
            "project_type": source.project_type,
            "npdi_template_module": source.npdi_template_module,
            # other fields...
        })

        # We'll handle child tables manually after insertion to avoid automatic linking
        # First insert the template (without children)
        new_template.flags.ignore_mandatory = True  # in case children are required
        new_template.insert(ignore_permissions=True)

        # Now duplicate tasks and create new Task stubs
        old_to_new_task_map = {}  # mapping old Task name -> new Task name
        old_child_row_to_new_child_row = {}  # mapping old child row name -> new child row name (for dependencies)
        new_tasks_child = []
        new_deps_child = []

        # First pass: create new Task docs and child rows for tasks
        for child in source.get("tasks"):
            old_task_name = child.task
            # Get the original Task stub (must be template)
            if not old_task_name:
                continue
            old_task = frappe.get_doc("Task", old_task_name)
            # Create new Task doc with same fields but new name
            new_task = frappe.copy_doc(old_task)
            new_task.name = None
            new_task.is_template = 1  # ensure it's a template
            new_task.title = f"Copy of {old_task.title}" if old_task.title else None
            new_task.insert(ignore_permissions=True)
            new_task_name = new_task.name
            old_to_new_task_map[old_task_name] = new_task_name

            # Create new child row for Project Template Task
            new_child = frappe.new_doc("Project Template Task")
            new_child.parent = new_template.name
            new_child.parentfield = "tasks"
            new_child.parenttype = "Project Template"
            new_child.task = new_task_name
            new_child.duration = child.get("duration", 0)
            new_child.npdi_stage_name = child.get("npdi_stage_name")
            new_child.npdi_module = child.get("npdi_module")
            new_child.npdi_responsible_role = child.get("npdi_responsible_role")
            new_child.npdi_launch_milestone = child.get("npdi_launch_milestone")
            if child.get("parent_task"):
                new_child.set("parent_task", child.get("parent_task"))
            new_child.insert(ignore_permissions=True)
            old_child_row_to_new_child_row[child.name] = new_child.name
            new_tasks_child.append(new_child)

        # Update parent_task references in the new child rows
        for new_child, old_child in zip(new_tasks_child, source.get("tasks")):
            old_parent_task = old_child.parent_task
            if old_parent_task:
                if old_parent_task in old_to_new_task_map:
                    new_parent_task = old_to_new_task_map[old_parent_task]
                    # Update the child row
                    frappe.db.set_value("Project Template Task", new_child.name, "parent_task", new_parent_task)
                else:
                    # If the parent task was not in this template (maybe shared), we keep old reference?
                    # Better to unset or raise? For safety, we keep but log.
                    frappe.log_error(f"Parent task {old_parent_task} not mapped, check duplicates")
            else:
                # no parent
                pass

        # Handle npdi_task_dependencies child table
        for dep in source.get("npdi_task_dependencies"):
            old_task = dep.task
            old_depends_on = dep.depends_on
            new_task = old_to_new_task_map.get(old_task)
            new_depends_on = old_to_new_task_map.get(old_depends_on)
            if not new_task or not new_depends_on:
                # Could not map, skip or throw? skip with warning
                frappe.log_error(f"Could not map dependency for template {template_name}, task {old_task} or depends_on {old_depends_on}")
                continue
            # Create new dependency child row
            new_dep = frappe.new_doc("npdi_task_dependencies")
            new_dep.parent = new_template.name
            new_dep.parentfield = "npdi_task_dependencies"
            new_dep.parenttype = "Project Template"
            new_dep.task = new_task
            new_dep.depends_on = new_depends_on
            new_dep.insert(ignore_permissions=True)
            new_deps_child.append(new_dep)

        # Optionally flush changes
        frappe.db.commit()

        return {"success": True, "new_template_name": new_name}
    except Exception as e:
        frappe.log_error(f"Error duplicating template {template_name}: {str(e)}")
        frappe.throw(_("Failed to duplicate template"))

@frappe.whitelist()
def export_template_csv(template_name: str):
    """Export template tasks as an enriched CSV string for portability."""
    try:
        template = frappe.get_doc("Project Template", template_name)
        tasks = template.get("tasks")
        deps = template.get("npdi_task_dependencies")
        
        # Build dependency mapping (dependent_row_name -> list of predecessor_row_names)
        dep_map = defaultdict(list)
        for d in (deps or []):
            dep_map[d.task].append(d.depends_on)
        
        # 1. Fetch Task data & assign CSV IDs
        task_data_map = {}
        row_csv_id_map = {} # Project Template Task row name -> csv_id
        task_csv_id_map = {} # Task name -> csv_id
        current_id = 1
        
        for t in tasks:
            if t.task:
                task_doc = frappe.db.get_value(
                    "Task", t.task, 
                    ["subject", "description", "is_group", "is_milestone", "parent_task"], 
                    as_dict=True
                )
                if task_doc:
                    task_data_map[t.task] = task_doc
                    row_csv_id_map[t.name] = str(current_id)
                    task_csv_id_map[t.task] = str(current_id)
                    current_id += 1
        
        output = StringIO()
        writer = csv.writer(output)
        writer.writerow([
            "ID", "Subject", "Description", "Is Group", "Is Milestone", "Parent ID", 
            "Duration Days", "Duration Unit", "Stage Name", "Module", "Role", 
            "Requires Attachment", "Launch Milestone", "Depends On IDs"
        ])
        
        for t in tasks:
            if not t.task or t.name not in row_csv_id_map:
                continue
                
            tdoc = task_data_map[t.task]
            csv_id = row_csv_id_map[t.name]
            parent_id = task_csv_id_map.get(tdoc.parent_task, "")
            
            # Map depends on row names to CSV IDs
            task_deps = dep_map.get(t.name, [])
            dep_csv_ids = [row_csv_id_map[d] for d in task_deps if d in row_csv_id_map]
            
            writer.writerow([
                csv_id,
                tdoc.subject or "",
                tdoc.description or "",
                1 if tdoc.is_group else 0,
                1 if tdoc.is_milestone else 0,
                parent_id,
                t.get("duration", 0),
                t.get("npdi_duration_unit", "Day"),
                t.get("npdi_stage_name", ""),
                t.get("npdi_module", ""),
                t.get("npdi_responsible_role", ""),
                1 if t.get("npdi_requires_attachment") else 0,
                1 if t.get("npdi_launch_milestone") else 0,
                ",".join(dep_csv_ids)
            ])
            
        csv_string = output.getvalue()
        output.close()
        return {"success": True, "csv": csv_string}
    except Exception as e:
        frappe.log_error(f"Error exporting template {template_name}: {str(e)}")
        frappe.throw(_("Failed to export template as CSV"))

@frappe.whitelist()
def import_template_csv(template_name: str, csv_data: str):
    """Import an enriched CSV string to create a new Project Template."""
    try:
        import base64
        # If csv_data comes as data URI, extract base64 part
        if csv_data.startswith("data:"):
            csv_data = base64.b64decode(csv_data.split(",")[1]).decode("utf-8")

        reader = csv.reader(StringIO(csv_data))
        header = next(reader, None) # skip header
        
        # If template exists, delete it
        if frappe.db.exists("Project Template", template_name):
            frappe.delete_doc("Project Template", template_name, ignore_permissions=True, force=True)
            frappe.db.commit()
            
        csv_rows = []
        for row in reader:
            if not row or not row[0].strip(): continue
            csv_rows.append(row)
            
        if not csv_rows:
            return {"success": False, "error": "CSV empty or invalid."}
            
        csv_id_to_task_name = {}
        
        # Pass 1: Create flat Task objects
        for row in csv_rows:
            csv_id = row[0].strip()
            subject = row[1].strip()
            task_doc = frappe.new_doc("Task")
            task_doc.subject = subject
            task_doc.description = row[2].strip() if len(row) > 2 else ""
            task_doc.is_group = 1 if len(row) > 3 and str(row[3]).strip() in ["1", "true", "True"] else 0
            task_doc.is_milestone = 1 if len(row) > 4 and str(row[4]).strip() in ["1", "true", "True"] else 0
            task_doc.is_template = 1
            task_doc.insert(ignore_permissions=True)
            csv_id_to_task_name[csv_id] = task_doc.name
            
        # Pass 2: Setup Parent-Child Task relationships
        for row in csv_rows:
            csv_id = row[0].strip()
            parent_id = row[5].strip() if len(row) > 5 else ""
            if parent_id and parent_id in csv_id_to_task_name:
                frappe.db.set_value("Task", csv_id_to_task_name[csv_id], "parent_task", csv_id_to_task_name[parent_id])
                
        # Pass 3: Build Project Template Task rows
        pt_rows = []
        for row in csv_rows:
            csv_id = row[0].strip()
            duration = int(float(row[6].strip() or 0)) if len(row) > 6 else 0
            pt_rows.append({
                "task": csv_id_to_task_name[csv_id],
                "subject": row[1].strip(),
                "duration": duration,
                "npdi_duration_unit": row[7].strip() if len(row) > 7 else "Day",
                "npdi_stage_name": row[8].strip() if len(row) > 8 else "",
                "npdi_module": row[9].strip() if len(row) > 9 else "",
                "npdi_responsible_role": row[10].strip() if len(row) > 10 else "",
                "npdi_requires_attachment": 1 if len(row) > 11 and str(row[11]).strip() in ["1", "true", "True"] else 0,
                "npdi_launch_milestone": 1 if len(row) > 12 and str(row[12]).strip() in ["1", "true", "True"] else 0,
            })
            
        template_doc = frappe.get_doc({
            "doctype": "Project Template",
            "name": template_name,
            "project_template_name": template_name,
            "project_type": "Internal",
            "tasks": pt_rows
        })
        template_doc.insert(ignore_permissions=True)
        frappe.db.commit()
        
        # Pass 4: Rebuild dependencies (npdi_task_dependencies)
        pt_task_map = {}
        for t in template_doc.tasks:
            pt_task_map[t.task] = t.name
            
        for row in csv_rows:
            csv_id = row[0].strip()
            depends_on_str = row[13].strip() if len(row) > 13 else ""
            if not depends_on_str: continue
            
            parent_task_name = csv_id_to_task_name[csv_id]
            parent_row_name = pt_task_map.get(parent_task_name)
            
            dep_ids = [d.strip() for d in depends_on_str.split(",") if d.strip()]
            for did in dep_ids:
                if did in csv_id_to_task_name:
                    dep_task_name = csv_id_to_task_name[did]
                    dep_row_name = pt_task_map.get(dep_task_name)
                    if parent_row_name and dep_row_name:
                        template_doc.append("npdi_task_dependencies", {
                            "task": parent_row_name,
                            "depends_on": dep_row_name
                        })
        template_doc.save(ignore_permissions=True)
        frappe.db.commit()
            
        return {"success": True, "name": template_doc.name}
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "import_template_csv")
        return {"success": False, "error": str(e)}



# ══════════════════════════════════════════════════════════════════════════════
# PROJECT CREATION API
# ══════════════════════════════════════════════════════════════════════════════

@frappe.whitelist()
def get_frappe_users_for_project():
    """Return list of Frappe users who can be project owners."""
    try:
        users = frappe.get_all(
            "User",
            filters={
                "enabled": 1,
                "user_type": "System User",
                "name": ["not in", ["Administrator", "Guest"]]
            },
            fields=["name as email", "full_name"],
            order_by="full_name asc"
        )
        return {"success": True, "data": users}
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "get_frappe_users_for_project")
        return {"success": False, "error": str(e)}


@frappe.whitelist()
def create_project_from_template(project_name, template_name, start_date, owner=None, task_overrides=None, role_assignments=None):
    """
    Creates a Frappe Project from a Project Template, then applies optional
    task overrides (duration changes, skipped tasks).

    Args:
        project_name: Name for the new project
        template_name: Project Template to base the project on
        start_date: Project start date (YYYY-MM-DD)
        owner: Frappe user email to assign as project owner (optional)
        task_overrides: JSON string of [{templateTaskRowName, durationDays, isSkipped}]
        role_assignments: JSON string of { roleName: userEmail } mapping
    """
    from erpnext_npdi_suite.erpnext_npdi_suite.engine.cpm import CPMEngine
    import json as json_module

    try:
        # 1. Create the Project document
        project = frappe.get_doc({
            "doctype": "Project",
            "project_name": project_name,
            "project_template": template_name,
            "expected_start_date": start_date,
            "expected_end_date": frappe.utils.add_days(start_date, 3650),  # Temporary far future date to bypass Task validation
            "status": "Open",
        })

        if owner:
            project.owner = owner

        # Insert triggers Frappe's native template→project task generation
        # and our on_project_insert hook (NPDI enrichment + CPM)
        project.insert(ignore_permissions=True)
        frappe.db.commit()

        # 2. Apply task overrides if provided
        has_changes = False
        if task_overrides:
            overrides = json_module.loads(task_overrides) if isinstance(task_overrides, str) else task_overrides

            # Build a map: template task row name → generated task name
            # We need to match by idx position (same strategy as on_project_insert)
            template_tasks = frappe.get_all(
                "Project Template Task",
                filters={"parent": template_name},
                fields=["name", "task", "idx"],
                order_by="idx asc"
            )
            generated_tasks = frappe.get_all(
                "Task",
                filters={"project": project.name},
                fields=["name", "subject", "creation"],
                order_by="creation asc"
            )

            # Positional mapping
            row_to_generated = {}
            for position, tmpl in enumerate(template_tasks):
                if position < len(generated_tasks):
                    row_to_generated[tmpl.name] = generated_tasks[position].name

            for override in overrides:
                row_name = override.get("templateTaskRowName")
                gen_task_name = row_to_generated.get(row_name)
                if not gen_task_name:
                    continue

                updates = {}

                # Duration override
                new_duration = override.get("durationDays")
                if new_duration is not None:
                    updates["duration"] = int(new_duration)

                # Skip override
                if override.get("isSkipped"):
                    updates["status"] = "Cancelled"

                if updates:
                    frappe.db.set_value("Task", gen_task_name, updates)
                    has_changes = True

        # 3. Apply role assignments (independent of task_overrides)
        if role_assignments:
            assignments = json_module.loads(role_assignments) if isinstance(role_assignments, str) else role_assignments
            if assignments:
                # Fetch all generated tasks with their roles
                tasks_with_roles = frappe.get_all(
                    "Task",
                    filters={"project": project.name},
                    fields=["name", "npdi_responsible_role"]
                )
                for t in tasks_with_roles:
                    if t.npdi_responsible_role and t.npdi_responsible_role in assignments:
                        assigned_user = assignments[t.npdi_responsible_role]
                        if assigned_user:
                            frappe.db.set_value("Task", t.name, "task_owner", assigned_user)
                            has_changes = True

        # 4. Re-run CPM after overrides
        if has_changes:
            frappe.local.cpm_processing = True
            try:
                engine = CPMEngine(project.name)
                engine.compute()
            finally:
                frappe.local.cpm_processing = False

        frappe.db.commit()

        return {"success": True, "project_name": project.name}

    except frappe.DuplicateEntryError:
        return {"success": False, "error": f"Ya existe un proyecto con el nombre '{project_name}'."}
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "create_project_from_template")
        return {"success": False, "error": str(e)}
