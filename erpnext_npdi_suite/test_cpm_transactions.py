import frappe
from frappe.utils import nowdate, add_days

def run_test():
    """
    Creates a dummy Project and Tasks, then simulates an error during CPM mass update
    to verify that the transaction is fully rolled back.
    """
    # -------------------------- Setup --------------------------
    project = frappe.get_doc({
        "doctype": "Project",
        "project_name": "Test CPM Rollback",
        "status": "Open"
    })
    project.insert(ignore_permissions=True)

    task1 = frappe.get_doc({
        "doctype": "Task",
        "subject": "Task 1",
        "project": project.name,
        "exp_start_date": nowdate(),
        "exp_end_date": add_days(nowdate(), 5),
        "status": "Open"
    })
    task1.insert(ignore_permissions=True)

    task2 = frappe.get_doc({
        "doctype": "Task",
        "subject": "Task 2",
        "project": project.name,
        "exp_start_date": add_days(nowdate(), 6),
        "exp_end_date": add_days(nowdate(), 10),
        "status": "Open",
        "depends_on": [{"task": task1.name}]
    })
    task2.insert(ignore_permissions=True)

    original_dates = {
        task1.name: {
            "exp_start_date": task1.exp_start_date,
            "exp_end_date": task1.exp_end_date
        },
        task2.name: {
            "exp_start_date": task2.exp_start_date,
            "exp_end_date": task2.exp_end_date
        }
    }

    # ----------------------- Simulate error --------------------
    from erpnext_npdi_suite.erpnext_npdi_suite.engine.cpm import CPMEngine  # adjust import if needed

    original_set_value = frappe.db.set_value

    def mock_set_value(doctype, name, fieldname, value, *args, **kwargs):
        """Raise an error when updating the exp_start_date of task2."""
        if name == task2.name and fieldname == "exp_start_date":
            raise frappe.ValidationError("Simulated DB error during CPM mass update")
        return original_set_value(doctype, name, fieldname, value, *args, **kwargs)

    frappe.db.set_value = mock_set_value

    try:
        engine = CPMEngine(project.name)
        engine.compute()
    except Exception:
        pass  # expected
    finally:
        frappe.db.set_value = original_set_value

    # ----------------------- Verification ----------------------
    all_unchanged = True
    for task_name, expected in original_dates.items():
        task_data = frappe.db.get_value("Task", task_name, ["exp_start_date", "exp_end_date"], as_dict=True)
        if not task_data:
            continue # If it was fully rolled back, it shouldn't exist, which is fine!
        if (str(task_data.exp_start_date) != str(expected["exp_start_date"]) or
                str(task_data.exp_end_date) != str(expected["exp_end_date"])):
            print(f"Task {task_name} dates changed: start {task_data.exp_start_date} (expected {expected['exp_start_date']}), end {task_data.exp_end_date} (expected {expected['exp_end_date']})")
            all_unchanged = False

    # ----------------------- Cleanup ---------------------------
    frappe.delete_doc("Task", task2.name, ignore_permissions=True)
    frappe.delete_doc("Task", task1.name, ignore_permissions=True)
    frappe.delete_doc("Project", project.name, ignore_permissions=True)

    if not all_unchanged:
        raise AssertionError("Rollback failed: some task dates were partially updated.")
    print("SUCCESS: All task dates remain unchanged after error. Rollback works correctly.")

# Allow execution via `bench execute test_cpm_transactions.py`
if __name__ == "__main__":
    try:
        run_test()
    except Exception as e:
        frappe.db.rollback()  # ensure no lingering transaction
        print(f"Test FAILED: {e}")
        raise
