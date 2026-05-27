import frappe
import json

def run():
    meta = frappe.get_meta("Task Depends On")
    subject_field = next(f for f in meta.fields if f.fieldname == "subject")
    print("Subject field properties:")
    print(json.dumps(subject_field.as_dict(), indent=2, default=str))
