import frappe
from frappe import _
from frappe.utils.nestedset import NestedSet

class NPDIStage(NestedSet):
    nsm_parent_field = "parent_npdi_stage"

    def autoname(self):
        if self.stage_name:
            self.name = self.stage_name.strip()

    def validate(self):
        if self.stage_name:
            self.stage_name = self.stage_name.strip()

        if self.parent_npdi_stage and self.parent_npdi_stage == self.name:
            frappe.throw(_("Una etapa no puede ser su propio padre."))

    def on_trash(self):
        super().on_trash()

@frappe.whitelist()
def get_children(doctype, parent=None, is_root=False):
    parent_field = "parent_npdi_stage"
    filters = [["docstatus", "<", "2"]]

    if is_root or not parent or parent == _("Todas las Etapas") or parent == "Todas las Etapas":
        filters.append([parent_field, "in", ["", None]])
    else:
        filters.append([parent_field, "=", parent])

    stages = frappe.get_all(
        "NPDI Stage",
        fields=["name as value", "is_group as expandable", "stage_name", "color", "stage_order", "disabled"],
        filters=filters,
        order_by="stage_order asc, name asc"
    )
    for s in stages:
        s["title"] = s.get("stage_name") or s.get("value")
    return stages

@frappe.whitelist()
def add_node():
    from frappe.desk.treeview import make_tree_args
    args = frappe.form_dict
    args = make_tree_args(**args)

    if args.get("is_root") or args.get("parent_npdi_stage") in ["Todas las Etapas", _("Todas las Etapas")]:
        args["parent_npdi_stage"] = None

    doc = frappe.get_doc(args)
    doc.insert()
    return doc.as_dict()
