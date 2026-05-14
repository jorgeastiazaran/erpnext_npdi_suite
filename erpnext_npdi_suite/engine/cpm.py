import frappe
from frappe.utils import now_datetime, get_datetime, add_to_date
from collections import defaultdict

class CPMEngine:
    """Motor de Ruta Crítica (CPM) nativo para Tareas de ERPNext en un Proyecto."""

    def __init__(self, project_name):
        self.project_name = project_name
        self.tasks = {}          # {task_name: doc}
        self.successors = defaultdict(list)
        self.predecessors = defaultdict(list)
        self.es = {}             # Early Start
        self.ef = {}             # Early Finish
        self.ls = {}             # Late Start
        self.lf = {}             # Late Finish
        self.float = {}          # Holgura Total
        self.is_critical = {}    # Bool

    def load_tasks(self):
        """Carga las tareas del proyecto y mapea la red topológica mediante depends_on nativo."""
        task_records = frappe.get_all("Task", filters={"project": self.project_name}, fields=["name", "subject", "duration", "exp_start_date", "exp_end_date"])
        for t in task_records:
            doc = frappe.get_doc("Task", t.name)
            self.tasks[t.name] = doc
            # Construye la red desde la tabla hija nativa 'depends_on'
            if doc.get("depends_on"):
                for dep in doc.depends_on:
                    if dep.task:
                        self.predecessors[t.name].append(dep.task)
                        self.successors[dep.task].append(t.name)

    def compute(self):
        """Ejecuta las pasadas hacia adelante y hacia atrás, respetando fechas manuales."""
        self.load_tasks()
        if not self.tasks:
            return

        # Nodos iniciales (sin predecesores)
        start_tasks = [t for t in self.tasks if not self.predecessors.get(t)]

        # Pasada hacia adelante (ES / EF)
        for task_name in start_tasks:
            self._forward_pass(task_name)

        # Pasada hacia atrás (LS / LF)
        end_tasks = [t for t in self.tasks if not self.successors.get(t)]
        if not end_tasks:
            end_tasks = list(self.tasks.keys()) # Respaldo para redes circulares

        max_ef = max([self.ef[t] for t in self.tasks if t in self.ef] or [now_datetime()])
        for t in end_tasks:
            if t in self.ef:
                self.lf[t] = max_ef
                self.ls[t] = add_to_date(max_ef, hours=-self._duration_hours(t))

        visited = set()
        for t in end_tasks:
            self._backward_pass(t, visited)

        # Cálculo de holgura y ruta crítica
        for t in self.tasks:
            if t in self.ls and t in self.es:
                self.float[t] = (self.ls[t] - self.es[t]).total_seconds() / 3600.0
                self.is_critical[t] = abs(self.float[t]) < 0.1
            else:
                self.float[t] = 0.0
                self.is_critical[t] = False

        # Persistencia masiva transaccional
        for task_name, doc in self.tasks.items():
            if task_name in self.es and task_name in self.ef:
                es_val = self.es[task_name]
                ef_val = self.ef[task_name]
                ls_val = self.ls.get(task_name, es_val)
                lf_val = self.lf.get(task_name, ef_val)
                
                # Actualiza campos custom y nativos en bloque
                doc.db_set({
                    "npdi_cpm_early_start": es_val,
                    "npdi_cpm_early_finish": ef_val,
                    "npdi_cpm_late_start": ls_val,
                    "npdi_cpm_late_finish": lf_val,
                    "npdi_cpm_total_float": self.float[task_name],
                    "npdi_cpm_is_critical": 1 if self.is_critical[task_name] else 0,
                    # Actualiza fechas nativas para alinear el diagrama SVG estándar
                    "exp_start_date": es_val.date(),
                    "exp_end_date": ef_val.date()
                })

    def _duration_hours(self, task_name):
        doc = self.tasks[task_name]
        if doc.get("npdi_cpm_manual_dates") and doc.get("npdi_manual_start") and doc.get("npdi_manual_end"):
            return (get_datetime(doc.npdi_manual_end) - get_datetime(doc.npdi_manual_start)).total_seconds() / 3600.0
        elif doc.get("duration"):
            return float(doc.duration) * 24.0
        else:
            return 24.0 # 1 día por defecto

    def _forward_pass(self, task_name):
        if task_name in self.es:
            return

        doc = self.tasks[task_name]
        if doc.get("npdi_cpm_manual_dates") and doc.get("npdi_manual_start"):
            self.es[task_name] = get_datetime(doc.npdi_manual_start)
        else:
            preds = self.predecessors.get(task_name, [])
            if not preds:
                project_doc = frappe.get_doc("Project", self.project_name)
                start_base = project_doc.expected_start_date or now_datetime()
                self.es[task_name] = get_datetime(start_base)
            else:
                for p in preds:
                    self._forward_pass(p)
                valid_efs = [self.ef[p] for p in preds if p in self.ef]
                self.es[task_name] = max(valid_efs) if valid_efs else now_datetime()

        duration = self._duration_hours(task_name)
        self.ef[task_name] = add_to_date(self.es[task_name], hours=duration)

        for succ in self.successors.get(task_name, []):
            self._forward_pass(succ)

    def _backward_pass(self, task_name, visited):
        if task_name in visited:
            return
        visited.add(task_name)

        successors = self.successors.get(task_name, [])
        if not successors:
            return

        for s in successors:
            self._backward_pass(s, visited)

        valid_lss = [self.ls[s] for s in successors if s in self.ls]
        if valid_lss:
            self.lf[task_name] = min(valid_lss)
            self.ls[task_name] = add_to_date(self.lf[task_name], hours=-self._duration_hours(task_name))

        doc = self.tasks[task_name]
        if doc.get("npdi_cpm_manual_dates") and doc.get("npdi_manual_end"):
            manual_lf = get_datetime(doc.npdi_manual_end)
            if task_name in self.lf and manual_lf < self.lf[task_name]:
                self.lf[task_name] = manual_lf
                self.ls[task_name] = add_to_date(manual_lf, hours=-self._duration_hours(task_name))

        for p in self.predecessors.get(task_name, []):
            self._backward_pass(p, visited)


def on_task_update(doc, method):
    """Gancho disparado al actualizar una tarea para propagar fechas en todo el proyecto."""
    if doc.project:
        # Desacoplamiento para prevenir recursividad
        if getattr(frappe.local, 'cpm_processing', False):
            return
        frappe.local.cpm_processing = True
        try:
            engine = CPMEngine(doc.project)
            engine.compute()
        finally:
            frappe.local.cpm_processing = False


def on_project_insert(doc, method):
    """Gancho disparado al instanciar un Proyecto para heredar atributos custom desde Project Template Task."""
    if not doc.project_template:
        return
        
    template_tasks = frappe.get_all("Project Template Task", filters={"parent": doc.project_template}, fields=["task", "npdi_stage_name", "npdi_module", "npdi_responsible_role", "npdi_requires_attachment", "npdi_launch_milestone"])
    if not template_tasks:
        return

    # Mapea las tareas generadas en el proyecto actual por título
    generated_tasks = frappe.get_all("Task", filters={"project": doc.name}, fields=["name", "subject"])
    task_map = {t.subject: t.name for t in generated_tasks}

    for tmpl in template_tasks:
        target_task_name = task_map.get(tmpl.task)
        if target_task_name:
            frappe.db.set_value("Task", target_task_name, {
                "npdi_stage_name": tmpl.npdi_stage_name,
                "npdi_module": tmpl.npdi_module or "Core",
                "npdi_responsible_role": tmpl.npdi_responsible_role,
                "npdi_requires_attachment": tmpl.npdi_requires_attachment,
                "npdi_launch_milestone": tmpl.npdi_launch_milestone
            })


@frappe.whitelist()
def capture_project_baseline(project_name):
    """Método de lista blanca para congelar la fotografía de fechas planificadas (Baseline)."""
    project_doc = frappe.get_doc("Project", project_name)
    if project_doc.get("npdi_baseline_locked"):
        frappe.throw("La Línea Base (Baseline) ya ha sido congelada previamente para este proyecto.")

    tasks = frappe.get_all("Task", filters={"project": project_name}, fields=["name", "npdi_cpm_early_start", "npdi_cpm_early_finish"])
    if not tasks:
        frappe.throw("No hay tareas calculadas en este proyecto para capturar el Baseline.")

    start_dates = []
    end_dates = []

    for t in tasks:
        es = t.get("npdi_cpm_early_start")
        ef = t.get("npdi_cpm_early_finish")
        if es and ef:
            start_dates.append(es)
            end_dates.append(ef)
            frappe.db.set_value("Task", t.name, {
                "npdi_baseline_start": es,
                "npdi_baseline_end": ef
            })

    if start_dates and end_dates:
        base_start = min(start_dates)
        base_end = max(end_dates)
        frappe.db.set_value("Project", project_name, {
            "npdi_baseline_start": base_start,
            "npdi_baseline_end": base_end,
            "npdi_baseline_locked": 1
        })
        return {"status": "success", "message": "Línea Base capturada exitosamente."}
    else:
        frappe.throw("Las tareas no tienen fechas tempranas calculadas por el motor CPM.")
