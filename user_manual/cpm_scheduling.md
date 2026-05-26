# Critical Path Method (CPM) Scheduling

The Critical Path Method (CPM) engine in the NPDI Suite is a scheduling algorithm that computes the earliest and latest possible dates for project tasks and identifies which tasks are critical to the overall launch deadline.

---

## 1. How CPM Scheduling Works

When CPM recalculation is triggered:
1. **Forward Pass:** The engine computes the **Early Start (ES)** and **Early Finish (EF)** dates for each task, moving chronologically from project start to end, respecting task dependencies.
2. **Backward Pass:** The engine moves backward from the final project deadline or last task's finish date, calculating the **Late Finish (LF)** and **Late Start (LS)** dates.
3. **Float Calculation:** The difference between early and late dates represents the **Total Float (TF)**, or slack time, available for each task:
   
   $$\text{Total Float} = \text{Late Start} - \text{Early Start}$$

---

## 2. Critical Tasks & Critical Path

A task is critical if it has no float (slack) time, meaning any delay in this task directly delays the final product launch. Critical tasks are marked with:

$$\text{npdi\_cpm\_is\_critical} = 1$$

In visualizations, critical tasks are highlighted in red to draw immediate attention.

> [!WARNING]
> **CPM Critical Threshold Behavior:**
> The current engine marks tasks as critical if they have a float value of **48 hours or less** (2 calendar days), rather than strictly zero slack. Parallel paths with up to 48 hours of float will be highlighted as critical in the Gantt dashboard.

---

## 3. Scheduling Constraint Modes

NPDI Suite supports several task scheduling modes that restrict how CPM moves dates:

1. **As Soon As Possible (ASAP):** The task is scheduled to start immediately after its predecessors finish (standard forward-pass date).
2. **Start No Earlier Than (SNET):** The task cannot start before a specified constraint date, regardless of when predecessors finish. This is useful for scheduling lab trials that require specific ingredient deliveries.
3. **Finish No Later Than (FNLT):** The task must finish by a specific date. If the CPM backward pass violates this date, it flags the project with negative float, indicating a schedule overrun.

---

## 4. Triggering Recalculation Manually

If Auto CPM is disabled in the settings, you can manually trigger calculation:
1. Open the target **Project** document.
2. Click the **Recalculate CPM Schedule** action button.
3. The engine parses the task dependencies, updates all start/finish dates on linked **Project Tasks**, and refreshes the Gantt chart.
