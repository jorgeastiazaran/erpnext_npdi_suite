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
    setup_default_npdi_stages()


def _create_custom_fields_idempotent(custom_fields_map):
    """
    Calls create_custom_fields() for new fields, and updates existing custom fields
    if fieldtype or options changed.
    """
    to_create = {}
    for dt, fields in custom_fields_map.items():
        missing = []
        for f in fields:
            cf_name = frappe.db.get_value("Custom Field", {"dt": dt, "fieldname": f["fieldname"]})
            if not cf_name:
                missing.append(f)
            else:
                # Update existing if fieldtype/options changed
                cf = frappe.get_doc("Custom Field", cf_name)
                updated = False
                if f.get("fieldtype") and cf.fieldtype != f["fieldtype"]:
                    cf.fieldtype = f["fieldtype"]
                    updated = True
                if f.get("options") and cf.options != f["options"]:
                    cf.options = f["options"]
                    updated = True
                if updated:
                    cf.save(ignore_permissions=True)
        if missing:
            to_create[dt] = missing

    if to_create:
        create_custom_fields(to_create, ignore_validate=True)

def setup_default_npdi_stages():
    """
    Creates standard NPDI Stage tree documents and migrates any existing
    stage strings from Project Template Task and Task to ensure consistency.
    """
    # 1. Standard Stages
    standard_stages = [
        {"stage_name": "1 – IDEA", "stage_order": 10, "color": "#4f8cff", "description": "Etapa de ideación y recopilación de oportunidades."},
        {"stage_name": "2 – CONCEPTO", "stage_order": 20, "color": "#f59e0b", "description": "Definición y viabilidad del concepto de producto."},
        {"stage_name": "3 – DESARROLLO", "stage_order": 30, "color": "#22c55e", "description": "Desarrollo técnico, formulación y empaque."},
        {"stage_name": "4 – LANZAMIENTO", "stage_order": 40, "color": "#a855f7", "description": "Producción piloto, escalamiento y lanzamiento comercial."},
        {"stage_name": "5 – POST-LANZAMIENTO", "stage_order": 50, "color": "#14b8a6", "description": "Evaluación post-lanzamiento y seguimiento de desempeño."}
    ]

    for st in standard_stages:
        if not frappe.db.exists("NPDI Stage", st["stage_name"]):
            try:
                doc = frappe.get_doc({
                    "doctype": "NPDI Stage",
                    "stage_name": st["stage_name"],
                    "stage_order": st["stage_order"],
                    "color": st["color"],
                    "description": st["description"],
                    "is_group": 0
                })
                doc.insert(ignore_permissions=True)
            except Exception as e:
                frappe.log_error(f"Error seeding NPDI Stage {st['stage_name']}: {e}", "setup_default_npdi_stages")

    # 2. Migrate existing distinct stage names from Task and Project Template Task
    try:
        existing_template_stages = frappe.db.sql_list(
            """SELECT DISTINCT npdi_stage_name FROM `tabProject Template Task` WHERE IFNULL(npdi_stage_name, '') != ''"""
        )
        existing_task_stages = frappe.db.sql_list(
            """SELECT DISTINCT npdi_stage_name FROM `tabTask` WHERE IFNULL(npdi_stage_name, '') != ''"""
        )
        all_existing = set(existing_template_stages + existing_task_stages)
        for stage_str in all_existing:
            stage_str = stage_str.strip()
            if stage_str and not frappe.db.exists("NPDI Stage", stage_str):
                try:
                    doc = frappe.get_doc({
                        "doctype": "NPDI Stage",
                        "stage_name": stage_str,
                        "is_group": 0,
                        "stage_order": 100
                    })
                    doc.insert(ignore_permissions=True)
                except Exception:
                    pass
    except Exception:
        pass

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
    ("Project Template", "npdi_task_dependencies"),
    # Project Template Task
    ("Project Template Task", "npdi_stage_name"),
    ("Project Template Task", "npdi_module"),
    ("Project Template Task", "npdi_responsible_role"),
    ("Project Template Task", "npdi_requires_attachment"),
    ("Project Template Task", "npdi_launch_milestone"),
    ("Project Template Task", "npdi_duration_unit"),
    ("Project Template Task", "duration"),
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
    ("Task", "task_owner"),
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
            },
            {
                "fieldname": "npdi_task_dependencies",
                "fieldtype": "Table",
                "label": "Dependencies (NPDI)",
                "options": "NPDI Template Task Dependency",
                "insert_after": "tasks"
            }
        ],
        # ── Extensión de la plantilla nativa de tareas ───────────────────────
        "Project Template Task": [
            {
                "fieldname": "npdi_stage_name",
                "label": "Etapa NPDI",
                "fieldtype": "Link",
                "options": "NPDI Stage",
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
            },
            {
                "fieldname": "npdi_duration_unit",
                "label": "Unidad de Duración",
                "fieldtype": "Select",
                "options": "days\nweeks\nmonths",
                "default": "days",
                "insert_after": "npdi_launch_milestone",
                "description": "Unidad para la duración de la tarea."
            },
            {
                "fieldname": "duration",
                "label": "Duración (días)",
                "fieldtype": "Float",
                "default": "0",
                "insert_after": "npdi_duration_unit",
                "description": "Duración de la tarea en días. Si se especifica aquí, sobreescribe la duración de la tarea vinculada al instanciar el proyecto."
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
                "fieldtype": "Link",
                "options": "NPDI Stage",
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
                "fieldname": "task_owner",
                "label": "Responsable (Dueño)",
                "fieldtype": "Link",
                "options": "User",
                "insert_after": "npdi_responsible_role"
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
