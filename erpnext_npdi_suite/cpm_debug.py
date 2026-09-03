import frappe
from erpnext_npdi_suite.erpnext_npdi_suite.engine.cpm import CPMEngine
import traceback

def run():
    with open("/tmp/cpm_out.txt", "w") as f:
        try:
            project = "PROJ-0045"
            engine = CPMEngine(project)
            engine.load_tasks()
            engine.resolve_group_statuses()
            
            launch_milestone_task = None
            for t_name, doc in engine.tasks.items():
                if int(doc.get("npdi_launch_milestone") or 0):
                    launch_milestone_task = t_name
                    break
            f.write(f"Launch Milestone Task: {launch_milestone_task}\n")
            
            start_tasks = [t for t in engine.tasks if not engine.predecessors.get(t)]
            for task_name in start_tasks:
                engine._forward_pass(task_name)
                
            f.write(f"Forward pass completed. Total tasks with EF: {len(engine.ef)}\n")
            
            end_tasks = [t for t in engine.tasks if not engine.successors.get(t)]
            if not end_tasks:
                end_tasks = list(engine.tasks.keys())
                
            if launch_milestone_task and launch_milestone_task in engine.ef:
                max_ef = engine.ef[launch_milestone_task]
                f.write(f"Using Launch Milestone max_ef: {max_ef}\n")
            else:
                max_ef = max([engine.ef[t] for t in engine.tasks if t in engine.ef] or [frappe.utils.now_datetime()])
                f.write(f"Using absolute max_ef: {max_ef}\n")
                
            for t in end_tasks:
                if t in engine.ef:
                    engine.lf[t] = max_ef
                    engine.ls[t] = frappe.utils.add_to_date(max_ef, hours=-engine._duration_hours(t))
                    
            visited = set()
            for t in end_tasks:
                engine._backward_pass(t, visited)
                
            f.write("\nTasks Float & Criticality:\n")
            for t in engine.tasks:
                f.write(f"Task: {t}\n")
        except Exception as e:
            f.write(traceback.format_exc())