import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

def ensure_kg_uom():
    if not frappe.db.exists("UOM", "Kg"):
        frappe.get_doc({
            "doctype": "UOM",
            "uom_name": "Kg",
            "must_be_whole_number": 0
        }).insert(ignore_permissions=True)

def after_install():
    """Gancho ejecutado tras la instalación de la app para inyectar los Custom Fields en la instancia."""
    ensure_kg_uom()
    create_custom_fields(get_custom_fields(), ignore_validate=True)
    setup_property_setters()

def setup_property_setters():
    if not frappe.db.exists("Property Setter", {"doc_type": "Task Depends On", "field_name": "subject", "property": "fetch_from"}):
        frappe.get_doc({
            "doctype": "Property Setter",
            "doctype_or_field": "DocField",
            "doc_type": "Task Depends On",
            "field_name": "subject",
            "property": "fetch_from",
            "value": "task.subject",
            "property_type": "Data"
        }).insert(ignore_permissions=True)


def get_custom_fields():
    return {
        # Extensión de la plantilla nativa de tareas
        "Project Template Task": [
            {
                "fieldname": "npdi_stage_name",
                "label": "Etapa NPDI",
                "fieldtype": "Data",
                "insert_after": "task"
            },
            {
                "fieldname": "npdi_module",
                "label": "Módulo NPDI",
                "fieldtype": "Select",
                "options": "Core\nFormula\nPack\nBrand",
                "default": "Core",
                "insert_after": "npdi_stage_name"
            },
            {
                "fieldname": "npdi_responsible_role",
                "label": "Rol Responsable",
                "fieldtype": "Link",
                "options": "Role",
                "insert_after": "npdi_module"
            },
            {
                "fieldname": "npdi_requires_attachment",
                "label": "Requiere Evidencia Adjunta",
                "fieldtype": "Check",
                "default": "0",
                "insert_after": "npdi_responsible_role"
            },
            {
                "fieldname": "npdi_launch_milestone",
                "label": "Hito de Lanzamiento",
                "fieldtype": "Check",
                "default": "0",
                "insert_after": "npdi_requires_attachment"
            }
        ],
        # Extensión del proyecto transaccional
        "Project": [
            {
                "fieldname": "npdi_project_variant",
                "label": "Variante de Proyecto NPDI",
                "fieldtype": "Select",
                "options": "Formula\nPack\nBrand",
                "insert_after": "project_type"
            },
            {
                "fieldname": "npdi_baseline_section",
                "label": "Línea Base (Baseline NPDI)",
                "fieldtype": "Section Break",
                "insert_after": "copied_from"
            },
            {
                "fieldname": "npdi_baseline_locked",
                "label": "Línea Base Congelada",
                "fieldtype": "Check",
                "read_only": 1,
                "insert_after": "npdi_baseline_section"
            },
            {
                "fieldname": "npdi_baseline_start",
                "label": "Inicio de Línea Base",
                "fieldtype": "Datetime",
                "read_only": 1,
                "insert_after": "npdi_baseline_locked"
            },
            {
                "fieldname": "npdi_baseline_end",
                "label": "Fin de Línea Base",
                "fieldtype": "Datetime",
                "read_only": 1,
                "insert_after": "npdi_baseline_start"
            }
        ],
        # Extensión de la tarea transaccional
        "Task": [
            {
                "fieldname": "npdi_cpm_section",
                "label": "Motor de Ruta Crítica (CPM)",
                "fieldtype": "Section Break",
                "insert_after": "completed_on"
            },
            {
                "fieldname": "npdi_cpm_early_start",
                "label": "Inicio Temprano (ES)",
                "fieldtype": "Datetime",
                "read_only": 1,
                "insert_after": "npdi_cpm_section"
            },
            {
                "fieldname": "npdi_cpm_early_finish",
                "label": "Fin Temprano (EF)",
                "fieldtype": "Datetime",
                "read_only": 1,
                "insert_after": "npdi_cpm_early_start"
            },
            {
                "fieldname": "npdi_cpm_late_start",
                "label": "Inicio Tardío (LS)",
                "fieldtype": "Datetime",
                "read_only": 1,
                "insert_after": "npdi_cpm_early_finish"
            },
            {
                "fieldname": "npdi_cpm_late_finish",
                "label": "Fin Tardío (LF)",
                "fieldtype": "Datetime",
                "read_only": 1,
                "insert_after": "npdi_cpm_late_start"
            },
            {
                "fieldname": "npdi_cpm_total_float",
                "label": "Holgura Total (Horas)",
                "fieldtype": "Float",
                "read_only": 1,
                "insert_after": "npdi_cpm_late_finish"
            },
            {
                "fieldname": "npdi_cpm_is_critical",
                "label": "Es Ruta Crítica",
                "fieldtype": "Check",
                "read_only": 1,
                "insert_after": "npdi_cpm_total_float"
            },
            {
                "fieldname": "npdi_manual_section",
                "label": "Restricciones Manuales NPDI",
                "fieldtype": "Section Break",
                "insert_after": "npdi_cpm_is_critical"
            },
            {
                "fieldname": "npdi_cpm_manual_dates",
                "label": "Forzar Fechas Manuales",
                "fieldtype": "Check",
                "insert_after": "npdi_manual_section"
            },
            {
                "fieldname": "npdi_manual_start",
                "label": "Inicio Manual",
                "fieldtype": "Datetime",
                "insert_after": "npdi_cpm_manual_dates"
            },
            {
                "fieldname": "npdi_manual_end",
                "label": "Fin Manual",
                "fieldtype": "Datetime",
                "insert_after": "npdi_manual_start"
            },
            {
                "fieldname": "npdi_attributes_section",
                "label": "Atributos y Trazabilidad NPDI",
                "fieldtype": "Section Break",
                "insert_after": "npdi_manual_end"
            },
            {
                "fieldname": "npdi_stage_name",
                "label": "Etapa NPDI",
                "fieldtype": "Data",
                "insert_after": "npdi_attributes_section"
            },
            {
                "fieldname": "npdi_module",
                "label": "Módulo NPDI",
                "fieldtype": "Select",
                "options": "Core\nFormula\nPack\nBrand",
                "default": "Core",
                "insert_after": "npdi_stage_name"
            },
            {
                "fieldname": "npdi_responsible_role",
                "label": "Rol Responsable",
                "fieldtype": "Link",
                "options": "Role",
                "insert_after": "npdi_module"
            },
            {
                "fieldname": "npdi_requires_attachment",
                "label": "Requiere Evidencia Adjunta",
                "fieldtype": "Check",
                "default": "0",
                "insert_after": "npdi_responsible_role"
            },
            {
                "fieldname": "npdi_launch_milestone",
                "label": "Hito de Lanzamiento",
                "fieldtype": "Check",
                "default": "0",
                "insert_after": "npdi_requires_attachment"
            },
            {
                "fieldname": "npdi_baseline_start",
                "label": "Inicio de Línea Base",
                "fieldtype": "Datetime",
                "read_only": 1,
                "insert_after": "npdi_launch_milestone"
            },
            {
                "fieldname": "npdi_baseline_end",
                "label": "Fin de Línea Base",
                "fieldtype": "Datetime",
                "read_only": 1,
                "insert_after": "npdi_baseline_start"
            }
        ]
    }
