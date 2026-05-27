"""
build_npdi_project_template.py
──────────────────────────────
Migration script (P4) that reads the NPDI CSV export and creates a fully
self-contained ERPNext Project Template — with all NPDI custom fields and
inter-task dependency wiring encoded on Project Template Task rows.

After running this script any new project created from the "NPDI Core Template"
will have:
  • Correct task durations (from the CSV)
  • NPDI stage/module/role/attachment/milestone metadata
  • Full dependency graph wired via Task Template Depends On child rows
  • No reliance on pre-existing TASK-2026-xxxxx live records

Usage (run inside a bench console on the target site):
    bench --site <site-name> execute \
        erpnext_npdi_suite.erpnext_npdi_suite.engine.build_npdi_project_template.run

Or from a bench console:
    from erpnext_npdi_suite.erpnext_npdi_suite.engine.build_npdi_project_template import run
    run()
"""

import csv
import os
import frappe

# ── Config ───────────────────────────────────────────────────────────────────
TEMPLATE_NAME = "NPDI Core Template"
CSV_PATH = os.path.join(
    os.path.dirname(__file__),  # engine/
    "..", "..", "..", "templates", "npdi_template_erpnext.csv"
)

# CSV column indices (0-based), based on the header row:
# ID, Subject, GitHub Sync ID, Project, Is Group, Is Template, Parent Task,
# Duration (Days), Is Milestone, Task Description, Depends on Tasks,
# Actual Start Date, Actual Time, Actual End Date, Hito de Lanzamiento,
# Fin Manual, Inicio Manual, Módulo NPDI, Requiere Evidencia Adjunta,
# Rol Responsable, Etapa NPDI, ID (Dependent Tasks), Task (Dependent Tasks),
# Subject (Dependent Tasks), Project (Dependent Tasks)
COL_ID           = 0
COL_SUBJECT      = 1
COL_IS_GROUP     = 4
COL_PARENT_TASK  = 6
COL_DURATION     = 7
COL_IS_MILESTONE = 8
COL_DEPENDS_ON   = 10   # comma-separated predecessor TASK IDs
COL_LAUNCH_MILE  = 14
COL_MODULE       = 17
COL_REQUIRES_ATT = 18
COL_ROLE         = 19
COL_STAGE        = 20


def _bool(val):
    """Coerce CSV string to int 0/1."""
    return 1 if str(val).strip() in ("1", "true", "True", "yes") else 0


def run():
    """
    Create (or recreate) the NPDI Core Template Project Template with all
    tasks and dependency rows fully populated.
    """
    csv_path = os.path.normpath(CSV_PATH)
    if not os.path.exists(csv_path):
        frappe.throw(f"CSV not found at: {csv_path}")

    # ── Parse CSV ─────────────────────────────────────────────────────────
    tasks_by_id = {}   # task_id → row dict
    task_order  = []   # ordered list of task_ids (primary rows only)

    with open(csv_path, newline="", encoding="utf-8-sig") as f:
        reader = csv.reader(f)
        next(reader)  # skip header

        for row in reader:
            # Skip continuation rows (empty ID) — those only add dep subjects
            if not row[COL_ID].strip():
                continue

            task_id = row[COL_ID].strip()
            subject  = row[COL_SUBJECT].strip()
            if not subject:
                continue

            # Parse predecessor list
            raw_deps = row[COL_DEPENDS_ON].strip() if len(row) > COL_DEPENDS_ON else ""
            depends_on = [d.strip() for d in raw_deps.split(",") if d.strip()]

            tasks_by_id[task_id] = {
                "id":               task_id,
                "subject":          subject,
                "is_group":         _bool(row[COL_IS_GROUP]) if len(row) > COL_IS_GROUP else 0,
                "parent_task_id":   row[COL_PARENT_TASK].strip() if len(row) > COL_PARENT_TASK else "",
                "duration":         int(float(row[COL_DURATION].strip() or 0)) if len(row) > COL_DURATION else 0,
                "is_milestone":     _bool(row[COL_IS_MILESTONE]) if len(row) > COL_IS_MILESTONE else 0,
                "depends_on":       depends_on,
                "npdi_launch_milestone":   _bool(row[COL_LAUNCH_MILE]) if len(row) > COL_LAUNCH_MILE else 0,
                "npdi_module":      row[COL_MODULE].strip() if len(row) > COL_MODULE else "Core",
                "npdi_requires_attachment": _bool(row[COL_REQUIRES_ATT]) if len(row) > COL_REQUIRES_ATT else 0,
                "npdi_responsible_role":    row[COL_ROLE].strip() if len(row) > COL_ROLE else "",
                "npdi_stage_name":  row[COL_STAGE].strip() if len(row) > COL_STAGE else "",
            }
            task_order.append(task_id)

    if not tasks_by_id:
        frappe.throw("No valid task rows found in the CSV.")

    frappe.logger().info(f"Parsed {len(task_order)} tasks from CSV.")

    # ── Delete existing template if present ───────────────────────────────
    if frappe.db.exists("Project Template", TEMPLATE_NAME):
        frappe.logger().info(f"Deleting existing template: {TEMPLATE_NAME}")
        frappe.delete_doc("Project Template", TEMPLATE_NAME,
                          ignore_permissions=True, force=True)
        frappe.db.commit()

    # ── Build Project Template Task rows ──────────────────────────────────
    # Map CSV task IDs → sequential position (1-based idx in template)
    id_to_position = {tid: (i + 1) for i, tid in enumerate(task_order)}

    template_task_rows = []
    for task_id in task_order:
        t = tasks_by_id[task_id]
        row_data = {
            "subject":          t["subject"],
            "duration":         t["duration"],
            "is_group":         t["is_group"],
            "is_milestone":     t["is_milestone"],
            # NPDI custom fields on Project Template Task
            "npdi_stage_name":         t["npdi_stage_name"],
            "npdi_module":             t["npdi_module"] or "Core",
            "npdi_responsible_role":   t["npdi_responsible_role"],
            "npdi_requires_attachment": t["npdi_requires_attachment"],
            "npdi_launch_milestone":    t["npdi_launch_milestone"],
        }

        # Wire dependency rows using Task Template Depends On child table
        # (only if the doctype exists in this ERPNext version)
        dep_rows = []
        if frappe.db.exists("DocType", "Task Template Depends On"):
            for dep_id in t["depends_on"]:
                if dep_id in id_to_position:
                    dep_rows.append({"task": dep_id})  # populated after template save

        if dep_rows:
            row_data["depends_on"] = dep_rows

        template_task_rows.append(row_data)

    # ── Create Project Template document ──────────────────────────────────
    template_doc = frappe.get_doc({
        "doctype": "Project Template",
        "name": TEMPLATE_NAME,
        "project_type": "Internal",
        "tasks": template_task_rows,
    })

    template_doc.insert(ignore_permissions=True)
    frappe.db.commit()
    frappe.logger().info(f"Created Project Template: {TEMPLATE_NAME} with {len(template_task_rows)} tasks.")

    # ── Wire Task Template Depends On rows using actual row names ─────────
    # After insert, each Project Template Task row has a real `name` (UUID).
    # We re-read them and build the id→row_name map, then set depends_on.task.
    if not frappe.db.exists("DocType", "Task Template Depends On"):
        frappe.logger().info("Task Template Depends On doctype not found — skipping dependency wiring.")
        frappe.logger().info("Template created successfully (without dependency rows).")
        return

    # Load inserted rows in order
    inserted_rows = frappe.get_all(
        "Project Template Task",
        filters={"parent": TEMPLATE_NAME},
        fields=["name", "subject", "idx"],
        order_by="idx asc"
    )
    # Map position (1-based idx) → inserted row name
    position_to_row_name = {r.idx: r.name for r in inserted_rows}
    # Map CSV task ID → inserted row name (by matching position)
    id_to_row_name = {}
    for task_id, position in id_to_position.items():
        row_name = position_to_row_name.get(position)
        if row_name:
            id_to_row_name[task_id] = row_name

    # Now insert Task Template Depends On child rows
    dep_rows_created = 0
    for task_id in task_order:
        t = tasks_by_id[task_id]
        parent_row_name = id_to_row_name.get(task_id)
        if not parent_row_name:
            continue

        for dep_id in t["depends_on"]:
            dep_row_name = id_to_row_name.get(dep_id)
            if not dep_row_name:
                frappe.logger().warning(
                    f"Dependency {dep_id} for task {task_id} not found in template — skipping."
                )
                continue

            try:
                dep_doc = frappe.get_doc({
                    "doctype": "Task Template Depends On",
                    "parenttype": "Project Template Task",
                    "parentfield": "depends_on",
                    "parent": parent_row_name,
                    "task": dep_row_name,
                })
                dep_doc.insert(ignore_permissions=True)
                dep_rows_created += 1
            except Exception as e:
                frappe.logger().warning(
                    f"Could not create dependency row {task_id} → {dep_id}: {e}"
                )

    frappe.db.commit()
    frappe.logger().info(
        f"Template build complete. {len(template_task_rows)} tasks, "
        f"{dep_rows_created} dependency rows created."
    )
    frappe.msgprint(
        f"✅ NPDI Core Template created: {len(template_task_rows)} tasks, "
        f"{dep_rows_created} dependency edges wired."
    )
