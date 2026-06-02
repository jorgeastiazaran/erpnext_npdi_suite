import frappe
from frappe.utils import getdate, date_diff

def auto_adjust_parent_dates(doc, method):
    """
    Hooked to `before_validate` of Task.
    Adjusts the parent task's dates to encompass this task's dates (and its siblings).
    This effectively bypasses ERPNext's standard `validate_dates_with_parent`
    because the parent gets stretched/shrunk *before* standard `validate` checks it.
    """
    if doc.exp_start_date and doc.exp_end_date:
        start_d = getdate(doc.exp_start_date)
        end_d = getdate(doc.exp_end_date)
        if end_d >= start_d:
            doc.duration = date_diff(end_d, start_d) + 1

    if not doc.parent_task:
        return

    # Avoid infinite recursion
    adjusting = getattr(frappe.local, "adjusting_task_parents", set())
    if doc.name in adjusting:
        return

    parent = frappe.get_doc("Task", doc.parent_task)
    changed = False

    child_start = getdate(doc.exp_start_date) if doc.exp_start_date else None
    child_end = getdate(doc.exp_end_date) if doc.exp_end_date else None

    # Fetch all siblings from DB
    siblings = frappe.get_all("Task", filters={"parent_task": parent.name}, fields=["name", "exp_start_date", "exp_end_date"])
    
    min_start = child_start
    max_end = child_end
    
    for sib in siblings:
        if sib.name == doc.name:
            continue
            
        s_start = getdate(sib.exp_start_date) if sib.exp_start_date else None
        s_end = getdate(sib.exp_end_date) if sib.exp_end_date else None
        
        if s_start:
            if not min_start or s_start < min_start:
                min_start = s_start
        if s_end:
            if not max_end or s_end > max_end:
                max_end = s_end

    parent_start = getdate(parent.exp_start_date) if parent.exp_start_date else None
    parent_end = getdate(parent.exp_end_date) if parent.exp_end_date else None

    if min_start and (not parent_start or parent_start != min_start):
        parent.exp_start_date = min_start
        changed = True
        
    if max_end and (not parent_end or parent_end != max_end):
        parent.exp_end_date = max_end
        changed = True

    if changed:
        if not changed:
            return

        # Recursively update parents using db_set to avoid triggering hooks 
        # which modify the current child task and cause TimestampMismatchError.
        # The child's own save will trigger the CPM engine later anyway.
        current_parent_name = parent.name
        current_start = min_start
        current_end = max_end
        
        while current_parent_name:
            if current_parent_name in adjusting:
                break
            
            this_parent = current_parent_name
            adjusting.add(this_parent)
            frappe.local.adjusting_task_parents = adjusting
            
            try:
                updates = {}
                if current_start:
                    updates["exp_start_date"] = current_start
                if current_end:
                    updates["exp_end_date"] = current_end
                
                if updates:
                    frappe.db.set_value("Task", this_parent, updates, update_modified=False)
                
                # Move up to grandparent
                gp = frappe.db.get_value("Task", this_parent, "parent_task")
                if not gp:
                    break
                    
                gp_start, gp_end = frappe.db.get_value("Task", gp, ["exp_start_date", "exp_end_date"])
                
                gp_start = getdate(gp_start) if gp_start else None
                gp_end = getdate(gp_end) if gp_end else None
                
                gp_changed = False
                if current_start and (not gp_start or current_start < gp_start):
                    gp_changed = True
                else:
                    current_start = gp_start
                    
                if current_end and (not gp_end or current_end > gp_end):
                    gp_changed = True
                else:
                    current_end = gp_end
                    
                if not gp_changed:
                    break
                current_parent_name = gp
            finally:
                adjusting.remove(this_parent)
