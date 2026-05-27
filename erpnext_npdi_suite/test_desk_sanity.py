# -*- coding: utf-8 -*-
"""
Phase 5 Sanity Check: Verify standard ERPNext Desk operates normally
after npd_management and erpnext_npdi_suite have been uninstalled.
Checks that Project, Task, and BOM forms can be saved without AttributeError
or column mismatch exceptions.
"""
import frappe

def run_tests():
    print("=== PHASE 5: STANDARD DESK SANITY CHECK ===")

    # ---------- Ensure required master data ----------
    if not frappe.db.exists("Item Group", "All Item Groups"):
        frappe.get_doc({"doctype": "Item Group", "item_group_name": "All Item Groups", "is_group": 0}).insert(ignore_permissions=True)
    if not frappe.db.exists("UOM", "Nos"):
        frappe.get_doc({"doctype": "UOM", "uom_name": "Nos"}).insert(ignore_permissions=True)
    if not frappe.db.exists("Warehouse", "Stores - TF"):
        frappe.get_doc({"doctype": "Warehouse", "warehouse_name": "Stores", "company": "TechFood"}).insert(ignore_permissions=True)

    # ---------- 1. Create and save a standard Project ----------
    try:
        p = frappe.get_doc({
            "doctype": "Project",
            "project_name": "SANITY-PROJ-1",
            "status": "Open",
            "expected_start_date": "2026-06-01",
            "expected_end_date": "2026-06-30"
        }).insert(ignore_permissions=True)
        p.reload()
        p.status = "Working"
        p.save(ignore_permissions=True)
        print(f"[PASS] Project '{p.name}' created and saved without errors.")
    except Exception as e:
        print(f"[FAIL] Project creation raised: {e}")
        raise

    # ---------- 2. Create and save a standard Task ----------
    try:
        t = frappe.get_doc({
            "doctype": "Task",
            "subject": "Sanity Test Task",
            "project": p.name,
            "status": "Open",
            "exp_start_date": "2026-06-01",
            "exp_end_date": "2026-06-05"
        }).insert(ignore_permissions=True)
        t.reload()
        t.status = "Working"
        t.save(ignore_permissions=True)
        print(f"[PASS] Task '{t.name}' created and saved without errors.")
    except Exception as e:
        print(f"[FAIL] Task creation raised: {e}")
        raise

    # ---------- 3. Create and save a standard Item + BOM ----------
    try:
        item_code = "SANITY-ITEM-1"
        if not frappe.db.exists("Item", item_code):
            frappe.get_doc({
                "doctype": "Item",
                "item_code": item_code,
                "item_name": "Sanity Test Item",
                "item_group": "All Item Groups",
                "stock_uom": "Nos"
            }).insert(ignore_permissions=True)

        bom = frappe.get_doc({
            "doctype": "BOM",
            "item": item_code,
            "quantity": 1,
            "company": "TechFood",
            "is_active": 1,
            "uom": "Nos"
        }).insert(ignore_permissions=True)
        bom.reload()
        print(f"[PASS] BOM '{bom.name}' created without errors.")
    except Exception as e:
        print(f"[FAIL] BOM creation raised: {e}")
        raise

    # ---------- Check no npdi_* attributes bleed through ----------
    p_fresh = frappe.get_doc("Project", p.name)
    npdi_attrs = [a for a in dir(p_fresh) if a.startswith("npdi_")]
    if npdi_attrs:
        print(f"[WARN] Project doc still exposes npdi_ attributes (physical columns still present): {npdi_attrs}")
    else:
        print("[PASS] Project doc exposes no npdi_ custom field attributes.")

    t_fresh = frappe.get_doc("Task", t.name)
    npdi_task_attrs = [a for a in dir(t_fresh) if a.startswith("npdi_")]
    if npdi_task_attrs:
        print(f"[WARN] Task doc still exposes npdi_ attributes (physical columns still present): {npdi_task_attrs}")
    else:
        print("[PASS] Task doc exposes no npdi_ custom field attributes.")

    # Rollback all inserts to keep the DB clean
    frappe.db.rollback()
    print("=== PHASE 5 SANITY CHECK PASSED ===")

if __name__ == "__main__":
    run_tests()
