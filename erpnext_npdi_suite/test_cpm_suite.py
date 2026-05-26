# -*- coding: utf-8 -*-
import frappe
from frappe.utils import flt

def run_tests():
    print("=== STARTING CPM ENGINE AND SECURITY TESTS ===")

    # 1. Clean up any previous test docs to keep it clean
    frappe.db.sql("DELETE FROM `tabTask Depends On` WHERE parent LIKE 'TEST-CPM-%'")
    frappe.db.sql("DELETE FROM `tabTask` WHERE name LIKE 'TEST-CPM-%' OR project = 'TEST-CPM-PROJ-1'")
    frappe.db.sql("DELETE FROM `tabProject` WHERE name = 'TEST-CPM-PROJ-1'")
    frappe.db.commit()

    # 2. Create target test project
    project = frappe.get_doc({
        "doctype": "Project",
        "name": "TEST-CPM-PROJ-1",
        "project_name": "TEST-CPM-PROJ-1",
        "status": "Open",
        "expected_start_date": "2026-06-01",
        "expected_end_date": "2026-06-10"
    }).insert(ignore_permissions=True)

    print(f"Created Test Project: {project.name}")

    # 3. Create Parallel and Sequential Tasks
    # Path 1: Task A (3 days) -> Task B (2 days). Total = 5 days.
    # Path 2: Task C (2 days) -> Task D (1 day). Total = 3 days.
    # Both paths converge to Task E (1 day).
    # Critical Path: Path 1 + Task E (total duration 6 days).
    # Task C & D should have float slack of 2 days (48 hours), npdi_cpm_is_critical = 0.
    
    t_a = frappe.get_doc({
        "doctype": "Task",
        "name": "TEST-CPM-TASK-A",
        "subject": "Task A",
        "project": project.name,
        "duration": 3.0,
        "exp_start_date": "2026-06-01",
        "exp_end_date": "2026-06-03"
    }).insert(ignore_permissions=True)

    t_c = frappe.get_doc({
        "doctype": "Task",
        "name": "TEST-CPM-TASK-C",
        "subject": "Task C",
        "project": project.name,
        "duration": 2.0,
        "exp_start_date": "2026-06-01",
        "exp_end_date": "2026-06-02"
    }).insert(ignore_permissions=True)

    t_b = frappe.get_doc({
        "doctype": "Task",
        "name": "TEST-CPM-TASK-B",
        "subject": "Task B",
        "project": project.name,
        "duration": 2.0,
        "depends_on": [{"task": t_a.name}]
    }).insert(ignore_permissions=True)

    t_d = frappe.get_doc({
        "doctype": "Task",
        "name": "TEST-CPM-TASK-D",
        "subject": "Task D",
        "project": project.name,
        "duration": 1.0,
        "depends_on": [{"task": t_c.name}]
    }).insert(ignore_permissions=True)

    t_e = frappe.get_doc({
        "doctype": "Task",
        "name": "TEST-CPM-TASK-E",
        "subject": "Task E",
        "project": project.name,
        "duration": 1.0,
        "depends_on": [{"task": t_b.name}, {"task": t_d.name}]
    }).insert(ignore_permissions=True)

    print("Tasks created and inserted.")

    # 4. Trigger bulk calculation via CPMEngine directly
    from erpnext_npdi_suite.erpnext_npdi_suite.engine.cpm import CPMEngine
    engine = CPMEngine(project.name)
    engine.compute()

    # 5. Reload documents and assert CPM calculations
    t_a.reload()
    t_b.reload()
    t_c.reload()
    t_d.reload()
    t_e.reload()

    print(f"Task A is_critical: {t_a.npdi_cpm_is_critical} | float: {t_a.npdi_cpm_total_float}")
    print(f"Task B is_critical: {t_b.npdi_cpm_is_critical} | float: {t_b.npdi_cpm_total_float}")
    print(f"Task C is_critical: {t_c.npdi_cpm_is_critical} | float: {t_c.npdi_cpm_total_float}")
    print(f"Task D is_critical: {t_d.npdi_cpm_is_critical} | float: {t_d.npdi_cpm_total_float}")
    print(f"Task E is_critical: {t_e.npdi_cpm_is_critical} | float: {t_e.npdi_cpm_total_float}")

    # Assertions for float path (slack check)
    assert t_a.npdi_cpm_is_critical == 1, "Task A should be critical"
    assert t_b.npdi_cpm_is_critical == 1, "Task B should be critical"
    assert t_e.npdi_cpm_is_critical == 1, "Task E should be critical"
    
    # Task C and D must NOT be critical because they have 2 days (48 hours) of slack float
    assert t_c.npdi_cpm_is_critical == 0, "Task C should NOT be critical (has 48h float)"
    assert t_d.npdi_cpm_is_critical == 0, "Task D should NOT be critical (has 48h float)"
    
    assert abs(flt(t_c.npdi_cpm_total_float) - 48.0) < 0.001, "Task C float should be 48 hours"
    assert abs(flt(t_d.npdi_cpm_total_float) - 48.0) < 0.001, "Task D float should be 48 hours"

    print("Success: Critical Path and slack float calculated correctly!")

    # 6. Test Security/Permission checks in API endpoints
    # Switch to 'Guest' user to run permission validations
    frappe.set_user("Guest")
    try:
        from erpnext_npdi_suite.api import (
            update_task_status,
            update_task_dates,
            add_task_dependency,
            capture_project_baseline
        )

        # A. Update status should raise permission error
        res1 = update_task_status(t_a.name, "Completed")
        print("update_task_status as Guest:", res1)
        assert res1.get("success") is False, "update_task_status should have failed for Guest"
        assert "not permitted" in res1.get("error").lower() or "permission" in res1.get("error").lower(), "Expected permission error"

        # B. Update dates should raise permission error
        res2 = update_task_dates(t_a.name, "2026-06-02T00:00:00", "2026-06-05T00:00:00")
        print("update_task_dates as Guest:", res2)
        assert res2.get("success") is False, "update_task_dates should have failed for Guest"
        assert "not permitted" in res2.get("error").lower() or "permission" in res2.get("error").lower(), "Expected permission error"

        # C. Add dependency should raise permission error
        res3 = add_task_dependency(t_b.name, t_c.name)
        print("add_task_dependency as Guest:", res3)
        assert res3.get("success") is False, "add_task_dependency should have failed for Guest"
        assert "not permitted" in res3.get("error").lower() or "permission" in res3.get("error").lower(), "Expected permission error"

        # D. Capture project baseline should raise permission error
        res4 = capture_project_baseline(project.name)
        print("capture_project_baseline as Guest:", res4)
        assert res4.get("success") is False, "capture_project_baseline should have failed for Guest"
        assert "not permitted" in res4.get("error").lower() or "permission" in res4.get("error").lower(), "Expected permission error"

        print("Success: Security authorization checks passed! Permissions enforced.")
    finally:
        # Restore user context to Administrator
        frappe.set_user("Administrator")

    # 7. Clean up and rollback database transaction
    frappe.db.rollback()
    print("=== ALL CPM ENGINE AND SECURITY TESTS PASSED ===")

if __name__ == "__main__":
    run_tests()
