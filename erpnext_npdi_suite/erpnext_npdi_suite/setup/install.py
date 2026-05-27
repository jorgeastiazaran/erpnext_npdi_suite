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
    """
    Gancho ejecutado tras la instalación de la app.
    Idempotente: seguro de ejecutar múltiples veces sin errores DuplicateEntry.
    """
    ensure_kg_uom()
    _create_custom_fields_idempotent(get_custom_fields())
    setup_property_setters()


def _create_custom_fields_idempotent(custom_fields_map):
    """
    Calls create_custom_fields() only for fields that do not yet exist.
    Makes the installer safe to run on both fresh and partially-migrated sites.
    """
    filtered = {}
    for dt, fields in custom_fields_map.items():
        missing = [
            f for f in fields
            if not frappe.db.exists("Custom Field", {"dt": dt, "fieldname": f["fieldname"]})
        ]
        if missing:
            filtered[dt] = missing

    if filtered:
        create_custom_fields(filtered, ignore_validate=True)

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



# ─── List of ALL custom fields this app injects into standard DocTypes ───────
# Keep this list in sync with get_custom_fields() above.
# Format: (DocType, fieldname)
_NPDI_SUITE_CUSTOM_FIELDS = [
    # Project Template
    ("Project Template", "npdi_template_module"),
    # Project Template Task
    ("Project Template Task", "npdi_stage_name"),
    ("Project Template Task", "npdi_module"),
    ("Project Template Task", "npdi_responsible_role"),
    ("Project Template Task", "npdi_requires_attachment"),
    ("Project Template Task", "npdi_launch_milestone"),
    # Project
    ("Project", "npdi_project_variant"),
    ("Project", "npdi_baseline_section"),
    ("Project", "npdi_baseline_locked"),
    ("Project", "npdi_baseline_start"),
    ("Project", "npdi_baseline_end"),
    # Task
    ("Task", "npdi_cpm_section"),
    ("Task", "npdi_cpm_early_start"),
    ("Task", "npdi_cpm_early_finish"),
    ("Task", "npdi_cpm_late_start"),
    ("Task", "npdi_cpm_late_finish"),
    ("Task", "npdi_cpm_total_float"),
    ("Task", "npdi_cpm_is_critical"),
    ("Task", "npdi_manual_section"),
    ("Task", "npdi_cpm_manual_dates"),
    ("Task", "npdi_manual_start"),
    ("Task", "npdi_manual_end"),
    ("Task", "npdi_attributes_section"),
    ("Task", "npdi_stage_name"),
    ("Task", "npdi_module"),
    ("Task", "npdi_responsible_role"),
    ("Task", "npdi_requires_attachment"),
    ("Task", "npdi_launch_milestone"),
    ("Task", "npdi_baseline_start"),
    ("Task", "npdi_baseline_end"),
]

# Property Setters created by this app
_NPDI_SUITE_PROPERTY_SETTERS = [
    # (doc_type, field_name, property)
    ("Task Depends On", "subject", "fetch_from"),
]


def before_uninstall():
    """
    Hook ejecutado antes de remover la app de un sitio.
    Elimina todos los Custom Fields y Property Setters inyectados por erpnext_npdi_suite.
    """
    frappe.logger().info("erpnext_npdi_suite: running before_uninstall cleanup…")

    # 1. Delete Custom Field records
    for dt, fieldname in _NPDI_SUITE_CUSTOM_FIELDS:
        cf_name = frappe.db.get_value(
            "Custom Field", {"dt": dt, "fieldname": fieldname}
        )
        if cf_name:
            frappe.delete_doc(
                "Custom Field", cf_name,
                ignore_missing=True, ignore_permissions=True, force=True
            )
            frappe.logger().info(f"  Deleted Custom Field: {dt} → {fieldname}")

    # 2. Delete Property Setter records
    for doc_type, field_name, prop in _NPDI_SUITE_PROPERTY_SETTERS:
        ps_name = frappe.db.get_value(
            "Property Setter",
            {"doc_type": doc_type, "field_name": field_name, "property": prop}
        )
        if ps_name:
            frappe.delete_doc(
                "Property Setter", ps_name,
                ignore_missing=True, ignore_permissions=True, force=True
            )
            frappe.logger().info(f"  Deleted Property Setter: {doc_type}.{field_name}.{prop}")

    frappe.db.commit()
    frappe.logger().info("erpnext_npdi_suite: before_uninstall cleanup complete.")


def get_custom_fields():
    return {
        # ── Extensión de Project Template (P5) ──────────────────────────────
        # Allows tagging a template with its NPDI module scope so users can
        # filter templates (e.g. Core / Formula / Pack / Brand) when creating
        # a new project.
        "Project Template": [
            {
                "fieldname": "npdi_template_module",
                "label": "Módulo NPDI de la Plantilla",
                "fieldtype": "Select",
                "options": "\nCore\nFormula\nPack\nBrand",
                "default": "",
                "insert_after": "project_type",
                "description": "Módulo NPDI al que aplica esta plantilla. Se usará para filtrar plantillas al crear un nuevo proyecto."
            }
        ],
        # ── Extensión de la plantilla nativa de tareas ───────────────────────
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
