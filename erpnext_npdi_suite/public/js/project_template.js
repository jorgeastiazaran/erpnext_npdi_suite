frappe.ui.form.on('Project Template', {
    refresh: function(frm) {
        // Add a primary action button to open the React Dashboard with the template context
        frm.add_custom_button(__('Open NPDI Dashboard'), function() {
            frappe.set_route('npdi_project_dashboard', 'Project Template', frm.doc.name);
        }).addClass('btn-primary').css({'color': '#fff', 'background-color': '#2E7D32', 'border-color': '#2E7D32'});
    }
});
