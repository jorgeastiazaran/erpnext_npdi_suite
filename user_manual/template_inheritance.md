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

Creating a project from a template is now streamlined through the React-based NPDI Project Creation modal.

1. Navigate to the **NPDI Project Dashboard**.
2. Click **+ Nuevo Proyecto** in the upper right.
3. In the modal, specify the **Project Name** and select the **Project Template**.
4. Set the **Target Launch Date** (Fecha de Lanzamiento). The CPM engine will schedule tasks backward from this date.
5. **Role Assignment:** The modal automatically extracts all roles defined in the template tasks. You will be prompted to map a specific system user to each required role (e.g., assigning John Doe to "Lead Formulator").
6. Click **Confirmar y crear**.

### How Attributes Propagate:

Upon saving, the NPDI Suite runs an interception hook that:
1. Generates the child **Project Tasks**.
2. Copies advanced metadata: maps the template task's **NPDI Module** and **Duration** to each `Task` record.
3. **Task Ownership:** Maps your chosen user from the Role Assignment step directly into the native `task_owner` field of each corresponding task.
4. Establishes the **Dependency Chain**: links predecessor tasks automatically.
5. Triggers the **CPM Engine** to calculate the critical path and schedule dates.
