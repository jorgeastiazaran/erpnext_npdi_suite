import frappe

@frappe.whitelist()
def get_project_gantt_data(project=None, template=None):
    """
    Fetch tasks formatted exactly as the React Gantt components expect.
    """
    filters = {}
    if project:
        filters['project'] = project
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
            'is_group as isMilestone', 'npdi_stage_name as stageName',
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
        # Map task subject to template idx
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

    return {"success": True, "tasks": tasks_with_deps}

@frappe.whitelist()
def update_task_status(task_id, status):
    """
    Update Task status from Gantt.
    """
    from erpnext_npdi_suite.erpnext_npdi_suite.engine.cpm import CPMEngine
    
    try:
        task = frappe.get_doc('Task', task_id)
        
        # Support mapping from both legacy React status strings and native ERPNext status strings
        reverse_map = {
            'Pending': 'Open',
            'In Progress': 'Working',
            'Awaiting Approval': 'Pending Review',
            'Completed': 'Completed',
            'Blocked': 'Overdue',
            'Skipped': 'Cancelled',
            # Native statuses passed directly:
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
    except Exception as e:
        return {"success": False, "error": str(e)}

@frappe.whitelist()
def update_task_dates(task_id, start, end):
    """
    Update Task dates directly from the Gantt drag-and-drop interface.
    """
    from erpnext_npdi_suite.erpnext_npdi_suite.engine.cpm import CPMEngine
    
    try:
        task = frappe.get_doc('Task', task_id)
        # Dates come in ISO string format from React
        task.exp_start_date = start.split('T')[0]
        task.exp_end_date = end.split('T')[0]
        task.save(ignore_permissions=True)
        
        if task.project:
            engine = CPMEngine(task.project)
            engine.compute()
            
        return {"success": True}
    except Exception as e:
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
    except Exception as e:
        return {"success": False, "error": str(e)}

@frappe.whitelist()
def add_task_dependency(task_id, depends_on):
    """
    Add a dependency relation: task_id depends on depends_on.
    """
    from erpnext_npdi_suite.erpnext_npdi_suite.engine.cpm import CPMEngine

    try:
        task = frappe.get_doc('Task', task_id)
        # Check if dependency already exists
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
    except Exception as e:
        return {"success": False, "error": str(e)}
