frappe.ui.form.on('Task', {
	onload: function(frm) {
		// Use window.npdi_subtask_inheritance to pre-populate custom/date fields and child tables
		if (frm.is_new() && window.npdi_subtask_inheritance) {
			const data = window.npdi_subtask_inheritance;
			
			// Set expected start date
			if (data.startDate) {
				frm.set_value('exp_start_date', data.startDate);
			}
			
			// Populate dependencies child table
			if (data.dependencies && data.dependencies.length > 0) {
				frm.clear_table('depends_on');
				data.dependencies.forEach(dep => {
					let row = frm.add_child('depends_on');
					row.task = dep;
				});
				frm.refresh_field('depends_on');
			}
			
			// Clear custom inheritance state to prevent leaking to other tasks
			window.npdi_subtask_inheritance = null;
		}
	}
});
