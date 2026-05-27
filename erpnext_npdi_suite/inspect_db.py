import frappe
import json

def run():
    tasks = frappe.get_all(
        "Task",
        filters={"name": ["in", ["TASK-2026-02318", "TASK-2026-02319"]]},
        fields=["name", "subject", "exp_start_date", "exp_end_date", "is_group", "parent_task", "project"]
    )
    for t in tasks:
        deps = frappe.get_all(
            "Task Depends On",
            filters={"parent": t.name},
            fields=["task as dependsOnId"]
        )
        t["dependencies"] = [d.dependsOnId for d in deps]
        print("INSPECT_TASK:", json.dumps(t, default=str))
