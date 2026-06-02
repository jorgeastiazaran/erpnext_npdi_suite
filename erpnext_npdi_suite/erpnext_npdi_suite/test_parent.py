import frappe
from frappe.utils import add_days, today

def run_test():
    try:
        project = frappe.get_doc({
            "doctype": "Project",
            "project_name": "Test Parent Auto Adjust",
        }).insert()

        parent = frappe.get_doc({
            "doctype": "Task",
            "subject": "Test Parent",
            "project": project.name,
            "exp_start_date": today(),
            "exp_end_date": add_days(today(), 2)
        }).insert()

        child = frappe.get_doc({
            "doctype": "Task",
            "subject": "Test Child",
            "project": project.name,
            "parent_task": parent.name,
            "exp_start_date": today(),
            "exp_end_date": add_days(today(), 1)
        }).insert()
        child.reload()

        print("Initial Parent:", parent.exp_start_date, parent.exp_end_date)
        print("Initial Child:", child.exp_start_date, child.exp_end_date)

        # Now let's try to extend the child beyond the parent
        child.exp_end_date = add_days(today(), 5)
        child.duration = 5
        child.save()

        parent.reload()
        print("After extend Child:", child.exp_start_date, child.exp_end_date)
        print("After extend Parent:", parent.exp_start_date, parent.exp_end_date)
        
        if str(parent.exp_end_date) == str(child.exp_end_date):
            print("SUCCESS! Parent auto-adjusted.")
        else:
            print("FAILED! Parent did not adjust.")

    except Exception as e:
        print(f"Exception: {e}")
    finally:
        frappe.db.rollback()
