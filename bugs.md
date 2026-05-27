# Resolved Bugs: `erpnext_npdi_suite`

All bugs, architectural defects, and security flaws identified in the `erpnext_npdi_suite` codebase have been successfully resolved:

## 1. Security Authorization Bypass in Whitelisted API Endpoints — **[RESOLVED]**
* **File:** [api.py](file:///Users/jorgeastiazaran/Library/CloudStorage/GoogleDrive-tecnofoodmx@gmail.com/My%20Drive/PycharmProjects/erpnext_v13_testing_local_instance/erpnext_npdi_suite/erpnext_npdi_suite/api.py)
* **Description:** Whitelisted endpoints `update_task_status`, `update_task_dates`, and `add_task_dependency` executed document updates and called `task.save(ignore_permissions=True)` without checking if the calling user had write/edit permissions.
* **Fix Applied:** Added explicit `task.check_permission('write')` verification prior to updating or saving documents. Also caught `frappe.PermissionError` to return a clean `{"success": False, "error": "Not permitted"}` response to unauthorized clients.

## 2. Repeated Installation Execution on Database Migration — **[RESOLVED]**
* **File:** [hooks.py](file:///Users/jorgeastiazaran/Library/CloudStorage/GoogleDrive-tecnofoodmx@gmail.com/My%20Drive/PycharmProjects/erpnext_v13_testing_local_instance/erpnext_npdi_suite/erpnext_npdi_suite/hooks.py)
* **Description:** Both the `after_install` and `after_migrate` hooks pointed to `after_install` in `setup.py`, forcing custom field creation and property setter injection to execute repeatedly on every schema migration (`bench migrate`).
* **Fix Applied:** Removed the `after_migrate` hook registration. Custom fields and property setters are now created strictly once during the initial application installation.

## 3. Discrepancy in Critical Path Method (CPM) Engine Threshold — **[RESOLVED]**
* **File:** [cpm.py](file:///Users/jorgeastiazaran/Library/CloudStorage/GoogleDrive-tecnofoodmx@gmail.com/My%20Drive/PycharmProjects/erpnext_v13_testing_local_instance/erpnext_npdi_suite/erpnext_npdi_suite/erpnext_npdi_suite/engine/cpm.py#L122)
* **Description:** The CPM engine defined a task as critical if `self.float[t] <= 48.0` calendar hours. This conflicted with standard CPM definitions where only tasks with zero float are critical, and incorrectly flagged parallel paths with slack in Gantt views.
* **Fix Applied:** Updated the criticality threshold in the engine from `self.float[t] <= 48.0` to `self.float[t] <= 0.0` hours. Tasks with positive float slack are now correctly computed with `npdi_cpm_is_critical = 0`.

## 4. Duplicate Whitelisted Endpoint Registrations — **[RESOLVED]**
* **Files:** [api.py](file:///Users/jorgeastiazaran/Library/CloudStorage/GoogleDrive-tecnofoodmx@gmail.com/My%20Drive/PycharmProjects/erpnext_v13_testing_local_instance/erpnext_npdi_suite/erpnext_npdi_suite/api.py) and [cpm.py](file:///Users/jorgeastiazaran/Library/CloudStorage/GoogleDrive-tecnofoodmx@gmail.com/My%20Drive/PycharmProjects/erpnext_v13_testing_local_instance/erpnext_npdi_suite/erpnext_npdi_suite/erpnext_npdi_suite/engine/cpm.py#L384)
* **Description:** Both files registered a whitelisted endpoint named `capture_project_baseline`, causing route registration conflicts.
* **Fix Applied:** Removed the `@frappe.whitelist()` decorator from `capture_project_baseline` in `cpm.py`, converting it into a standard internal python helper function. The single entry point in `api.py` imports and exposes the endpoint to the client.

## 5. Baseline Capture Security Bypass — **[RESOLVED]**
* **File:** [cpm.py](file:///Users/jorgeastiazaran/Library/CloudStorage/GoogleDrive-tecnofoodmx@gmail.com/My%20Drive/PycharmProjects/erpnext_v13_testing_local_instance/erpnext_npdi_suite/erpnext_npdi_suite/erpnext_npdi_suite/engine/cpm.py#L387)
* **Description:** `capture_project_baseline` updated Task and Project fields in the database using `frappe.db.set_value` without validating whether the active session had write permissions on the Project.
* **Fix Applied:** Added `project_doc.check_permission("write")` inside `capture_project_baseline` prior to making database writes to ensure proper authorization.
Regarding the NPDI_suite I've reviewed the schema of the propject template tasks and I see that the information contained in the doctype is insufficient to properly (in a native way) create a new project with the expected structure (taks length, dependencies, module, etc) This makes me think that we've created a personalized functionality to enrich the project template tasks once a new project is instantiated, injectin all the needed parameters. The problem with this approach is that it'll make the project template incapable of creating new project templates which would fully function inside the npdi suite module (gantt graph, dependencies, etc.)


'id expect that the ERPNext projec template tasks doctype would contain all the fields needed to fully configure a new project template, including task length, dependencies, module, etc. 

Please review this issue and give me your findings and action plan.