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
        self.project_end = None

    def load_tasks(self):
        """Carga las tareas del proyecto y mapea la red topológica y la jerarquía de grupos."""
        task_records = frappe.get_all("Task", filters={"project": self.project_name}, fields=["name", "subject", "duration", "exp_start_date", "exp_end_date", "is_group", "parent_task"])
        self.children = {}
        for t in task_records:
            doc = frappe.get_doc("Task", t.name)
            self.tasks[t.name] = doc
            
            # Construye jerarquía de padres/hijos
            if doc.parent_task:
                self.children.setdefault(doc.parent_task, []).append(t.name)
                
            # Construye la red desde la tabla hija nativa 'depends_on'
            if doc.get("depends_on"):
                for dep in doc.depends_on:
                    if dep.task:
                        self.predecessors[t.name].append(dep.task)
                        self.successors[dep.task].append(t.name)

    def resolve_group_statuses(self):
        """Resuelve recursivamente el estatus de las tareas grupo basándose en sus hijos."""
        groups = [t for t, doc in self.tasks.items() if doc.is_group]
        evaluated = {}

        def evaluate_group(group_name):
            if group_name in evaluated:
                return evaluated[group_name]
            
            children = self.children.get(group_name, [])
            if not children:
                evaluated[group_name] = self.tasks[group_name].status
                return evaluated[group_name]
            
            children_statuses = []
            children_completed_ons = []
            for child in children:
                child_doc = self.tasks[child]
                if child_doc.is_group:
                    status = evaluate_group(child)
                else:
                    status = child_doc.status
                children_statuses.append(status)
                if status == 'Completed' and child_doc.completed_on:
                    children_completed_ons.append(get_datetime(child_doc.completed_on))
            
            group_doc = self.tasks[group_name]
            if children_statuses and all(s == 'Completed' for s in children_statuses):
                if group_doc.status != 'Completed':
                    group_doc.status = 'Completed'
                    if children_completed_ons:
                        group_doc.completed_on = max(children_completed_ons).date()
                    else:
                        group_doc.completed_on = frappe.utils.nowdate()
                evaluated[group_name] = 'Completed'
            else:
                if group_doc.status == 'Completed':
                    group_doc.status = 'Working'
                    group_doc.completed_on = None
                evaluated[group_name] = group_doc.status
                
            return evaluated[group_name]

        for g in groups:
            evaluate_group(g)

    def compute(self):
        """Ejecuta las pasadas hacia adelante y hacia atrás, respetando fechas manuales."""
        self.load_tasks()
        if not self.tasks:
            return

        # Resolver los estatus de los grupos basándose en sus hijos
        self.resolve_group_statuses()

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
        self.project_end = max_ef
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
                self.is_critical[t] = self.float[t] <= 48.0
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
                
                # Actualiza campos en bloque
                db_updates = {
                    "npdi_cpm_early_start": es_val,
                    "npdi_cpm_early_finish": ef_val,
                    "npdi_cpm_late_start": ls_val,
                    "npdi_cpm_late_finish": lf_val,
                    "npdi_cpm_total_float": self.float[task_name],
                    "npdi_cpm_is_critical": 1 if self.is_critical[task_name] else 0,
                    # Actualiza fechas nativas para alinear el diagrama SVG estándar
                    "exp_start_date": es_val.date(),
                    "exp_end_date": ef_val.date()
                }

                if doc.is_group:
                    db_updates["status"] = doc.status
                    db_updates["completed_on"] = doc.completed_on

                doc.db_set(db_updates)

        # Update parent Project expected_end_date from the latest stage-gate milestone
        milestone_dates = []
        for task_name, doc in self.tasks.items():
            if task_name in self.ef:
                subject = (doc.get("subject") or "").lower()
                if (doc.get("is_milestone") == 1 or 
                    doc.get("npdi_launch_milestone") == 1 or 
                    "stage-gate" in subject):
                    milestone_dates.append(self.ef[task_name].date())

        if milestone_dates:
            latest_milestone_date = max(milestone_dates)
            frappe.db.set_value("Project", self.project_name, "expected_end_date", latest_milestone_date)

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
        
        # Si la tarea está Completada, fijar sus fechas al estado actual guardado
        # Esto evita inconsistencias si se reabre un predecesor
        if doc.get("status") == "Completed":
            self.es[task_name] = get_datetime(doc.exp_start_date or now_datetime())
            self.ef[task_name] = get_datetime(doc.completed_on or doc.exp_end_date or now_datetime())
            for succ in self.successors.get(task_name, []):
                self._forward_pass(succ)
            return
        
        # Rollup para tareas padre
        if doc.get("is_group"):
            children = self.children.get(task_name, [])
            if children:
                for child in children:
                    self._forward_pass(child)
                valid_es = [self.es[c] for c in children if c in self.es]
                valid_ef = [self.ef[c] for c in children if c in self.ef]
                self.es[task_name] = min(valid_es) if valid_es else now_datetime()
                self.ef[task_name] = max(valid_ef) if valid_ef else self.es[task_name]
            else:
                self.es[task_name] = get_datetime(frappe.get_doc("Project", self.project_name).expected_start_date or now_datetime())
                self.ef[task_name] = self.es[task_name]
                
            for succ in self.successors.get(task_name, []):
                self._forward_pass(succ)
            return

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

        if doc.get("status") == "Completed" and doc.get("completed_on"):
            self.ef[task_name] = get_datetime(doc.completed_on)
        else:
            duration = self._duration_hours(task_name)
            self.ef[task_name] = add_to_date(self.es[task_name], hours=duration)

        for succ in self.successors.get(task_name, []):
            self._forward_pass(succ)

    def _backward_pass(self, task_name, visited):
        if task_name in visited:
            return
        visited.add(task_name)
        
        doc = self.tasks[task_name]
        if doc.get("is_group"):
            children = self.children.get(task_name, [])
            for child in children:
                self._backward_pass(child, visited)
            if children:
                valid_lss = [self.ls[c] for c in children if c in self.ls]
                valid_lfs = [self.lf[c] for c in children if c in self.lf]
                self.ls[task_name] = min(valid_lss) if valid_lss else self.es[task_name]
                self.lf[task_name] = max(valid_lfs) if valid_lfs else self.ef[task_name]
            else:
                self.ls[task_name] = self.es[task_name]
                self.lf[task_name] = self.ef[task_name]
            return

        successors = self.successors.get(task_name, [])
        for s in successors:
            self._backward_pass(s, visited)

        if successors:
            valid_lss = [self.ls[s] for s in successors if s in self.ls]
            if valid_lss:
                self.lf[task_name] = min(valid_lss)
                self.ls[task_name] = add_to_date(self.lf[task_name], hours=-self._duration_hours(task_name))

        if task_name not in self.lf:
            self.lf[task_name] = self.project_end
            self.ls[task_name] = add_to_date(self.lf[task_name], hours=-self._duration_hours(task_name))
        
        doc = self.tasks[task_name]
        if doc.get("npdi_cpm_manual_dates") and doc.get("npdi_manual_end"):
            manual_lf = get_datetime(doc.npdi_manual_end)
            if task_name in self.lf and manual_lf < self.lf[task_name]:
                self.lf[task_name] = manual_lf
                self.ls[task_name] = add_to_date(manual_lf, hours=-self._duration_hours(task_name))

        for p in self.predecessors.get(task_name, []):
            self._backward_pass(p, visited)


def before_project_insert(doc, method):
    """Gancho disparado antes de insertar un Proyecto para marcar la instanciación masiva."""
    frappe.local.is_instantiating_project = True


def task_before_validate(doc, method):
    """Oculta temporalmente la fecha de fin para saltarse la validación estricta de Frappe."""
    if getattr(frappe.local, 'is_instantiating_project', False):
        if doc.parent_task and doc.exp_end_date:
            doc.custom_hidden_exp_end_date = doc.exp_end_date
            doc.exp_end_date = None


def task_before_save(doc, method):
    """Restaura la fecha de fin oculta antes de guardar en la base de datos."""
    if getattr(frappe.local, 'is_instantiating_project', False):
        if hasattr(doc, 'custom_hidden_exp_end_date') and doc.custom_hidden_exp_end_date:
            doc.exp_end_date = doc.custom_hidden_exp_end_date


def on_task_update(doc, method):
    """Gancho disparado al actualizar una tarea para propagar fechas en todo el proyecto."""
    if doc.project:
        # Si estamos en medio de la instanciación de un proyecto desde plantilla, ignoramos esto por completo
        # para evitar 60 recálculos CPM síncronos que provocan un bloqueo o timeout en la interfaz
        if getattr(frappe.local, 'is_instantiating_project', False):
            return

        # Desacoplamiento para prevenir recursividad cuando CPM llama a db_set
        if getattr(frappe.local, 'cpm_processing', False):
            return
            
        frappe.local.cpm_processing = True
        try:
            engine = CPMEngine(doc.project)
            engine.compute()
        except Exception as e:
            frappe.log_error(f"Error CPM en on_task_update: {str(e)}", "NPD CPM Error")
        finally:
            frappe.local.cpm_processing = False


def on_project_insert(doc, method):
    """Gancho disparado al instanciar un Proyecto para heredar atributos custom desde Project Template Task."""
    if not getattr(frappe.local, 'is_instantiating_project', False):
        return

    if not doc.project_template:
        frappe.local.is_instantiating_project = False
        return
        
    template_tasks = frappe.get_all("Project Template Task", filters={"parent": doc.project_template}, fields=["task", "npdi_stage_name", "npdi_module", "npdi_responsible_role", "npdi_requires_attachment", "npdi_launch_milestone"])
    if not template_tasks:
        return

    # Mapea las tareas generadas en el proyecto actual por título
    generated_tasks = frappe.get_all("Task", filters={"project": doc.name}, fields=["name", "subject"])
    task_map = {t.subject: t.name for t in generated_tasks}

    for tmpl in template_tasks:
        tmpl_data = frappe.db.get_value("Task", tmpl.task, ["subject", "duration"], as_dict=True)
        if not tmpl_data:
            continue
        tmpl_subject = tmpl_data.subject
        duration = tmpl_data.duration or 0
        target_task_name = task_map.get(tmpl_subject)
        if target_task_name:
            frappe.db.set_value("Task", target_task_name, {
                "duration": duration,
                "npdi_stage_name": tmpl.npdi_stage_name,
                "npdi_module": tmpl.npdi_module or "Core",
                "npdi_responsible_role": tmpl.npdi_responsible_role,
                "npdi_requires_attachment": tmpl.npdi_requires_attachment,
                "npdi_launch_milestone": tmpl.npdi_launch_milestone
            })

    # Como hemos bloqueado on_task_update durante la instanciación, ejecutamos el motor CPM sincronamente AHORA
    # Esto ocurre una sola vez, y es extremadamente rápido, por lo que no bloqueará la UI
    try:
        frappe.local.cpm_processing = True
        engine = CPMEngine(doc.name)
        engine.compute()
    except Exception as e:
        frappe.log_error(f"Error al calcular CPM al insertar proyecto: {str(e)}", "NPD CPM Error")
    finally:
        frappe.local.cpm_processing = False
        frappe.local.is_instantiating_project = False


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
