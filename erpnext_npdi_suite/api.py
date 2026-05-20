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
            'is_group as isMilestone', 'npdi_stage_name as stageName'
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
        
        # Fetch Dependencies
        deps = frappe.get_all(
            'Task Depends On',
            filters={'parent': t.id},
            fields=['task as dependentOnId']
        )
        t['dependencies'] = deps
        t['isFixed'] = False
        t['isSkipped'] = False
        
        # Provide default stage if missing
        if not t.get('stageName'):
            t['stageName'] = 'General'
            
        # Map ERPNext status to React Gantt status
        # ERPNext: Open, Working, Pending Review, Overdue, Completed, Cancelled
        # React: Pending, In Progress, Awaiting Approval, Completed, Blocked
        status_map = {
            'Open': 'Pending',
            'Working': 'In Progress',
            'Pending Review': 'Awaiting Approval',
            'Completed': 'Completed',
            'Overdue': 'Blocked',
            'Cancelled': 'Blocked'
        }
        t['status'] = status_map.get(t['status'], 'Pending')
            
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
        
        # Reverse mapping: React -> ERPNext
        reverse_map = {
            'Pending': 'Open',
            'In Progress': 'Working',
            'Awaiting Approval': 'Pending Review',
            'Completed': 'Completed',
            'Blocked': 'Overdue' # closest representation for now
        }
        
        task.status = reverse_map.get(status, 'Open')
        
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
