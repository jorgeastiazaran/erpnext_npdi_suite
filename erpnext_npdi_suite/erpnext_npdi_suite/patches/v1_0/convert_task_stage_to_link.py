import frappe
from erpnext_npdi_suite.erpnext_npdi_suite.setup.install import convert_task_stage_field_to_link

def execute():
    convert_task_stage_field_to_link()
