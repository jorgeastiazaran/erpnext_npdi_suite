# ERPNext NPDI Suite Introduction

Welcome to the **New Product Development & Introduction (NPDI)** Suite user manual. This application is a native Frappe/ERPNext extension designed specifically for food, beverage, and process industries to manage the strategic lifecycle of new product launches.

NPDI is a cross-functional process spanning Ideation, Formulation, Pilot Trials, Quality Inspections, Sourcing, and Commercialization. Coordinating these phases requires precise task scheduling, dependency management, and real-time visualization of potential delays.

---

## 🚀 Key Features of NPDI Suite

The NPDI Suite enhances the standard ERPNext Projects module with several advanced operational and analytical tools:

1. **Critical Path Method (CPM) Scheduler:** An integrated engine that automatically calculates early and late schedule dates, identifies tasks with zero float, and highlights critical paths that could delay product launch.
2. **Template Attribute Inheritance:** Intercepts project generation to propagate advanced R&D metadata (Responsible Role, Target Module, Phase, Task Dependency networks) directly from templates to project tasks.
3. **Project Baselines & Deviation Auditing:** Captures snapshot records of project dates to compare the original plan against actual execution, enabling deep analysis of task slippage and delays.
4. **Unified NPDI Project Dashboard:** A custom Frappe page containing an interactive Gantt chart, list views, and collapsible task groups categorized by Module, providing a clean overview of the product development pipeline.

---

## 📂 Manual Structure

This manual guides you through configuring and utilizing the NPDI Suite features:
- [NPDI Settings](npdi_settings.md) — Global parameters and scheduler controls.
- [CPM Scheduling & Engine](cpm_scheduling.md) — Calculating dates, float, and critical paths.
- [Template Inheritance](template_inheritance.md) — Automating project creation with advanced metadata.
- [Deviation & Baselines](deviation_baselines.md) — Tracking slippage and comparing plans.
- [NPDI Project Dashboard](npdi_project_dashboard.md) — Visualizing and managing project tasks in real time.
