export const upsertTaskTemplate = async (data: any) => {
  return new Promise<any>((resolve) => {
    // @ts-ignore
    if (!window.frappe) return resolve({ success: false, error: "Frappe not found" });
    // @ts-ignore
    frappe.call({
      method: "erpnext_npdi_suite.api.upsert_template_task",
      args: { template: data.templateId, task_data: data },
      callback: (r: any) => resolve(r.message || {success: false})
    });
  });
};

export const deleteTaskTemplate = async (taskId: string, templateId: string) => {
  return new Promise<any>((resolve) => {
    // @ts-ignore
    if (!window.frappe) return resolve({ success: false, error: "Frappe not found" });
    // @ts-ignore
    frappe.call({
      method: "erpnext_npdi_suite.api.delete_template_task",
      args: { template: templateId, task_row_name: taskId },
      callback: (r: any) => resolve(r.message || {success: false})
    });
  });
};

export const addTemplateTaskDependency = async (taskId: string, depId: string, templateId: string) => {
  return new Promise<any>((resolve) => {
    // @ts-ignore
    if (!window.frappe) return resolve({ success: false, error: "Frappe not found" });
    // @ts-ignore
    frappe.call({
      method: "erpnext_npdi_suite.api.add_template_task_dependency",
      args: { task_row_name: taskId, depends_on_row_name: depId, template: templateId },
      callback: (r: any) => resolve(r.message || {success: false})
    });
  });
};

export const removeTemplateTaskDependency = async (depId: string, templateId: string, taskId?: string, depTaskId?: string) => {
  return new Promise<any>((resolve) => {
    // @ts-ignore
    if (!window.frappe) return resolve({ success: false, error: "Frappe not found" });
    // @ts-ignore
    frappe.call({
      method: "erpnext_npdi_suite.api.remove_template_task_dependency",
      args: {
        dep_row_name: depId,
        template: templateId,
        task_row_name: taskId,
        depends_on_row_name: depTaskId
      },
      callback: (r: any) => resolve(r.message || {success: false})
    });
  });
};

export const addStageTemplateDependency = async (templateId: string, stageName: string, depId: string) => {
  return new Promise<any>((resolve) => {
    // @ts-ignore
    if (!window.frappe) return resolve({ success: false, error: "Frappe not found" });
    // @ts-ignore
    frappe.call({
      method: "erpnext_npdi_suite.api.add_stage_template_dependency",
      args: { template: templateId, stage_name: stageName, depends_on_row_name: depId },
      callback: (r: any) => resolve(r.message || {success: false})
    });
  });
};

export const removeStageTemplateDependency = async (templateId: string, stageName: string, depId: string) => {
  return new Promise<any>((resolve) => {
    // @ts-ignore
    if (!window.frappe) return resolve({ success: false, error: "Frappe not found" });
    // @ts-ignore
    frappe.call({
      method: "erpnext_npdi_suite.api.remove_stage_template_dependency",
      args: { template: templateId, stage_name: stageName, depends_on_row_name: depId },
      callback: (r: any) => resolve(r.message || {success: false})
    });
  });
};

export const getNPDIStages = async () => {
  return new Promise<{ success: boolean; stages: Array<{ name: string; stage_name: string; is_group?: number; parent_npdi_stage?: string; color?: string; stage_order?: number }> }>((resolve) => {
    // @ts-ignore
    if (!window.frappe) {
      return resolve({
        success: true,
        stages: [
          { name: "1 – IDEA", stage_name: "1 – IDEA", color: "#4f8cff", stage_order: 10 },
          { name: "2 – CONCEPTO", stage_name: "2 – CONCEPTO", color: "#f59e0b", stage_order: 20 },
          { name: "3 – DESARROLLO", stage_name: "3 – DESARROLLO", color: "#22c55e", stage_order: 30 },
          { name: "4 – LANZAMIENTO", stage_name: "4 – LANZAMIENTO", color: "#a855f7", stage_order: 40 },
          { name: "5 – POST-LANZAMIENTO", stage_name: "5 – POST-LANZAMIENTO", color: "#14b8a6", stage_order: 50 },
        ]
      });
    }
    // @ts-ignore
    frappe.call({
      method: "erpnext_npdi_suite.api.get_npdi_stages",
      callback: (r: any) => resolve(r.message || { success: false, stages: [] })
    });
  });
};

