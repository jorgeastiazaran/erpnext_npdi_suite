import frappe

def run():
    proj = frappe.get_doc("Project", "PROJ-0041")
    print("Project Template:", proj.project_template)
    
    tasks = frappe.get_all("Task", filters={"project": "PROJ-0041"}, fields=["name", "subject", "parent_task", "is_group"])
    for t in tasks:
        doc = frappe.get_doc("Task", t.name)
        deps = [d.task for d in doc.depends_on] if doc.depends_on else []
        print(f"Task: {t.name} ({t.subject}) | Parent: {t.parent_task} | is_group: {t.is_group} | deps: {deps}")


