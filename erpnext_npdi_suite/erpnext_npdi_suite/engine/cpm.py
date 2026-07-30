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

        # Build ancestry map to detect parent-child cycles
        ancestry = {}
        def get_ancestors(t):
            if t in ancestry: return ancestry[t]
            p = self.tasks[t].get("parent_task")
            if not p:
                ancestry[t] = set()
            else:
                ancestry[t] = {p} | get_ancestors(p)
            return ancestry[t]
            
        for t in self.tasks:
            get_ancestors(t)

        for t_name, doc in self.tasks.items():
            # Construye la red desde la tabla hija nativa 'depends_on'
            if doc.get("depends_on"):
                for dep in doc.depends_on:
                    if dep.task:
                        # Ignorar dependencias entre un ancestro y su descendiente
                        if dep.task in ancestry.get(t_name, set()) or t_name in ancestry.get(dep.task, set()):
                            continue
                        self.predecessors[t_name].append(dep.task)
                        self.successors[dep.task].append(t_name)

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

        # Pasada hacia adelante iterativa (ES / EF)
        self._run_forward_pass()

        # Pasada hacia atrás iterativa (LS / LF)
        self._run_backward_pass()

        # Cálculo de holgura y ruta crítica
        for t in self.tasks:
            if t in self.ls and t in self.es:
                float_days = (self.ls[t] - self.es[t]).total_seconds() / (3600.0 * 24.0)
                self.float[t] = round(float_days, 2)
                self.is_critical[t] = self.float[t] <= 0.01
            else:
                self.float[t] = 0.0
                self.is_critical[t] = False



        # Persistencia masiva
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
                    ef_val = self.ef[task_name]
                    m_date = ef_val.date() if hasattr(ef_val, "date") else get_datetime(ef_val).date()
                    milestone_dates.append(m_date)

        if milestone_dates:
            latest_milestone_date = max(milestone_dates)
            frappe.db.set_value("Project", self.project_name, "expected_end_date", latest_milestone_date)
        else:
            # Fallback: if no milestones exist, the project ends when the absolute last task finishes
            if self.ef:
                ef_dates = [v.date() if hasattr(v, "date") else get_datetime(v).date() for v in self.ef.values()]
                absolute_latest_date = max(ef_dates)
                frappe.db.set_value("Project", self.project_name, "expected_end_date", absolute_latest_date)


    def _duration_hours(self, task_name):
        doc = self.tasks[task_name]
        if doc.get("npdi_cpm_manual_dates") and doc.get("npdi_manual_start") and doc.get("npdi_manual_end"):
            return (get_datetime(doc.npdi_manual_end) - get_datetime(doc.npdi_manual_start)).total_seconds() / 3600.0
        elif doc.get("duration"):
            return float(doc.duration) * 24.0
        else:
            return 24.0 # 1 día por defecto

    def _get_effective_predecessors(self, task_name):
        """Devuelve los predecesores directos y los predecesores de todos los grupos ancestros."""
        effective = set(self.predecessors.get(task_name, []))
        curr = self.tasks[task_name].get("parent_task")
        visited = {task_name}
        while curr and curr in self.tasks and curr not in visited:
            visited.add(curr)
            for p in self.predecessors.get(curr, []):
                if p not in visited and p != task_name:
                    effective.add(p)
            curr = self.tasks[curr].get("parent_task")
        return list(effective)

    def _get_effective_successors(self, task_name):
        """Devuelve los sucesores directos y los sucesores de todos los grupos ancestros."""
        effective = set(self.successors.get(task_name, []))
        curr = self.tasks[task_name].get("parent_task")
        visited = {task_name}
        while curr and curr in self.tasks and curr not in visited:
            visited.add(curr)
            for s in self.successors.get(curr, []):
                if s not in visited and s != task_name:
                    effective.add(s)
            curr = self.tasks[curr].get("parent_task")
        return list(effective)

    def _run_forward_pass(self):
        project_doc = frappe.get_doc("Project", self.project_name)
        project_start = get_datetime(project_doc.expected_start_date or now_datetime())

        # Initialize base values for all tasks
        for t, doc in self.tasks.items():
            if doc.get("status") == "Completed":
                self.es[t] = get_datetime(doc.exp_start_date or project_start)
                self.ef[t] = get_datetime(doc.completed_on or doc.exp_end_date or project_start)
            elif doc.get("npdi_cpm_manual_dates") and doc.get("npdi_manual_start"):
                self.es[t] = get_datetime(doc.npdi_manual_start)
                duration = self._duration_hours(t)
                self.ef[t] = add_to_date(self.es[t], hours=duration)
            else:
                self.es[t] = project_start
                duration = self._duration_hours(t)
                self.ef[t] = add_to_date(project_start, hours=duration)

        # Iterative relaxation (Bellman-Ford variant for forward pass)
        changed = True
        iterations = 0
        max_iterations = len(self.tasks) * 2 + 10

        while changed and iterations < max_iterations:
            changed = False
            iterations += 1

            for t, doc in self.tasks.items():
                if doc.get("status") == "Completed":
                    continue
                if doc.get("npdi_cpm_manual_dates") and doc.get("npdi_manual_start"):
                    continue

                eff_preds = self._get_effective_predecessors(t)
                pred_efs = [self.ef[p] for p in eff_preds if p in self.ef]
                max_pred_ef = max(pred_efs) if pred_efs else project_start

                if doc.get("is_group"):
                    children = self.children.get(t, [])
                    if children:
                        min_child_es = min([self.es[c] for c in children if c in self.es])
                        max_child_ef = max([self.ef[c] for c in children if c in self.ef])
                        new_es = max(max_pred_ef, min_child_es) if max_pred_ef else min_child_es
                        new_ef = max(max_pred_ef, max_child_ef) if max_pred_ef else max_child_ef
                    else:
                        new_es = max_pred_ef
                        new_ef = max_pred_ef
                else:
                    new_es = max_pred_ef
                    duration = self._duration_hours(t)
                    new_ef = add_to_date(new_es, hours=duration)

                if self.es.get(t) != new_es or self.ef.get(t) != new_ef:
                    self.es[t] = new_es
                    self.ef[t] = new_ef
                    changed = True

    def _run_backward_pass(self):

        project_start = get_datetime(frappe.get_doc("Project", self.project_name).expected_start_date or now_datetime())
        project_end = max([self.ef[t] for t in self.tasks if t in self.ef] or [project_start])
        self.project_end = project_end

        # Initialize base LF and LS for all tasks
        for t, doc in self.tasks.items():
            if doc.get("status") == "Completed":
                self.lf[t] = get_datetime(doc.completed_on or doc.exp_end_date or project_end)
                self.ls[t] = get_datetime(doc.exp_start_date or project_end)
            elif doc.get("npdi_cpm_manual_dates") and doc.get("npdi_manual_end"):
                self.lf[t] = get_datetime(doc.npdi_manual_end)
                duration = self._duration_hours(t)
                self.ls[t] = add_to_date(self.lf[t], hours=-duration)
            else:
                self.lf[t] = project_end
                duration = self._duration_hours(t)
                self.ls[t] = add_to_date(project_end, hours=-duration)

        # Iterative relaxation for backward pass
        changed = True
        iterations = 0
        max_iterations = len(self.tasks) * 2 + 10

        while changed and iterations < max_iterations:
            changed = False
            iterations += 1

            for t, doc in self.tasks.items():
                if doc.get("status") == "Completed":
                    continue

                eff_succs = self._get_effective_successors(t)
                valid_succ_lss = [self.ls[s] for s in eff_succs if s in self.ls]
                parent = self.tasks[t].get("parent_task")
                if parent and parent in self.lf:
                    valid_succ_lss.append(self.lf[parent])
                target_lf = min(valid_succ_lss) if valid_succ_lss else project_end


                if doc.get("is_group"):
                    children = self.children.get(t, [])
                    if children:
                        max_child_lf = max([self.lf[c] for c in children if c in self.lf])
                        min_child_ls = min([self.ls[c] for c in children if c in self.ls])
                        new_lf = min(target_lf, max_child_lf) if target_lf else max_child_lf
                        new_ls = min(target_lf, min_child_ls) if target_lf else min_child_ls
                    else:
                        new_lf = target_lf
                        new_ls = target_lf
                else:
                    new_lf = target_lf
                    duration = self._duration_hours(t)
                    new_ls = add_to_date(new_lf, hours=-duration)

                if self.lf.get(t) != new_lf or self.ls.get(t) != new_ls:
                    self.lf[t] = new_lf
                    self.ls[t] = new_ls
                    changed = True



def before_project_insert(doc, method):
    if doc.flags.bypass_npdi_project_validation: return
    """Gancho disparado antes de insertar un Proyecto para marcar la instanciación masiva."""
    frappe.local.is_instantiating_project = True


def task_before_validate(doc, method):
    if doc.flags.bypass_npdi_project_validation: return
    """Oculta temporalmente la fecha de fin para saltarse la validación estricta de Frappe."""
    if getattr(frappe.local, 'is_instantiating_project', False):
        if doc.parent_task and doc.exp_end_date:
            doc.custom_hidden_exp_end_date = doc.exp_end_date
            doc.exp_end_date = None


def task_before_save(doc, method):
    if doc.flags.bypass_npdi_project_validation: return
    """Restaura la fecha de fin oculta antes de guardar en la base de datos."""
    if getattr(frappe.local, 'is_instantiating_project', False):
        if hasattr(doc, 'custom_hidden_exp_end_date') and doc.custom_hidden_exp_end_date:
            doc.exp_end_date = doc.custom_hidden_exp_end_date


def on_task_update(doc, method):
    if doc.flags.bypass_npdi_project_validation: return
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
            
            # Sincroniza los valores calculados de vuelta a la instancia en memoria
            # para que la interfaz web (al hacer Guardar) se actualice sin requerir recargar la página
            if doc.name in engine.tasks:
                cpm_doc = engine.tasks[doc.name]
                doc.npdi_cpm_is_critical = cpm_doc.npdi_cpm_is_critical
                doc.npdi_cpm_total_float = cpm_doc.npdi_cpm_total_float
                doc.npdi_cpm_early_start = cpm_doc.npdi_cpm_early_start
                doc.npdi_cpm_early_finish = cpm_doc.npdi_cpm_early_finish
                doc.npdi_cpm_late_start = cpm_doc.npdi_cpm_late_start
                doc.npdi_cpm_late_finish = cpm_doc.npdi_cpm_late_finish
                
        except Exception as e:
            frappe.log_error(f"Error CPM en on_task_update: {str(e)}", "NPD CPM Error")
        finally:
            frappe.local.cpm_processing = False


def on_project_insert(doc, method):
    if doc.flags.bypass_npdi_project_validation: return
    """
    Hook fired when a Project is created from a Project Template.

    Responsibilities:
    1. [P1] Copy NPDI metadata (stage, module, role, etc.) from each Project Template Task
       row onto the newly-instantiated Task. Duration on the template row takes priority;
       falls back to the duration set on the linked Task record.
    2. [P2] Propagate inter-task dependency relationships stored on Project Template Task
       depends_on rows onto the corresponding project Tasks so the dependency graph is fully
       wired without needing pre-existing Task records.
    3. [P3] Use idx-based positional matching (primary) with subject-name fallback (secondary)
       to eliminate silent failures caused by duplicate task titles.
    4. Populate `subject` on all Task Depends On rows for UI display.
    5. Run the CPM engine once synchronously after all enrichment is complete.
    """
    if not getattr(frappe.local, 'is_instantiating_project', False):
        return

    if not doc.project_template:
        frappe.local.is_instantiating_project = False
        return

    # ── Load template tasks ordered by idx ──────────────────────────────────
    template_tasks = frappe.get_all(
        "Project Template Task",
        filters={"parent": doc.project_template},
        fields=[
            "name", "task", "idx",
            "npdi_stage_name", "npdi_module", "npdi_responsible_role",
            "npdi_requires_attachment", "npdi_launch_milestone", "duration"
        ],
        order_by="idx asc"
    )
    if not template_tasks:
        frappe.local.is_instantiating_project = False
        return

    # ── Load generated tasks ordered by creation (mirrors template insertion order) ──
    generated_tasks = frappe.get_all(
        "Task",
        filters={"project": doc.name},
        fields=["name", "subject", "creation"],
        order_by="creation asc"
    )
    if not generated_tasks:
        frappe.local.is_instantiating_project = False
        return

    # ── [P3] Build primary (idx-positional) and secondary (subject) maps ────
    # ERPNext inserts template tasks in idx order, so positional alignment is reliable.
    idx_to_generated = {}
    for position, gen_task in enumerate(generated_tasks):
        idx_to_generated[position] = gen_task.name

    subject_to_generated = {t.subject: t.name for t in generated_tasks}
    generated_name_to_subject = {t.name: t.subject for t in generated_tasks}

    # Also build a reverse map: template task record name → generated task name,
    # needed for P2 dependency propagation.
    tmpl_task_record_to_generated = {}

    # ── [P1 + P3] Enrich each generated task with NPDI metadata ─────────────
    for position, tmpl in enumerate(template_tasks):
        # Resolve the generated task: try positional match first, then subject fallback
        target_task_name = idx_to_generated.get(position)

        if not target_task_name:
            # Fallback: look up subject from the template task record
            tmpl_record_subject = frappe.db.get_value("Task", tmpl.task, "subject") if tmpl.task else None
            if tmpl_record_subject:
                target_task_name = subject_to_generated.get(tmpl_record_subject)

        if not target_task_name:
            continue

        # [P3] Track template task record → generated task for dependency mapping
        if tmpl.task:
            tmpl_task_record_to_generated[tmpl.task] = target_task_name
        # Also track by template row name for depends_on resolution
        tmpl_task_record_to_generated[tmpl.name] = target_task_name

        duration = tmpl.get("duration") or 0
        if not duration and tmpl.task:
            duration = frappe.db.get_value("Task", tmpl.task, "duration") or 0

        parent_task_gen = None
        if tmpl.task:
            tmpl_parent = frappe.db.get_value("Task", tmpl.task, "parent_task")
            if tmpl_parent and tmpl_parent in tmpl_task_record_to_generated:
                parent_task_gen = tmpl_task_record_to_generated[tmpl_parent]

        task_updates = {
            "duration": duration,
            "npdi_stage_name": tmpl.npdi_stage_name,
            "npdi_module": tmpl.npdi_module or "Core",
            "npdi_responsible_role": tmpl.npdi_responsible_role,
            "npdi_requires_attachment": int(tmpl.npdi_requires_attachment or 0),
            "npdi_launch_milestone": int(tmpl.npdi_launch_milestone or 0),
        }
        if parent_task_gen:
            task_updates["parent_task"] = parent_task_gen

        frappe.db.set_value("Task", target_task_name, task_updates)



    # ── [P2] Propagate dependency graph from Project Template custom tables ─
    template_name = doc.get("project_template")
    template_doc = frappe.get_doc("Project Template", template_name)

    # Dictionary to collect all dependencies (target_task_name -> set of depends_on_task_names)
    deps_to_append = {}
    def add_dep(target, depends_on):
        if target and depends_on and target != depends_on:
            if target not in deps_to_append:
                deps_to_append[target] = set()
            deps_to_append[target].add(depends_on)

    # 1. Process npdi_task_dependencies (Parent-Task-to-Parent-Task, Milestone-to-Task, etc.)
    if hasattr(template_doc, "npdi_task_dependencies"):
        for dep in template_doc.npdi_task_dependencies:
            target_generated_name = tmpl_task_record_to_generated.get(dep.task)
            depends_on_generated_name = tmpl_task_record_to_generated.get(dep.depends_on)
            add_dep(target_generated_name, depends_on_generated_name)

    # 2. Process npdi_stage_dependencies (Stage-to-Stage, Stage-to-Milestone)
    if hasattr(template_doc, "npdi_stage_dependencies"):
        for dep in template_doc.npdi_stage_dependencies:
            # Find all target generated tasks in the dependent stage
            target_tasks = []
            for tmpl in template_tasks:
                if tmpl.npdi_stage_name == dep.stage:
                    gen_name = tmpl_task_record_to_generated.get(tmpl.name)
                    if gen_name:
                        target_tasks.append(gen_name)
            
            # Find all upstream generated tasks it depends on
            upstream_tasks = []
            if dep.depends_on_row_name:
                # Stage depends on a specific task/milestone
                upstream = tmpl_task_record_to_generated.get(dep.depends_on_row_name)
                if upstream:
                    upstream_tasks.append(upstream)
            elif dep.depends_on_stage:
                # Stage depends on ALL tasks (or the milestone) of another stage
                # We will map it to ALL tasks of the upstream stage to ensure strict precedence
                for tmpl in template_tasks:
                    if tmpl.npdi_stage_name == dep.depends_on_stage:
                        gen_name = tmpl_task_record_to_generated.get(tmpl.name)
                        if gen_name:
                            upstream_tasks.append(gen_name)

            # Map them together
            for t_task in target_tasks:
                for u_task in upstream_tasks:
                    add_dep(t_task, u_task)

    # 3. Append to the actual instantiated Task documents
    for target_task_name, depends_on_set in deps_to_append.items():
        target_doc = frappe.get_doc("Task", target_task_name)
        existing_dep_ids = {d.task for d in (target_doc.depends_on or [])}
        
        added = False
        for dep_generated_name in depends_on_set:
            if dep_generated_name in existing_dep_ids:
                continue
            target_doc.append("depends_on", {
                "task": dep_generated_name,
                "subject": generated_name_to_subject.get(dep_generated_name, ""),
            })
            existing_dep_ids.add(dep_generated_name)
            added = True
            
        if added:
            target_doc.save(ignore_permissions=True)

    # ── Populate `subject` on all Task Depends On rows for UI display ────────
    dep_rows = frappe.db.sql("""
        SELECT tdo.name, tdo.task
        FROM `tabTask Depends On` tdo
        JOIN `tabTask` t ON t.name = tdo.parent
        WHERE t.project = %s AND (tdo.subject IS NULL OR tdo.subject = '')
          AND tdo.task IS NOT NULL AND tdo.task != ''
    """, (doc.name,), as_dict=True)
    for dep_row in dep_rows:
        dep_subject = (
            generated_name_to_subject.get(dep_row.task)
            or frappe.db.get_value("Task", dep_row.task, "subject")
        )
        if dep_subject:
            frappe.db.sql(
                "UPDATE `tabTask Depends On` SET subject = %s WHERE name = %s",
                (dep_subject, dep_row.name)
            )

    # ── Run CPM engine once synchronously after all enrichment is complete ───
    try:
        frappe.local.cpm_processing = True
        engine = CPMEngine(doc.name)
        engine.compute()
    except Exception as e:
        frappe.log_error(f"Error al calcular CPM al insertar proyecto: {str(e)}", "NPD CPM Error")
    finally:
        frappe.local.cpm_processing = False
        frappe.local.is_instantiating_project = False


def capture_project_baseline(project_name):
    """Método de lista blanca para congelar la fotografía de fechas planificadas (Baseline)."""
    project_doc = frappe.get_doc("Project", project_name)
    project_doc.check_permission("write")
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
