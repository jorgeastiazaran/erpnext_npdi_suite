frappe.pages['npdi_project_dashboard'].on_page_load = function(wrapper) {
    var page = frappe.ui.make_app_page({
        parent: wrapper,
        title: 'Dashboard Estratégico NPDI',
        single_column: true
    });

    // Inyecta el layout HTML compilado
    $(wrapper).find('.layout-main-section').html(frappe.render_template('npdi_project_dashboard', {}));

    // Estado local
    var current_project = null;
    var project_tasks = [];
    var gantt_instance = null;

    // Inicializa el selector de proyectos
    var project_selector = frappe.ui.form.make_control({
        parent: $(wrapper).find('#npdi-project-selector-container'),
        df: {
            fieldtype: 'Link',
            options: 'Project',
            fieldname: 'project',
            placeholder: 'Seleccionar Proyecto NPDI...',
            only_select: true,
            onchange: function() {
                current_project = this.get_value();
                if (current_project) {
                    load_project_dashboard(current_project);
                } else {
                    reset_dashboard_view();
                }
            }
        }
    });
    project_selector.refresh();

    // Eventos de botones
    $(wrapper).find('#btn-recalc-cpm').on('click', function() {
        if (!current_project) return;
        frappe.call({
            method: 'erpnext_npdi_suite.page.npdi_project_dashboard.npdi_project_dashboard.trigger_cpm_recalc',
            args: { project_name: current_project },
            callback: function(r) {
                if (!r.exc) {
                    frappe.show_alert({message: 'Ruta crítica recalculada exitosamente', indicator: 'green'});
                    load_project_dashboard(current_project);
                }
            }
        });
    });

    $(wrapper).find('#btn-capture-baseline').on('click', function() {
        if (!current_project) return;
        frappe.confirm('¿Estás seguro de congelar la Línea Base (Baseline) con las fechas proyectadas actuales?', function() {
            frappe.call({
                method: 'erpnext_npdi_suite.engine.cpm.capture_project_baseline',
                args: { project_name: current_project },
                callback: function(r) {
                    if (!r.exc) {
                        frappe.show_alert({message: 'Línea Base congelada', indicator: 'green'});
                        load_project_dashboard(current_project);
                    }
                }
            });
        });
    });

    // Renderizado de pestañas
    $(wrapper).find('button[data-bs-toggle="tab"]').on('shown.bs.tab', function(e) {
        if ($(e.target).attr('id') === 'gantt-tab' && current_project && project_tasks.length > 0) {
            render_gantt_chart();
        }
    });

    function load_project_dashboard(project_name) {
        frappe.call({
            method: 'erpnext_npdi_suite.page.npdi_project_dashboard.npdi_project_dashboard.get_project_data',
            args: { project_name: project_name },
            callback: function(r) {
                if (r.message) {
                    var data = r.message;
                    project_tasks = data.tasks || [];
                    update_executive_summary(data.project);
                    render_module_grid(project_tasks);
                    if ($(wrapper).find('#tab-gantt').hasClass('active')) {
                        render_gantt_chart();
                    }
                }
            }
        });
    }

    function update_executive_summary(project) {
        $(wrapper).find('#meta-start-date').text(project.expected_start_date || '-');
        $(wrapper).find('#meta-variant').text(project.npdi_project_variant || 'Estándar');
        
        var is_locked = project.npdi_baseline_locked;
        var status_badge = $(wrapper).find('#meta-baseline-status');
        if (is_locked) {
            status_badge.removeClass('bg-secondary').addClass('bg-success').text('Congelada (' + (project.npdi_baseline_start || '').split(' ')[0] + ')');
            $(wrapper).find('#btn-capture-baseline').prop('disabled', true);
        } else {
            status_badge.removeClass('bg-success').addClass('bg-secondary').text('Sin Capturar');
            $(wrapper).find('#btn-capture-baseline').prop('disabled', false);
        }

        // Calcula hito de lanzamiento desde la tarea marcada con launch_milestone
        var launch_task = project_tasks.find(t => t.npdi_launch_milestone);
        if (launch_task) {
            $(wrapper).find('#meta-launch-date').text((launch_task.npdi_cpm_early_finish || launch_task.exp_end_date || '-').split(' ')[0]);
        } else {
            $(wrapper).find('#meta-launch-date').text(project.expected_end_date || '-');
        }
    }

    function render_module_grid(tasks) {
        var container = $(wrapper).find('#npdi-modules-container');
        container.empty();

        // Agrupa por módulo
        var modules = ['Core', 'Formula', 'Pack', 'Brand'];
        var tasks_by_module = {};
        modules.forEach(m => tasks_by_module[m] = []);

        tasks.forEach(t => {
            var mod = t.npdi_module || 'Core';
            if (!tasks_by_module[mod]) tasks_by_module[mod] = [];
            tasks_by_module[mod].push(t);
        });

        // Construye el HTML particionado
        modules.forEach(m => {
            var mod_tasks = tasks_by_module[m];
            if (mod_tasks.length === 0) return;

            var mod_card = $('<div class="card mb-3 border shadow-xs"><div class="card-header bg-white fw-bold py-2 text-secondary">' +
                '<i class="octicon octicon-package me-2"></i> Módulo: ' + m + 
                '<span class="badge bg-light text-dark float-end">' + mod_tasks.length + ' tareas</span></div>' +
                '<div class="table-responsive"><table class="table table-hover table-sm mb-0 align-middle">' +
                '<thead><tr class="text-muted" style="font-size:0.75rem;">' +
                '<th style="width:40%;">Tarea</th><th>Etapa</th><th>Inicio Temprano</th><th>Fin Temprano</th><th>Holgura</th><th>Estado</th><th>Acciones</th>' +
                '</tr></thead><tbody></tbody></table></div></div>');

            var tbody = mod_card.find('tbody');

            // Ordena jerárquicamente simulando el árbol
            var root_tasks = mod_tasks.filter(t => !t.parent_task);
            var render_tree = function(task_node, level) {
                var indent = level * 20;
                var row_cls = task_node.npdi_cpm_is_critical ? 'table-warning' : '';
                var status_color = task_node.status === 'Completed' ? 'bg-success' : (task_node.status === 'Overdue' ? 'bg-danger' : 'bg-secondary');

                var tr = $('<tr class="' + row_cls + '" style="font-size:0.85rem;">' +
                    '<td style="padding-left:' + (indent + 8) + 'px;">' + 
                    (task_node.is_group ? '<i class="octicon octicon-file-directory me-1 text-muted"></i> ' : '') +
                    '<strong>' + task_node.subject + '</strong>' +
                    (task_node.npdi_requires_attachment ? ' <i class="octicon octicon-paperclip text-info" title="Requiere Evidencia"></i>' : '') +
                    '</td>' +
                    '<td><span class="text-muted">' + (task_node.npdi_stage_name || '-') + '</span></td>' +
                    '<td>' + (task_node.npdi_cpm_early_start || task_node.exp_start_date || '-').split(' ')[0] + '</td>' +
                    '<td>' + (task_node.npdi_cpm_early_finish || task_node.exp_end_date || '-').split(' ')[0] + '</td>' +
                    '<td>' + (task_node.npdi_cpm_total_float !== null ? task_node.npdi_cpm_total_float + 'h' : '-') + '</td>' +
                    '<td><span class="badge ' + status_color + '">' + task_node.status + '</span></td>' +
                    '<td><button class="btn btn-xs btn-light btn-open-task" data-task="' + task_node.name + '">Abrir</button></td>' +
                    '</tr>');

                tbody.append(tr);

                // Hijos
                var children = mod_tasks.filter(t => t.parent_task === task_node.name);
                children.forEach(c => render_tree(c, level + 1));
            };

            root_tasks.forEach(rt => render_tree(rt, 0));
            // Tareas huérfanas o sin raíz en este módulo
            mod_tasks.filter(t => t.parent_task && !mod_tasks.find(p => p.name === t.parent_task)).forEach(ot => render_tree(ot, 0));

            container.append(mod_card);
        });

        // Eventos de filas
        container.find('.btn-open-task').on('click', function() {
            frappe.set_route('Form', 'Task', $(this).attr('data-task'));
        });
    }

    function render_gantt_chart() {
        var gantt_area = $(wrapper).find('#frappe-gantt-render-area');
        gantt_area.empty();

        // Mapea a formato Frappe Gantt
        var gantt_tasks = project_tasks.map(t => {
            var start = t.npdi_cpm_early_start || t.exp_start_date || frappe.datetime.get_today();
            var end = t.npdi_cpm_early_finish || t.exp_end_date || frappe.datetime.add_days(start, 1);
            
            // Reconstruye string de dependencias para el SVG
            var deps = '';
            if (t.depends_on_tasks && t.depends_on_tasks.length > 0) {
                deps = t.depends_on_tasks.join(',');
            }

            // Clase personalizada por estado
            var custom_cls = t.npdi_cpm_is_critical ? 'gantt-critical' : 'gantt-normal';
            if (t.status === 'Completed') custom_cls += ' gantt-completed';

            return {
                id: t.name,
                name: t.subject,
                start: start,
                end: end,
                progress: t.status === 'Completed' ? 100 : (t.status === 'Working' ? 50 : 0),
                dependencies: deps,
                custom_class: custom_cls
            };
        });

        if (gantt_tasks.length === 0) return;

        // Requiere cargar la librería si no está disponible en la página base
        frappe.require('assets/frappe/js/lib/frappe-gantt/frappe-gantt.js', function() {
            gantt_instance = new Gantt('#frappe-gantt-render-area', gantt_tasks, {
                header_height: 50,
                column_width: 30,
                step: 24,
                view_modes: ['Quarter Day', 'Half Day', 'Day', 'Week', 'Month'],
                bar_height: 20,
                bar_corner_radius: 3,
                arrow_curve: 5,
                padding: 18,
                view_mode: 'Day',
                on_click: function (task) {
                    frappe.set_route('Form', 'Task', task.id);
                }
            });
        });
    }

    function reset_dashboard_view() {
        project_tasks = [];
        $(wrapper).find('#npdi-modules-container').html('<p class="text-muted text-center my-5 py-5">Selecciona un proyecto en la parte superior para cargar la estructura de tareas.</p>');
        $(wrapper).find('#meta-start-date, #meta-launch-date, #meta-variant').text('-');
        $(wrapper).find('#meta-baseline-status').removeClass('bg-success').addClass('bg-secondary').text('Sin Capturar');
        $(wrapper).find('#frappe-gantt-render-area').empty();
    }
};
