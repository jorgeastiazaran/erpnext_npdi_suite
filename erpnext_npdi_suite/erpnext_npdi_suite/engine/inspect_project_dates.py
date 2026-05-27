import frappe

def run():
    # Print the last 5 projects and their task dates
    projects = frappe.get_all("Project", order_by="creation desc", limit=5, fields=["name", "expected_start_date"])
    for p in projects:
        print(f"\n=========================================")
        print(f"Project: {p.name} | Start Date: {p.expected_start_date}")
        print(f"=========================================")
        tasks = frappe.get_all("Task", 
                               filters={"project": p.name}, 
                               fields=["name", "subject", "parent_task", "is_group", "exp_start_date", "exp_end_date", "duration"],
                               order_by="exp_start_date asc")
        
        # Build children dict
        children = {}
        for t in tasks:
            if t.parent_task:
                children.setdefault(t.parent_task, []).append(t)
                
        for t in tasks:
            if t.is_group:
                print(f"Group: {t.name} ({t.subject}) | Start: {t.exp_start_date} | End: {t.exp_end_date} | Duration: {t.duration}")
                my_children = children.get(t.name, [])
                print(f"  Children ({len(my_children)}):")
                for c in my_children:
                    print(f"    - {c.name} ({c.subject}) | Start: {c.exp_start_date} | End: {c.exp_end_date} | Duration: {c.duration}")
