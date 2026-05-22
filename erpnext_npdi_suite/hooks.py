from . import __version__ as app_version

app_name = "erpnext_npdi_suite"
app_title = "ERPNext NPDI Suite"
app_publisher = "Tecnofood"
app_description = "Suite estratégica para la gestión del proceso de Desarrollo e Introducción de Nuevos Productos (NPDI)"
app_icon = "octicon octicon-project"
app_color = "#2E7D32"
app_email = "tecnofoodmx@gmail.com"
app_license = "MIT"

# Hook disparado al instalar la app en una instancia
after_install = "erpnext_npdi_suite.erpnext_npdi_suite.setup.install.after_install"
after_migrate = "erpnext_npdi_suite.erpnext_npdi_suite.setup.install.after_install"


# Ganchos de documentos transaccionales
doc_events = {
    "Task": {
        "before_validate": ["erpnext_npdi_suite.erpnext_npdi_suite.engine.cpm.task_before_validate"],
        "before_save": ["erpnext_npdi_suite.erpnext_npdi_suite.engine.cpm.task_before_save"],
        # Dispara el recálculo CPM de todo el proyecto al actualizar una tarea
        "on_update": ["erpnext_npdi_suite.erpnext_npdi_suite.engine.cpm.on_task_update"]
    },
    "Project": {
        "before_insert": ["erpnext_npdi_suite.erpnext_npdi_suite.engine.cpm.before_project_insert"],
        # Transfiere los atributos extendidos desde Project Template Task hacia las Tareas generadas
        "on_update": ["erpnext_npdi_suite.erpnext_npdi_suite.engine.cpm.on_project_insert"]
    }
}

# Custom Scripts Injected into Standard UI
doctype_js = {
    "Project": "public/js/project.js",
    "Project Template": "public/js/project_template.js",
    "Task": "public/js/task.js"
}
