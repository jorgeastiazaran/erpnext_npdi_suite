import frappe

def run():
    tasks = frappe.get_all("Task", 
                           filters={"is_group": 1, "project": ["!=", ""]}, 
                           fields=["name", "subject", "project", "exp_start_date", "exp_end_date"])
    print(f"Group tasks in projects:")
    for gt in tasks:
        # Get children
        children = frappe.get_all("Task", 
                                  filters={"parent_task": gt.name}, 
                                  fields=["name", "subject", "exp_start_date", "exp_end_date"])
        print(f"\nGroup Task: {gt.name} ({gt.subject}) in Project: {gt.project} is {gt.exp_start_date} to {gt.exp_end_date}")
        print(f"  Children Count: {len(children)}")
        for c in children:
            print(f"    - Child: {c.name} ({c.subject}): Start={c.exp_start_date}, End={c.exp_end_date}")
