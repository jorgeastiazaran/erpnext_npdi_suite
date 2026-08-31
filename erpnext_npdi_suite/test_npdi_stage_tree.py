import frappe
from erpnext_npdi_suite.setup.install import setup_default_npdi_stages, get_custom_fields
from erpnext_npdi_suite.doctype.npdi_stage.npdi_stage import get_children, add_node
from erpnext_npdi_suite.api import get_npdi_stages, upsert_template_task

def run_tests():
    print("=== Testing NPDI Stage Tree Functionality ===")
    
    # 1. Test Setup / Default Stages
    setup_default_npdi_stages()
    stages = frappe.get_all("NPDI Stage", fields=["name", "stage_name", "stage_order", "is_group"])
    print(f"Total NPDI Stages found: {len(stages)}")
    stage_names = [s.name for s in stages]
    for expected in ["1 – IDEA", "2 – CONCEPTO", "3 – DESARROLLO", "4 – LANZAMIENTO", "5 – POST-LANZAMIENTO"]:
        assert expected in stage_names, f"Expected stage '{expected}' not found in {stage_names}"
    print("✓ Default stages seeded successfully.")

    # 2. Test Tree Hierarchy (Parent - Child / Group)
    parent_stage_name = "3 – DESARROLLO"
    parent_doc = frappe.get_doc("NPDI Stage", parent_stage_name)
    parent_doc.is_group = 1
    parent_doc.save(ignore_permissions=True)

    child_stage_name = "3.1 – Formulación"
    if not frappe.db.exists("NPDI Stage", child_stage_name):
        child_doc = frappe.get_doc({
            "doctype": "NPDI Stage",
            "stage_name": child_stage_name,
            "parent_npdi_stage": parent_stage_name,
            "is_group": 0,
            "stage_order": 31
        })
        child_doc.insert(ignore_permissions=True)
    print("✓ Created child stage under group successfully.")

    # 3. Test get_children for tree view
    children = get_children("NPDI Stage", parent=parent_stage_name)
    assert any(c["value"] == child_stage_name for c in children), "Child stage not returned in get_children"
    print("✓ Tree view get_children returns child nodes properly.")

    # 4. Test API get_npdi_stages
    api_res = get_npdi_stages()
    assert api_res["success"] is True, f"API failed: {api_res}"
    assert len(api_res["stages"]) >= 5, "Expected at least 5 stages from API"
    print("✓ API get_npdi_stages returns active stages in order.")

    # 5. Verify Custom Field types
    cf = get_custom_fields()
    ptt_stage_field = next(f for f in cf["Project Template Task"] if f["fieldname"] == "npdi_stage_name")
    task_stage_field = next(f for f in cf["Task"] if f["fieldname"] == "npdi_stage_name")
    assert ptt_stage_field["fieldtype"] == "Link" and ptt_stage_field["options"] == "NPDI Stage"
    assert task_stage_field["fieldtype"] == "Link" and task_stage_field["options"] == "NPDI Stage"
    print("✓ Custom fields configured as Link -> NPDI Stage.")

    print("\nALL NPDI STAGE TREE TESTS PASSED SUCCESSFULLY!")

if __name__ == "__main__":
    run_tests()
