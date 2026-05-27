import frappe

def run():
    projects = frappe.get_all("Project", order_by="creation desc", limit=1, fields=["name"])
    if not projects:
        print("No projects found.")
        return
    
    project_name = projects[0].name
    print(f"Inspecting hierarchy for project: {project_name}")
    
    tasks = frappe.get_all("Task", 
                           filters={"project": project_name}, 
                           fields=["name", "subject", "parent_task", "is_group", "exp_start_date", "exp_end_date"])
                           
    task_by_name = {t.name: t for t in tasks}
    
    print("\nGroup Tasks in Project:")
    print(f"{'Name':<20} | {'Subject':<50} | {'Start':<12} | {'End':<12} | {'Children Count':<15}")
    print("-" * 115)
    
    for t in tasks:
        if t.is_group:
            # Find children
            children = [c for c in tasks if c.parent_task == t.name]
            print(f"{t.name:<20} | {t.subject[:48]:<50} | {str(t.exp_start_date):<12} | {str(t.exp_end_date):<12} | {len(children):<15}")
            if children:
                for c in children:
                    print(f"  └─ {c.name:<18} : {c.subject[:48]:<50} (Start: {c.exp_start_date}, End: {c.exp_end_date})")
