// Client script for NPDI Stage
frappe.ui.form.on('NPDI Stage', {
    refresh: function(frm) {
        if (!frm.is_new()) {
            frm.add_custom_button(__('Ver Árbol de Etapas'), function() {
                frappe.set_route('Tree', 'NPDI Stage');
            });
        }
    }
});
