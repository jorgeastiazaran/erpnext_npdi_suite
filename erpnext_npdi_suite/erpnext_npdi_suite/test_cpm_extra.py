# -*- coding: utf-8 -*-
import frappe
from frappe.utils import get_datetime, add_to_date
from erpnext_npdi_suite.erpnext_npdi_suite.engine.cpm import capture_project_baseline, CPMEngine

def run_tests():
    print("=== STARTING ADDITIONAL CPM ENGINE TESTS ===")

    # Cleanup previous records
    frappe.db.sql("DELETE FROM `tabTask Depends On` WHERE parent LIKE 'TEST-CPM-%'")
    frappe.db.sql("DELETE FROM `tabTask` WHERE name LIKE 'TEST-CPM-%' OR project LIKE 'TEST-CPM-%'")
    frappe.db.sql("DELETE FROM `tabProject` WHERE name LIKE 'TEST-CPM-%'")
    frappe.db.sql("DELETE FROM `tabProject Template Task` WHERE parent LIKE 'TEST-CPM-%'")
    frappe.db.sql("DELETE FROM `tabProject Template` WHERE name LIKE 'TEST-CPM-%'")
    frappe.db.commit()

    print("Step 1: Verify Metadata Inheritance from Project Template")
    
    # Ensure template task exists
    template_task_code = "TEST-CPM-TMP-TASK-1"
    if not frappe.db.exists("Task", template_task_code):
        frappe.get_doc({
            "doctype": "Task",
            "name": template_task_code,
            "subject": "Template Task 1",
            "is_group": 0,
            "duration": 4.0
        }).insert(ignore_permissions=True)

    # Create Project Template
    template_name = "TEST-CPM-TEMPLATE-1"
    project_template = frappe.get_doc({
        "doctype": "Project Template",
        "name": template_name,
        "project_type": "External",
        "tasks": [
            {
                "task": template_task_code,
                "npdi_stage_name": "Stage Gate 1",
                "npdi_module": "Formula",
                "npdi_responsible_role": "System Manager",
                "npdi_requires_attachment": 1,
                "npdi_launch_milestone": 1
            }
        ]
    }).insert(ignore_permissions=True)

    print(f"Created Project Template: {template_name}")

    # Create Project from Template
    project = frappe.get_doc({
        "doctype": "Project",
        "name": "TEST-CPM-PROJ-INHERIT",
        "project_name": "TEST-CPM-PROJ-INHERIT",
        "project_template": template_name,
        "status": "Open",
        "expected_start_date": "2026-06-01",
        "expected_end_date": "2026-06-10"
    })
    
    # Simulate the frappe.local flags during project instantiation
    frappe.local.is_instantiating_project = True
    project.insert(ignore_permissions=True)
    
    # Trigger the on_update/on_project_insert hooks manually if not auto-fired
    from erpnext_npdi_suite.erpnext_npdi_suite.engine.cpm import on_project_insert
    on_project_insert(project, "on_update")
    
    print("Project inserted and hooks executed.")

    # Find the generated task
    gen_tasks = frappe.get_all("Task", filters={"project": project.name}, fields=["name", "subject", "duration", "npdi_stage_name", "npdi_module", "npdi_responsible_role", "npdi_requires_attachment", "npdi_launch_milestone"])
    print(f"Generated tasks count: {len(gen_tasks)}")
    assert len(gen_tasks) > 0, "No tasks were generated from template"
    
    task_doc = gen_tasks[0]
    print(f"Generated Task attributes: module={task_doc.npdi_module}, role={task_doc.npdi_responsible_role}, stage={task_doc.npdi_stage_name}")
    assert task_doc.npdi_stage_name == "Stage Gate 1", "npdi_stage_name inheritance failed"
    assert task_doc.npdi_module == "Formula", "npdi_module inheritance failed"
    assert task_doc.npdi_responsible_role == "System Manager", "npdi_responsible_role inheritance failed"
    assert task_doc.npdi_requires_attachment == 1, "npdi_requires_attachment inheritance failed"
    assert task_doc.npdi_launch_milestone == 1, "npdi_launch_milestone inheritance failed"
    assert float(task_doc.duration) == 4.0, "duration inheritance failed"

    print("Step 2: Verify Baseline Snapshot and Freeze")
    
    # Create another project for baseline test
    proj_base = frappe.get_doc({
        "doctype": "Project",
        "name": "TEST-CPM-PROJ-BASE",
        "project_name": "TEST-CPM-PROJ-BASE",
        "status": "Open",
        "expected_start_date": "2026-06-01",
        "expected_end_date": "2026-06-10"
    }).insert(ignore_permissions=True)

    task_base = frappe.get_doc({
        "doctype": "Task",
        "name": "TEST-CPM-TASK-BASE-1",
        "subject": "Base Task 1",
        "project": proj_base.name,
        "duration": 5.0,
        "exp_start_date": "2026-06-01",
        "exp_end_date": "2026-06-06"
    }).insert(ignore_permissions=True)

    # Compute CPM to establish early start/finish dates
    engine = CPMEngine(proj_base.name)
    engine.compute()
    
    task_base.reload()
    print(f"Task early start before baseline: {task_base.npdi_cpm_early_start}")
    assert task_base.npdi_cpm_early_start is not None, "CPM calculation did not run"

    # Capture baseline
    res = capture_project_baseline(proj_base.name)
    print("capture_project_baseline result:", res)
    assert res.get("status") == "success", "Failed to capture baseline"

    # Reload records
    proj_base.reload()
    task_base.reload()

    print(f"Project baseline locked: {proj_base.npdi_baseline_locked}")
    print(f"Task baseline start: {task_base.npdi_baseline_start}")
    
    assert proj_base.npdi_baseline_locked == 1, "Baseline was not locked on Project"
    assert task_base.npdi_baseline_start == task_base.npdi_cpm_early_start, "Task baseline start mismatch"
    assert task_base.npdi_baseline_end == task_base.npdi_cpm_early_finish, "Task baseline end mismatch"

    # Verify that trying to recapture baseline raises a ValidationError
    try:
        capture_project_baseline(proj_base.name)
        raise Exception("Recapturing a locked baseline should have raised ValidationError")
    except frappe.ValidationError as e:
        print("Success: ValidationError caught as expected when trying to recapture locked baseline:", str(e))
    except Exception as e:
        if "ya ha sido congelada" in str(e) or "locked" in str(e):
            print("Success: Error caught as expected when trying to recapture locked baseline:", str(e))
        else:
            raise

    # Shift task dates and verify that baseline dates remain frozen
    task_base.npdi_cpm_manual_dates = 1
    task_base.npdi_manual_start = "2026-06-03 00:00:00"
    task_base.npdi_manual_end = "2026-06-08 00:00:00"
    task_base.save(ignore_permissions=True)
    
    # Recalculate CPM
    engine = CPMEngine(proj_base.name)
    engine.compute()
    
    task_base.reload()
    print(f"After shift, Task early start: {task_base.npdi_cpm_early_start}")
    print(f"After shift, Task baseline start: {task_base.npdi_baseline_start} (Expected: frozen at 2026-06-01)")
    
    # Early start should be shifted
    assert get_datetime(task_base.npdi_cpm_early_start) == get_datetime("2026-06-03 00:00:00")
    # Baseline start should remain frozen
    assert get_datetime(task_base.npdi_baseline_start) == get_datetime("2026-06-01 00:00:00")

    # Cleanup and rollback
    frappe.db.rollback()
    print("=== ALL ADDITIONAL CPM ENGINE TESTS PASSED SUCCESSFULLY ===")

if __name__ == "__main__":
    run_tests()
