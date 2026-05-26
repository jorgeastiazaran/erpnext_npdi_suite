# Project Template Attribute Inheritance

Creating product development projects from scratch is time-consuming. The NPDI Suite streamlines this by allowing you to define standardized development lifecycles in project templates. When a project is generated, the custom app automatically copies advanced task attributes and dependency chains.

---

## 1. Defining Advanced Template Tasks

Standard ERPNext templates define basic task names. The NPDI Suite extends `Project Template Task` with advanced attributes:
- **Module/Phase:** Assign the task to a specific NPDI phase (e.g. Ideation, Formulation, Trial, Launch).
- **Duration (Hours):** Expected task execution duration.
- **Responsible Role:** Define standard roles (e.g., Lead Formulator, Sourcing Manager, QA Analyst) rather than specific users.
- **Predecessor Dependencies:** List tasks that must finish before this task can begin.

### Creating a Template:

1. Navigate to **Project Template** list and click **Add Project Template**.
2. Add template task rows.
3. For each task, click the **Edit** (row details) button to set the NPDI-specific fields (Module, Role, Duration, Predecessors).
4. Save the template.

---

## 2. Initiating a Project from a Template

When you create a new Project and select the template:

1. Navigate to **Project** and click **Add Project**.
2. Select the **Project Template** you defined.
3. Set the **Start Date** of the project.
4. Save the Project.

### How Attributes Propagate:

Upon saving, the NPDI Suite runs an interception hook that:
1. Generates the child **Project Tasks**.
2. Copies advanced metadata: maps the template task's **NPDI Module**, **Duration**, and **Responsible Role** directly to each `Task` record.
3. Establishes the **Dependency Chain**: links predecessor tasks automatically.
4. Triggers the **CPM Engine** to schedule start and finish dates starting from the project's start date.
