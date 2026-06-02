import frappe
import json
from erpnext_npdi_suite.api import (
    get_template_editor_data,
    upsert_template_task,
    delete_template_task,
    add_template_dependency,
    delete_template_dependency
)

def run():
    print("Starting verification of Phase 1 - Project Template UI API and Cycle Detection...")
    
    template_name = "Test NPDI Project Template"
    created_tasks = []
    
    def create_dummy_task(subject):
        t = frappe.get_doc({
            "doctype": "Task",
            "subject": subject
        })
        t.insert(ignore_permissions=True)
        created_tasks.append(t.name)
        return t.name

    # 1. Clean up or get/create a test Project Template
    if frappe.db.exists("Project Template", template_name):
        frappe.delete_doc("Project Template", template_name, force=True)
        
    try:
        init_task_name = create_dummy_task("Dummy Initial Task")
        dummy_a = create_dummy_task("Dummy Task A")
        dummy_b = create_dummy_task("Dummy Task B")
        dummy_c = create_dummy_task("Dummy Task C")
        
        doc = frappe.get_doc({
            "doctype": "Project Template",
            "name": template_name,
            "project_type": "Internal",
            "tasks": [
                {
                    "task": init_task_name,
                    "subject": "Initial Task",
                    "duration": 1
                }
            ]
        })
        doc.insert(ignore_permissions=True)
        frappe.db.commit()
        print(f"Created Project Template: {template_name}")
        
        # 2. Add tasks via upsert_template_task
        # Task A
        res1 = upsert_template_task(template_name, {
            "task": dummy_a,
            "subject": "Task A",
            "duration": 5,
            "npdi_stage_name": "Stage 1",
            "npdi_module": "Core",
            "npdi_requires_attachment": 1
        })
        print("Upsert Task A result:", res1)
        assert res1.get("success") is True, "Failed to upsert Task A"
        task_a_id = res1.get("task_name")
        
        # Task B
        res2 = upsert_template_task(template_name, {
            "task": dummy_b,
            "subject": "Task B",
            "duration": 3,
            "npdi_stage_name": "Stage 1",
            "npdi_module": "Formula",
            "npdi_launch_milestone": 1
        })
        print("Upsert Task B result:", res2)
        assert res2.get("success") is True, "Failed to upsert Task B"
        task_b_id = res2.get("task_name")
        
        # Task C
        res3 = upsert_template_task(template_name, {
            "task": dummy_c,
            "subject": "Task C",
            "duration": 4,
            "npdi_stage_name": "Stage 2",
            "npdi_module": "Pack"
        })
        print("Upsert Task C result:", res3)
        assert res3.get("success") is True, "Failed to upsert Task C"
        task_c_id = res3.get("task_name")
        
        # 3. Retrieve template editor data
        data_res = get_template_editor_data(template_name)
        print("Get template editor data result:", json.dumps(data_res, indent=2))
        assert data_res.get("success") is True, "Failed to get template editor data"
        tasks = data_res["data"]["tasks"]
        assert len(tasks) == 4, f"Expected 4 tasks, got {len(tasks)}"
        
        # 4. Add dependencies
        # A -> B (B depends on A)
        dep_res1 = add_template_dependency(template_name, task_b_id, task_a_id)
        print("Add dependency B -> A result:", dep_res1)
        assert dep_res1.get("success") is True, "Failed to add dependency B -> A"
        
        # B -> C (C depends on B)
        dep_res2 = add_template_dependency(template_name, task_c_id, task_b_id)
        print("Add dependency C -> B result:", dep_res2)
        assert dep_res2.get("success") is True, "Failed to add dependency C -> B"
        
        # 5. Try to introduce a cycle: C -> A (A depends on C)
        # This should trigger cycle detection and fail
        print("Attempting to add cyclic dependency A -> C (introducing a cycle A -> B -> C -> A)...")
        dep_res3 = add_template_dependency(template_name, task_a_id, task_c_id)
        print("Add dependency A -> C result:", dep_res3)
        assert dep_res3.get("success") is False, "Circular dependency was not blocked!"
        assert "ciclo circular" in dep_res3.get("error", ""), f"Unexpected error message: {dep_res3.get('error')}"
        print("SUCCESS: Circular dependency correctly blocked!")
        
        # 6. Delete a dependency: B -> C
        del_dep_res = delete_template_dependency(template_name, task_c_id, task_b_id)
        print("Delete dependency C -> B result:", del_dep_res)
        assert del_dep_res.get("success") is True, "Failed to delete dependency C -> B"
        
        # Verify dependency is gone
        data_res_after_del = get_template_editor_data(template_name)
        dependencies = data_res_after_del["data"]["dependencies"]
        assert len(dependencies) == 1, f"Expected 1 dependency, got {len(dependencies)}"
        print("SUCCESS: Dependency successfully deleted!")
        
        # 7. Delete task: Task A
        del_task_res = delete_template_task(template_name, task_a_id)
        print("Delete Task A result:", del_task_res)
        assert del_task_res.get("success") is True, "Failed to delete Task A"
        
        # Verify task and its remaining dependencies are gone
        data_res_final = get_template_editor_data(template_name)
        tasks_final = data_res_final["data"]["tasks"]
        deps_final = data_res_final["data"]["dependencies"]
        assert len(tasks_final) == 3, f"Expected 3 tasks, got {len(tasks_final)}"
        assert len(deps_final) == 0, f"Expected 0 dependencies, got {len(deps_final)}"
        print("SUCCESS: Task A and its dependency successfully deleted!")
        
    finally:
        # Clean up test template
        frappe.delete_doc("Project Template", template_name, force=True)
        # Clean up dummy tasks
        for tname in created_tasks:
            frappe.delete_doc("Task", tname, force=True)
        frappe.db.commit()
        print("Cleanup successful. Phase 1 Verification Finished!")
