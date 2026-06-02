# Auto-Adjust Parent Task Dates

This plan describes the approach to implement dynamic parent task date adjustment in ERPNext, allowing parent tasks to automatically adapt their Start and End dates to wrap around their children's dates, which mimics the behavior in your reference application.

## Open Questions

None at the moment.

## Proposed Changes

We will implement this seamlessly at the Frappe database level using Document Hooks. This ensures the behavior is consistent whether you change dates in the React Gantt View, the standard ERPNext List View, or the standard Task form.

### erpnext_npdi_suite/hooks.py
We will add a `before_validate` document hook for the `Task` doctype. Frappe normally runs standard validations (which block child dates from exceeding parent dates) during the `validate` event. By hooking into `before_validate`, we can "catch" the child's new dates, calculate the required boundaries, and dynamically extend the parent task(s) BEFORE ERPNext's standard validation runs. 

### erpnext_npdi_suite/erpnext_npdi_suite/custom/task.py [NEW]
We will create a new Python module to house our task hooks.
The function `auto_adjust_parent_dates(doc, method)` will:
1. Check if the task has a `parent_task`.
2. If it does, load the parent task.
3. Compare the current task's `exp_start_date` and `exp_end_date` against all sibling tasks (other children of the same parent) to find the absolute minimum start date and maximum end date.
4. If the parent's dates are narrower than these calculated boundaries, update the parent's dates.
5. Recursively invoke a save on the parent (using `ignore_permissions=True` and bypassing standard validations on the upward cascade if needed, though recursive `save()` will naturally cascade the adjustment up to the root project task).
6. Once the parent(s) are expanded, the current task's `before_validate` completes, and ERPNext's standard `validate` will see that the parent is now large enough to accommodate the child, completely avoiding the `frappe.ValidationError` you experienced.

## Verification Plan
1. Attempt to extend a child task's duration via the Gantt View. It should successfully save and visibly extend the parent task.
2. Open a child task in the standard ERPNext UI, change the Expected End Date to exceed the parent, and hit Save. It should save successfully and automatically update the parent's Expected End Date.
