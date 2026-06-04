frappe.listview_settings['Project'] = {
    onload: function(listview) {
        listview.page.add_inner_button(__('NPDI Dashboard'), function() {
            frappe.set_route('npdi_project_dashboard', 'Project');
        }).addClass('btn-primary').css({'color': '#fff', 'background-color': '#2E7D32', 'border-color': '#2E7D32'});
    }
};
