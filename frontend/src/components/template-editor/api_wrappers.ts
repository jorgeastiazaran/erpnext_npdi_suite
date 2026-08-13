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
