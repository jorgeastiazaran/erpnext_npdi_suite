import frappe
from frappe.utils import add_days, nowdate
from erpnext_npdi_suite.erpnext_npdi_suite.engine.cpm import CPMEngine

def run_test():
    print("=== TESTING MILESTONE AND STAGE DEPENDENCY DATES ===")
    
    # 1. Cleanup
    frappe.db.sql("DELETE FROM `tabTask Depends On` WHERE parent LIKE 'TEST-MS-%'")
    frappe.db.sql("DELETE FROM `tabTask` WHERE name LIKE 'TEST-MS-%' OR project LIKE 'TEST-MS-%'")
    frappe.db.sql("DELETE FROM `tabProject` WHERE name LIKE 'TEST-MS-%'")
    frappe.db.sql("DELETE FROM `tabProject Template Task` WHERE parent LIKE 'TEST-MS-%'")
    frappe.db.sql("DELETE FROM `tabProject Template` WHERE name LIKE 'TEST-MS-%'")
    frappe.db.commit()

    # 2. Project starting 2026-06-01
    project = frappe.get_doc({
        "doctype": "Project",
        "name": "TEST-MS-PROJ",
        "project_name": "TEST-MS-PROJ",
        "status": "Open",
        "expected_start_date": "2026-06-01"
    }).insert(ignore_permissions=True)

    # 3. Create Stage 1 Task (3 days: June 1 - June 4)
    t1 = frappe.get_doc({
        "doctype": "Task",
        "name": "TEST-MS-TASK-1",
        "subject": "Stage 1 Task",
        "project": project.name,
        "duration": 3.0,
        "npdi_stage_name": "1 - IDEA"
    }).insert(ignore_permissions=True)

    # 4. Create Stage 1 Milestone Task (depends on Task 1, duration 0, is_milestone=1)
    ms1 = frappe.get_doc({
        "doctype": "Task",
        "name": "TEST-MS-MILESTONE-1",
        "subject": "STAGE-GATE 1",
        "project": project.name,
        "duration": 0.0,
        "is_milestone": 1,
        "npdi_stage_name": "1 - IDEA",
        "depends_on": [{"task": t1.name}]
    }).insert(ignore_permissions=True)

    # 5. Create Stage 2 Task (depends on Stage 1 Milestone, duration 2 days)
    t2 = frappe.get_doc({
        "doctype": "Task",
        "name": "TEST-MS-TASK-2",
        "subject": "Stage 2 Task",
        "project": project.name,
        "duration": 2.0,
        "npdi_stage_name": "2 - CONCEPTO",
        "depends_on": [{"task": ms1.name}]
    }).insert(ignore_permissions=True)

    # Compute CPM
    engine = CPMEngine(project.name)
    engine.compute()

    t1.reload()
    ms1.reload()
    t2.reload()

    print(f"Task 1 (3 days):      Start = {t1.exp_start_date} | End = {t1.exp_end_date}")
    print(f"Milestone 1 (0 days): Start = {ms1.exp_start_date} | End = {ms1.exp_end_date} (Duration hours in engine: {engine._duration_hours(ms1.name)})")
    print(f"Task 2 (depends MS1): Start = {t2.exp_start_date} | End = {t2.exp_end_date}")

    # Check Milestone 1 end date: should equal start date (2026-06-04)
    # Check Task 2 start date: should adjust to Milestone 1 end date (2026-06-04)
    assert str(ms1.exp_start_date) == str(ms1.exp_end_date), f"Milestone end date ({ms1.exp_end_date}) should equal start date ({ms1.exp_start_date})"
    assert str(t2.exp_start_date) == str(ms1.exp_end_date), f"Task 2 start date ({t2.exp_start_date}) should equal Milestone 1 end date ({ms1.exp_end_date})"

    print("✅ TEST PASSED SUCCESSFULLY!")

if __name__ == "__main__":
    run_test()
