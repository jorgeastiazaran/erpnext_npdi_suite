# NPDI Project Dashboard Guide

The **NPDI Project Dashboard** is a unified, isolated workspace page built to manage and visualize product development projects. It provides a multi-view interface showing task hierarchies, critical paths, and execution status.

---

## 1. Accessing the Dashboard

To open the dashboard:
1. Search for **NPDI Project Dashboard** in the awesomebar or select it from the sidebar navigation.
2. Select the target **Project** you wish to view from the filter bar.

---

## 2. Interface Layout & Gantt Chart

Once loaded, the page displays a comprehensive Gantt chart:

![NPDI Project Dashboard Gantt View](images/npdi_gantt_dashboard.png)

### Key UI Sections:
- **Project Filter:** Toggle between active development projects.
- **Groupings by Module:** Tasks are grouped by their NPDI phase/module (e.g. Ideation, Formulation, Trial, Launch) rather than a simple chronological list.
- **Nested Task Nodes:** Expand or collapse sub-task trees to hide clutter.
- **Critical Path Highlight:** Critical tasks are highlighted in red, indicating that any delay will affect the project completion date.

---

## 3. Interactive Task Management

The dashboard is fully interactive. You can modify your schedule directly from this screen:

### Editing Task Schedules:
- **Drag-and-Drop:** Drag task bars in the Gantt chart to shift their start and finish dates.
- **Extend Duration:** Click and drag the edge of a task bar to extend or shorten its duration.

### Editing Dependencies & Status:
- **Establish Dependencies:** Draw connector lines between task bars to set predecessors.
- **Update Status:** Double-click a task node to open a quick-edit dialog. Here, you can:
  - Update status (Pending, In Progress, Completed).
  - Assign task owners.
  - View baseline variance metrics.

> [!NOTE]
> Modifying task dates or dependencies on the dashboard automatically triggers the background CPM engine to update predecessor dates and re-evaluate critical paths.
