import frappe; def test():
    frappe.init(site="localhost")
    frappe.connect()
    doc = frappe.get_doc({"doctype": "Project Template", "name": "Template Test 123", "project_type": "Internal"})
    doc.insert(ignore_mandatory=True)
    print("SUCCESS:", doc.name)
    frappe.db.commit()
