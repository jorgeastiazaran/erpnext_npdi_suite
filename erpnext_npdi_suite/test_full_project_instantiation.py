import frappe

def run_test():
    print("=== TESTING FULL NPDI PROJECT INSTANTIATION & SEQUENTIAL DATE CALCULATION ===")

    # 1. Clean up old test projects
    frappe.db.sql("DELETE FROM `tabTask Depends On` WHERE parent LIKE 'TEST-NPDI-PROJ%'")
    frappe.db.sql("DELETE FROM `tabTask` WHERE project LIKE 'TEST-NPDI-PROJ%'")
    frappe.db.sql("DELETE FROM `tabProject` WHERE name LIKE 'TEST-NPDI-PROJ%'")
    frappe.db.commit()

    # 2. Check template exists
    template_name = "NPDI Core Template"
    if not frappe.db.exists("Project Template", template_name):
        raise ValueError(f"Project Template '{template_name}' does not exist.")

    # 3. Create Project from NPDI Core Template starting 2026-09-01
    project = frappe.get_doc({
        "doctype": "Project",
        "project_name": "TEST-NPDI-PROJ-V13",
        "project_template": template_name,
        "expected_start_date": "2026-09-01",
        "status": "Open"
    })
    project.insert(ignore_permissions=True)
    frappe.db.commit()

    print(f"✅ Successfully created Project '{project.name}' from '{template_name}'.")

    # 4. Fetch all created tasks ordered by expected start date
    tasks = frappe.get_all(
        "Task",
        filters={"project": project.name},
        fields=[
            "name", "subject", "is_group", "is_milestone",
            "npdi_stage_name", "npdi_launch_milestone",
            "exp_start_date", "exp_end_date", "duration"
        ],
        order_by="exp_start_date asc, creation asc"
    )

    print(f"Total tasks created in project: {len(tasks)}")

    # 5. Inspect key milestones & stage transition tasks
    print("\n" + "="*110)
    print(f"{'Subject':<55} | {'Stage':<18} | {'Milestone':<9} | {'Start Date':<12} | {'End Date':<12}")
    print("="*110)

    for t in tasks:
        is_m = "YES" if (t.is_milestone or t.npdi_launch_milestone or "stage-gate" in t.subject.lower()) else "NO"
        # Print milestones, group tasks, or selected sequential tasks
        if is_m == "YES" or t.is_group or "brainstorming" in t.subject.lower() or "filtrado" in t.subject.lower() or "comercializ" in t.subject.lower():
            print(f"{t.subject[:53]:<55} | {t.npdi_stage_name or '':<18} | {is_m:<9} | {str(t.exp_start_date)[:10]:<12} | {str(t.exp_end_date)[:10]:<12}")

    # 6. Verify assertions on milestone dates and stage transitions
    stage_gates = [t for t in tasks if "stage-gate" in t.subject.lower()]
    assert len(stage_gates) > 0, "Project should contain Stage-Gate milestone tasks"

    for sg in stage_gates:
        # Check that stage gate milestone start equals end date (0 duration)
        start_str = str(sg.exp_start_date)[:10]
        end_str = str(sg.exp_end_date)[:10]
        assert start_str == end_str, f"Stage Gate '{sg.subject}' start ({start_str}) must equal end date ({end_str})"

    # Verify that tasks depending on a stage-gate start ON or AFTER the stage-gate finish
    idea_gate = next((t for t in tasks if "stage-gate idea" in t.subject.lower()), None)
    concept_gate = next((t for t in tasks if "stage-gate concepto" in t.subject.lower()), None)

    if idea_gate:
        idea_gate_end = str(idea_gate.exp_end_date)[:10]
        print(f"\nSTAGE-GATE IDEA End Date: {idea_gate_end}")
        # Tasks in Stage 2 (CONCEPTO) depending on Stage 1 gate should start on or after idea_gate_end
        stage_2_tasks = [t for t in tasks if t.npdi_stage_name == "2 – CONCEPTO" and not t.is_group]
        for s2 in stage_2_tasks:
            s2_start = str(s2.exp_start_date)[:10]
            assert s2_start >= idea_gate_end, f"Stage 2 task '{s2.subject}' start ({s2_start}) must be >= Stage 1 Gate end ({idea_gate_end})"

    print("\n✅ ALL FULL PROJECT INSTANTIATION TESTS PASSED PERFECTLY!")

if __name__ == "__main__":
    run_test()
