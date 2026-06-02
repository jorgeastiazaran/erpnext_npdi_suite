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
            'npdi_responsible_role as npdiResponsibleRole', '_assign as assignedTo',
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

        assigned_list = []
        if t.get('assignedTo'):
            try:
                assigned_list = frappe.parse_json(t['assignedTo'])
            except Exception:
                pass
        if assigned_list and isinstance(assigned_list, list):
            user_email = assigned_list[0]
            user_name = frappe.db.get_value("User", user_email, "full_name") or user_email
            t['assignedTo'] = {'name': user_name, 'email': user_email}
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
        frappe.has_permission('Task', 'write', throw=True)
        
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
        frappe.has_permission('Task', 'write', throw=True)
        
        if isinstance(task_data, str):
            task_data = json.loads(task_data)
            
        task = frappe.get_doc('Task', task_id)
        
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
def get_project_dashboard_data(project):
    # Placeholder
    return {"success": True, "data": {}}
