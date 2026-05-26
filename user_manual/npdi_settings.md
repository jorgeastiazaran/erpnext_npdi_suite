# NPDI Settings Configuration

The `NPDI Settings` Single DocType controls the global configurations and scheduling defaults for the Critical Path Method (CPM) engine and the NPDI Project Dashboard.

---

## 1. Accessing NPDI Settings

To configure the settings:
1. Search for **NPDI Settings** in the awesomebar.
2. Click on the settings document.

---

## 2. Configuration Fields

| Section | Field | Purpose |
| :--- | :--- | :--- |
| **Scheduler Settings** | **Enable Auto CPM Recalculation** | If checked, saving a Project Task automatically triggers the CPM engine to recalculate early/late dates and float across the entire project network. |
| | **Default Workday Hours** | Sets the standard daily working hours (e.g. 8.0 hours) for durational task conversions. |
| **Dashboard Settings** | **Default View** | Select the default view for the NPDI dashboard (Gantt, List, or Report). |
| | **Autorefresh Interval (sec)** | Defines the reload rate for task lists in the dashboard. |

---

## 3. Saving & Applying Settings

Click the **Save** button. If Auto CPM is enabled, all subsequent additions or modifications to Project Tasks will dynamically schedule critical paths.
