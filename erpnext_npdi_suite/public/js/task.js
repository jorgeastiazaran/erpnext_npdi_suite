frappe.ui.form.on('Task', {
	setup: function(frm) {
		frm.set_query('npdi_stage_name', function() {
			return {
				filters: {
					'disabled': 0
				}
			};
		});
	},

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

		// Backfill subject for any existing depends_on rows that are missing it
		if (frm.doc.depends_on && frm.doc.depends_on.length > 0) {
			let needsRefresh = false;
			let pending = frm.doc.depends_on.filter(row => row.task && !row.subject);
			if (pending.length > 0) {
				pending.forEach(row => {
					frappe.db.get_value('Task', row.task, 'subject', (r) => {
						if (r && r.subject) {
							frappe.model.set_value(row.doctype, row.name, 'subject', r.subject);
						}
					});
				});
			}
		}
	},

	refresh: function(frm) {
		// Backfill subject for any depends_on rows missing it on each refresh
		if (frm.doc.depends_on && frm.doc.depends_on.length > 0) {
			frm.doc.depends_on.forEach(row => {
				if (row.task && !row.subject) {
					frappe.db.get_value('Task', row.task, 'subject', (r) => {
						if (r && r.subject) {
							frappe.model.set_value(row.doctype, row.name, 'subject', r.subject);
						}
					});
				}
			});
		}
	}
});

// Auto-fetch subject when a task is selected/changed in the depends_on table
frappe.ui.form.on('Task Depends On', {
	task: function(frm, cdt, cdn) {
		const row = locals[cdt][cdn];
		if (row.task) {
			frappe.db.get_value('Task', row.task, 'subject', (r) => {
				if (r && r.subject) {
					frappe.model.set_value(cdt, cdn, 'subject', r.subject);
				}
			});
		}
	}
});

