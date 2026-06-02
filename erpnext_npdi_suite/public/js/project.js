frappe.ui.form.on('Project', {
    refresh: function(frm) {
        // Add a primary action button to open the React Dashboard with the project context
        frm.add_custom_button(__('Open NPDI Dashboard'), function() {
            frappe.set_route('npdi_project_dashboard', 'Project', frm.doc.name);
        }).addClass('btn-primary').css({'color': '#fff', 'background-color': '#2E7D32', 'border-color': '#2E7D32'});

        // Add a button to manually force CPM recalculation
        frm.add_custom_button(__('Recalcular Ruta Crítica'), function() {
            frappe.call({
                method: "erpnext_npdi_suite.api.recalculate_cpm",
                args: { project: frm.doc.name },
                callback: function(r) {
                    if (r.message && r.message.success) {
                        frappe.show_alert({ message: r.message.message || "Ruta crítica recalculada.", indicator: "green" });
                        frm.reload_doc();
                    } else {
                        frappe.msgprint(r.message?.error || "Error al recalcular la ruta crítica.");
                    }
                }
            });
        }, __('Actions'));

        if (!frm.doc.npdi_baseline_locked) {
            frm.add_custom_button(__('Capture Baseline'), function() {
                frappe.confirm(
                    __('Are you sure you want to capture the current planned dates as the project baseline? This will lock the baseline.'),
                    function() {
                        frappe.call({
                            method: "erpnext_npdi_suite.api.capture_project_baseline",
                            args: { project_name: frm.doc.name },
                            callback: function(r) {
                                if (r.message && r.message.success) {
                                    frappe.show_alert({ message: r.message.message || "Línea base capturada.", indicator: "green" });
                                    frm.reload_doc();
                                } else {
                                    frappe.msgprint(r.message?.error || "Error al capturar línea base.");
                                }
                            }
                        });
                    }
                );
            }, __('Actions'));
        }
    }
});
