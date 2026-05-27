import frappe

def run():
    template_name = "NPDI Base Template"
    print(f"Inspecting Project Template: {template_name}")
    
    # Check Project Template Tasks
    tasks = frappe.get_all("Project Template Task", 
                           filters={"parent": template_name}, 
                           fields=["name", "task"])
                           
    print(f"Total tasks in template: {len(tasks)}")
    
    for t in tasks:
        # Get details from standard Task document referenced by the template task
        task_doc = frappe.get_doc("Task", t.task)
        print(f"Template Task: {t.name} -> Ref Task: {t.task} ({task_doc.subject})")
        print(f"  Ref Task is_group: {task_doc.is_group}, parent_task: {task_doc.parent_task}")
