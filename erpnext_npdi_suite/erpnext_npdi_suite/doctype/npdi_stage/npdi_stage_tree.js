frappe.treeview_settings['NPDI Stage'] = {
    breadcrumb: 'NPDI Suite',
    title: __('Etapas NPDI'),
    get_tree_root: false,
    root_label: 'Todas las Etapas',
    get_tree_nodes: 'erpnext_npdi_suite.erpnext_npdi_suite.doctype.npdi_stage.npdi_stage.get_children',
    add_tree_node: 'erpnext_npdi_suite.erpnext_npdi_suite.doctype.npdi_stage.npdi_stage.add_node',
    fields: [
        {
            fieldtype: 'Data',
            fieldname: 'stage_name',
            label: __('Nombre de la Etapa'),
            reqd: true
        },
        {
            fieldtype: 'Check',
            fieldname: 'is_group',
            label: __('Es Grupo (Contenedor de sub-etapas)')
        },
        {
            fieldtype: 'Int',
            fieldname: 'stage_order',
            label: __('Orden de Secuencia')
        },
        {
            fieldtype: 'Color',
            fieldname: 'color',
            label: __('Color')
        },
        {
            fieldtype: 'Small Text',
            fieldname: 'description',
            label: __('Descripción')
        }
    ],
    ignore_fields: ['parent_npdi_stage']
};
