# Project Baselines & Deviation Auditing

During the product development lifecycle, unexpected setbacks (e.g. pilot batch failures, supplier delays) can shift task schedules. To track these changes and audit process efficiency, NPDI Suite includes a **Project Baseline** feature.

---

## 1. Capturing a Project Baseline

A **Baseline** is an immutable snapshot of your project's planned start and finish dates. 

### Step-by-Step Instructions:

1. Open the target **Project** document once the initial schedule is finalized and agreed upon.
2. Click the **Capture Baseline** action button in the header.
3. The system:
   - Records the current CPM schedule dates into dedicated baseline fields (`npdi_baseline_start_date` and `npdi_baseline_end_date`) on every linked Project Task.
   - Saves a global project baseline timestamp.

> [!IMPORTANT]
> Once a baseline is captured, the baseline date fields remain locked. Any subsequent changes to active task dates (via manual edits or CPM recalculation) will not overwrite the baseline, establishing a permanent reference point.

---

## 2. Auditing Deviations & Slippage

As tasks progress and dates shift, the system calculates slippage.

### Slippage Math:

For each task, the system evaluates:

$$\text{Start Variance} = \text{Actual/Current Start Date} - \text{Baseline Start Date}$$

$$\text{End Variance} = \text{Actual/Current End Date} - \text{Baseline End Date}$$

- A **positive variance** indicates the task started or finished late (slippage).
- A **negative variance** indicates the task was completed ahead of schedule.

### Monitoring Slippage:

1. Check the **Slippage Report** in the Projects module to view variances aggregated by Module or Phase.
2. The **NPDI Project Dashboard** visually demonstrates baseline offsets, displaying a shadow bar representing the baseline dates underneath the active Gantt bars.
