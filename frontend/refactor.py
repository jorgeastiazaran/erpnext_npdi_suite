import re
import os

filepath = "/Users/jorgeastiazaran/Library/CloudStorage/GoogleDrive-tecnofoodmx@gmail.com/My Drive/PycharmProjects/erpnext_v13_testing_local_instance/erpnext_npdi_suite/frontend/src/App.tsx"

with open(filepath, 'r') as f:
    content = f.read()

# 1. Add import
if "frappeClient" not in content:
    content = content.replace("import React, { useEffect, useState } from 'react'", "import React, { useEffect, useState } from 'react'\nimport { frappeClient } from './api/frappeClient'")

# 2. Remove @ts-ignore
content = re.sub(r'//\s*@ts-ignore\n', '', content)

# 3. Modify fetchTasks signature and abort controller
fetch_tasks_old = """  const fetchTasks = () => {"""
fetch_tasks_new = """  const fetchTasks = async (signal?: AbortSignal) => {"""
content = content.replace(fetch_tasks_old, fetch_tasks_new)

use_effect_old = """  useEffect(() => {
    fetchTasks();

    const handleRouteChange = () => {
      // Small timeout to allow Frappe routing to settle
      setTimeout(() => {
        setLoading(true);
        fetchTasks();
      }, 50);
    };"""

use_effect_new = """  useEffect(() => {
    const controller = new AbortController();
    fetchTasks(controller.signal);

    const handleRouteChange = () => {
      // Small timeout to allow Frappe routing to settle
      setTimeout(() => {
        setLoading(true);
        fetchTasks();
      }, 50);
    };"""
content = content.replace(use_effect_old, use_effect_new)

use_effect_cleanup_old = """    return () => {
      observer.disconnect();
      window.removeEventListener('npdi_route_changed', handleRouteChange);
      window.removeEventListener('popstate', handleRouteChange);
    };"""
use_effect_cleanup_new = """    return () => {
      controller.abort();
      observer.disconnect();
      window.removeEventListener('npdi_route_changed', handleRouteChange);
      window.removeEventListener('popstate', handleRouteChange);
    };"""
content = content.replace(use_effect_cleanup_old, use_effect_cleanup_new)

# Replacement 1: get_template_editor_data
old_1 = """      if (window.frappe) {
        frappe.call({
          method: "erpnext_npdi_suite.api.get_template_editor_data",
          args: { template: templateName },
          callback: function (r: any) {
            if (r.message && r.message.success) {
              setTemplateData(r.message.data.template);
              setTasks(r.message.data.tasks); // Hierarchical tasks
            } else {
              setError(r.message?.error || "Error cargando plantilla.");
            }
            setLoading(false);
          }
        });
      } else {"""
new_1 = """      try {
        const res: any = await frappeClient.call("erpnext_npdi_suite.api.get_template_editor_data", { template: templateName }, signal);
        if (res && res.success) {
          setTemplateData(res.data.template);
          setTasks(res.data.tasks);
        } else {
          setError(res?.error || "Error cargando plantilla.");
        }
      } catch (err: any) {
        if (err.name !== "AbortError") setError(err.message || "Error cargando plantilla.");
      } finally {
        setLoading(false);
      }
      if (false) {"""
content = content.replace(old_1, new_1)

# Replacement 2: get_project_gantt_data
old_2 = """    if (window.frappe) {
      frappe.call({
        method: "erpnext_npdi_suite.api.get_project_gantt_data",
        args: { project: projectName, template: templateName },
        callback: function (r: any) {
          if (r.message && r.message.success) {
            setAppMode('project');
            setTasks(r.message.tasks);
            setProjectMeta(r.message.project_meta || null);
          } else {
            setError(r.message?.error || "Error cargando tareas del servidor.");
          }
          setLoading(false);
        }
      });
    } else {"""
new_2 = """    try {
      const res: any = await frappeClient.call("erpnext_npdi_suite.api.get_project_gantt_data", { project: projectName, template: templateName }, signal);
      if (res && res.success) {
        setAppMode('project');
        setTasks(res.tasks);
        setProjectMeta(res.project_meta || null);
      } else {
        setError(res?.error || "Error cargando tareas del servidor.");
      }
    } catch (err: any) {
      if (err.name !== "AbortError") setError(err.message || "Error cargando tareas.");
    } finally {
      setLoading(false);
    }
    if (false) {"""
content = content.replace(old_2, new_2)

# Replacement 3: update_task_status
old_3 = """      if (window.frappe) {
        frappe.call({
          method: "erpnext_npdi_suite.api.update_task_status",
          args: { task_id: taskId, status: status },
          callback: function (r: any) {
            if (r.message && r.message.success) {
              fetchTasks();
            }
            resolve(r.message || { success: false });
          }
        });
      } else {"""
new_3 = """      frappeClient.call("erpnext_npdi_suite.api.update_task_status", { task_id: taskId, status: status })
        .then((res: any) => {
          if (res && res.success) fetchTasks();
          resolve(res || { success: false });
        }).catch(() => resolve({ success: false }));
      if (false) {"""
content = content.replace(old_3, new_3)

# Replacement 4: update_task_dates
old_4 = """      if (window.frappe) {
        frappe.call({
          method: "erpnext_npdi_suite.api.update_task_dates",
          args: { task_id: taskId, start: toISODateString(start), end: toISODateString(end) },
          callback: function (r: any) {
            if (r.message && r.message.success) {
              fetchTasks();
            } else {
              fetchTasks();
            }
            resolve(r.message || { success: false });
          }
        });
      } else {"""
new_4 = """      frappeClient.call("erpnext_npdi_suite.api.update_task_dates", { task_id: taskId, start: toISODateString(start), end: toISODateString(end) })
        .then((res: any) => {
          fetchTasks();
          resolve(res || { success: false });
        }).catch(() => { fetchTasks(); resolve({ success: false }); });
      if (false) {"""
content = content.replace(old_4, new_4)

# Replacement 5: update_project_task
old_5 = """      if (window.frappe) {
        frappe.call({
          method: "erpnext_npdi_suite.api.update_project_task",
          args: { task_id: taskId, task_data: data },
          callback: function (r: any) {
            if (r.message && r.message.success) {
              fetchTasks();
            } else {
              alert(r.message?.error || "Error al actualizar la tarea.");
            }
            resolve(r.message || { success: false });
          }
        });
      } else {"""
new_5 = """      frappeClient.call("erpnext_npdi_suite.api.update_project_task", { task_id: taskId, task_data: data })
        .then((res: any) => {
          if (res && res.success) fetchTasks();
          else alert(res?.error || "Error al actualizar la tarea.");
          resolve(res || { success: false });
        }).catch((err) => { alert(err.message); resolve({ success: false }); });
      if (false) {"""
content = content.replace(old_5, new_5)

# Replacement 6: recalculate_cpm
old_6 = """    if (window.frappe) {
      frappe.call({
        method: "erpnext_npdi_suite.api.recalculate_cpm",
        args: { project: proj },
        callback: function (r: any) {
          if (r.message && r.message.success) {
            frappe.show_alert({ message: r.message.message || "Ruta crítica recalculada.", indicator: "green" });
            fetchTasks();
          } else {
            alert(r.message?.error || "Error al recalcular la ruta crítica.");
            setLoading(false);
          }
        }
      });
    } else {"""
new_6 = """    try {
      const res: any = await frappeClient.call("erpnext_npdi_suite.api.recalculate_cpm", { project: proj });
      if (res && res.success) {
        window.frappe.show_alert({ message: res.message || "Ruta crítica recalculada.", indicator: "green" });
        fetchTasks();
      } else {
        alert(res?.error || "Error al recalcular.");
        setLoading(false);
      }
    } catch(err: any) {
      alert(err.message);
      setLoading(false);
    }
    if (false) {"""
content = content.replace(old_6, new_6)

# Replacement 7: delete_task
old_7 = """      if (window.frappe) {
        frappe.call({
          method: "erpnext_npdi_suite.api.delete_task",
          args: { task_id: taskId },
          callback: function (r: any) {
            if (r.message && r.message.success) {
              fetchTasks();
            } else {
              alert(r.message?.error || "Error al eliminar la tarea.");
            }
            resolve(r.message || { success: false });
          }
        });
      } else {"""
new_7 = """      frappeClient.call("erpnext_npdi_suite.api.delete_task", { task_id: taskId })
        .then((res: any) => {
          if (res && res.success) fetchTasks();
          else alert(res?.error || "Error al eliminar la tarea.");
          resolve(res || { success: false });
        }).catch((err) => { alert(err.message); resolve({ success: false }); });
      if (false) {"""
content = content.replace(old_7, new_7)

# Replacement 8: add_task_dependency
old_8 = """      if (window.frappe) {
        frappe.call({
          method: "erpnext_npdi_suite.api.add_task_dependency",
          args: { task_id: taskId, depends_on: dependsOnId },
          callback: function (r: any) {
            if (r.message && r.message.success) {
              fetchTasks();
            } else {
              alert(r.message?.error || "Error al agregar dependencia.");
            }
            resolve(r.message || { success: false });
          }
        });
      } else {"""
new_8 = """      frappeClient.call("erpnext_npdi_suite.api.add_task_dependency", { task_id: taskId, depends_on: dependsOnId })
        .then((res: any) => {
          if (res && res.success) fetchTasks();
          else alert(res?.error || "Error al agregar dependencia.");
          resolve(res || { success: false });
        }).catch((err) => { alert(err.message); resolve({ success: false }); });
      if (false) {"""
content = content.replace(old_8, new_8)

# Replacement 9: update_task_status (SkipTask)
old_9 = """      if (window.frappe) {
        frappe.call({
          method: "erpnext_npdi_suite.api.update_task_status",
          args: { task_id: taskId, status: isSkip ? 'Cancelled' : 'Open' },
          callback: function (r: any) {
            if (r.message && r.message.success) {
              fetchTasks();
            } else {
              alert(r.message?.error || "Error al actualizar la tarea.");
            }
            resolve(r.message || { success: false });
          }
        });
      } else {"""
new_9 = """      frappeClient.call("erpnext_npdi_suite.api.update_task_status", { task_id: taskId, status: isSkip ? 'Cancelled' : 'Open' })
        .then((res: any) => {
          if (res && res.success) fetchTasks();
          else alert(res?.error || "Error al actualizar.");
          resolve(res || { success: false });
        }).catch((err) => { alert(err.message); resolve({ success: false }); });
      if (false) {"""
content = content.replace(old_9, new_9)

# Replacement 10: capture_project_baseline
old_10 = """    if (window.frappe) {
      frappe.call({
        method: "erpnext_npdi_suite.api.capture_project_baseline",
        args: { project_name: projectMeta.name },
        callback: function (r: any) {
          if (r.message && r.message.success) {
            frappe.show_alert({ message: r.message.message || "Línea base capturada.", indicator: "green" });
            fetchTasks();
          } else {
            alert(r.message?.error || "Error al capturar línea base.");
            setLoading(false);
          }
        }
      });
    } else {"""
new_10 = """    try {
      const res: any = await frappeClient.call("erpnext_npdi_suite.api.capture_project_baseline", { project_name: projectMeta.name });
      if (res && res.success) {
        window.frappe.show_alert({ message: res.message || "Línea base capturada.", indicator: "green" });
        fetchTasks();
      } else {
        alert(res?.error || "Error al capturar línea base.");
        setLoading(false);
      }
    } catch(err: any) {
      alert(err.message);
      setLoading(false);
    }
    if (false) {"""
content = content.replace(old_10, new_10)

with open(filepath, 'w') as f:
    f.write(content)
