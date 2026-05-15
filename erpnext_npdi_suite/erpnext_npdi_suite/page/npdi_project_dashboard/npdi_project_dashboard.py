import frappe
from erpnext_npdi_suite.engine.cpm import CPMEngine

@frappe.whitelist()
def get_project_data(project_name):
    """Retorna los datos transaccionales del proyecto y sus tareas particionadas para alimentar el Dashboard."""
    if not frappe.has_permission("Project", doc=project_name):
        frappe.throw("No tienes permisos para visualizar este Proyecto.")

    project_doc = frappe.get_doc("Project", project_name)
    
    # Consulta de tareas
    tasks = frappe.get_all("Task", 
        filters={"project": project_name}, 
        fields=["name", "subject", "status", "is_group", "parent_task", "exp_start_date", "exp_end_date", 
                "npdi_stage_name", "npdi_module", "npdi_requires_attachment", "npdi_launch_milestone", 
                "npdi_cpm_early_start", "npdi_cpm_early_finish", "npdi_cpm_total_float", "npdi_cpm_is_critical"],
        order_by="exp_start_date asc"
    )

    # Extrae dependencias hijas para inyectarlas al renderizador de Frappe Gantt SVG
    for t in tasks:
        deps = frappe.get_all("Task Depends On", filters={"parent": t.name}, fields=["task"])
        t["depends_on_tasks"] = [d.task for d in deps if d.task]

    return {
        "project": project_doc.as_dict(),
        "tasks": tasks
    }


@frappe.whitelist()
def trigger_cpm_recalc(project_name):
    """Método disparado manualmente desde el botón del Dashboard para forzar un recálculo maestro."""
    engine = CPMEngine(project_name)
    engine.compute()
    return {"status": "success"}
