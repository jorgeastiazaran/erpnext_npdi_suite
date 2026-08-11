#!/usr/bin/env python3
"""
convert_npdi_template.py
────────────────────────
Utility script to transform the raw NPDI export template (`npdi_template_erpnext.csv`)
into a clean, fully formatted CSV (`npdi_template_erpnext_import.csv`) ready for
importing into ERPNext using the native Data Import tool.

It performs the following transformations:
1. Re-maps non-standard / Spanish column headers to standard ERPNext Task fieldnames.
2. Resolves unique Task IDs (`TASK-2026-XXXXX`) for all 85 parent tasks using group and dependency graph linkages.
3. Formats child table rows (`depends_on.task` for `Task Depends On`) under each parent Task ID.
4. Preserves all NPDI custom field values (`npdi_stage_name`, `npdi_module`, `npdi_responsible_role`,
   `npdi_requires_attachment`, `npdi_launch_milestone`).

Usage:
    python3 convert_npdi_template.py
"""

import csv
import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
INPUT_CSV = os.path.join(SCRIPT_DIR, "npdi_template_erpnext.csv")
OUTPUT_CSV = os.path.join(SCRIPT_DIR, "npdi_template_erpnext_import.csv")


def convert_template(input_path=INPUT_CSV, output_path=OUTPUT_CSV):
    if not os.path.exists(input_path):
        raise FileNotFoundError(f"Input template not found at {input_path}")

    with open(input_path, "r", encoding="utf-8-sig") as f:
        reader = csv.reader(f)
        headers = next(reader)
        rows = list(reader)

    # ── 1. Map Subject / Group Task -> Unique Task ID ───────────────────────
    subject_to_id = {}

    # Extract IDs from dependent task columns (cols 22 & 23)
    for r in rows:
        dep_id = r[22].strip()
        dep_subj = r[23].strip()
        if dep_id and dep_subj:
            subject_to_id[dep_subj] = dep_id

    # Extract IDs for parent group tasks from child rows' Parent Task column (col 6)
    for idx, r in enumerate(rows):
        subj = r[1].strip()
        parent_task = r[6].strip()
        if parent_task:
            for prev_r in reversed(rows[:idx]):
                prev_subj = prev_r[1].strip()
                prev_is_group = prev_r[4].strip()
                if prev_subj and prev_is_group == "1":
                    subject_to_id[prev_subj] = parent_task
                    break

    # Last closing gate fallback if unmapped
    if "STAGE-GATE CIERRE DE PROYECTO" not in subject_to_id:
        subject_to_id["STAGE-GATE CIERRE DE PROYECTO"] = "TASK-2026-02572"

    # ── 2. Build Structured Parent Tasks & Child Dependencies ───────────────
    out_rows = []
    current_parent_data = None
    current_deps = []

    for r in rows:
        subj = r[1].strip()

        if subj:  # New parent task row
            if current_parent_data:
                # Flush previous parent task and its dependencies
                _append_task_rows(out_rows, current_parent_data, current_deps)

            task_id = subject_to_id.get(subj, "")
            current_deps = []

            dep_id_col22 = r[22].strip()
            if dep_id_col22:
                current_deps.append(dep_id_col22)

            current_parent_data = {
                "id": task_id,
                "subject": subj,
                "project": r[3].strip(),
                "is_group": r[4].strip() or "0",
                "is_template": r[5].strip() or "0",
                "parent_task": r[6].strip(),
                "duration": r[7].strip() or "0",
                "is_milestone": r[8].strip() or "0",
                "description": r[9].strip(),
                "raw_deps": r[10].strip(),
                "npdi_launch_milestone": r[14].strip() or "0",
                "npdi_module": r[17].strip() or "Core",
                "npdi_requires_attachment": r[18].strip() or "0",
                "npdi_responsible_role": r[19].strip(),
                "npdi_stage_name": r[20].strip(),
            }
        else:  # Continuation row for dependencies
            dep_id_col22 = r[22].strip()
            if dep_id_col22 and dep_id_col22 not in current_deps:
                current_deps.append(dep_id_col22)

    # Flush last task
    if current_parent_data:
        _append_task_rows(out_rows, current_parent_data, current_deps)

    # ── 3. Write ERPNext Data Import standard CSV ─────────────────────────────
    fieldnames = [
        "ID",
        "subject",
        "project",
        "is_group",
        "is_template",
        "parent_task",
        "duration",
        "is_milestone",
        "description",
        "npdi_stage_name",
        "npdi_module",
        "npdi_responsible_role",
        "npdi_requires_attachment",
        "npdi_launch_milestone",
        "depends_on.task",
    ]

    with open(output_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(out_rows)

    unique_tasks = len(set(r["ID"] for r in out_rows))
    print(f"✅ Successfully generated '{output_path}'")
    print(f"   - Total unique tasks processed: {unique_tasks}")
    print(f"   - Total import CSV rows (including child dependencies): {len(out_rows)}")


def _append_task_rows(out_rows, parent_data, current_deps):
    task_id = parent_data["id"]
    base_row = {
        "ID": task_id,
        "subject": parent_data["subject"],
        "project": parent_data["project"],
        "is_group": parent_data["is_group"],
        "is_template": parent_data["is_template"],
        "parent_task": parent_data["parent_task"],
        "duration": parent_data["duration"],
        "is_milestone": parent_data["is_milestone"],
        "description": parent_data["description"],
        "npdi_stage_name": parent_data["npdi_stage_name"],
        "npdi_module": parent_data["npdi_module"],
        "npdi_responsible_role": parent_data["npdi_responsible_role"],
        "npdi_requires_attachment": parent_data["npdi_requires_attachment"],
        "npdi_launch_milestone": parent_data["npdi_launch_milestone"],
    }

    all_deps = list(current_deps)
    raw_deps_col10 = parent_data["raw_deps"]
    if raw_deps_col10:
        for d in raw_deps_col10.split(","):
            d = d.strip()
            if d and d not in all_deps:
                all_deps.append(d)

    if not all_deps:
        r_out = dict(base_row)
        r_out["depends_on.task"] = ""
        out_rows.append(r_out)
    else:
        for dep_id in all_deps:
            r_out = dict(base_row)
            r_out["depends_on.task"] = dep_id
            out_rows.append(r_out)


if __name__ == "__main__":
    convert_template()
