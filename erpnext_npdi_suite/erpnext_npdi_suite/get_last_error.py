import frappe
def run():
    error = frappe.get_all("Error Log", fields=["error", "method"], order_by="creation desc", limit=1)
    if error:
        print(f"METHOD: {error[0].method}")
        print(error[0].error)
    else:
        print("No errors found")
