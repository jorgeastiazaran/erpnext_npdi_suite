import React, { useEffect, useState } from 'react'
import GanttView from './GanttView'
import './App.css'

function App() {
  const [tasks, setTasks] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  useEffect(() => {
    let projectName: string | null = null;
    let templateName: string | null = null;

    // Call Frappe API to fetch tasks
    // @ts-ignore
    if (window.frappe && window.frappe.get_route) {
      // @ts-ignore
      const route = window.frappe.get_route();
      // route is typically ["npdi_project_dashboard", "Project", "PROJ-0001"]
      if (route.length >= 3) {
        if (route[1] === "Project") projectName = route[2];
        else if (route[1] === "Project Template") templateName = route[2];
      }
    }
    
    if (!projectName && !templateName) {
      setError("No se ha proporcionado un Proyecto o Plantilla válido. Usa el botón 'Open NPDI Dashboard' desde el registro del proyecto.");
      setLoading(false);
      return;
    }

    // Call Frappe API to fetch tasks
    // @ts-ignore
    if (window.frappe) {
      // @ts-ignore
      frappe.call({
        method: "erpnext_npdi_suite.api.get_project_gantt_data",
        args: { project: projectName, template: templateName },
        callback: function(r: any) {
          if (r.message && r.message.success) {
            setTasks(r.message.tasks);
          } else {
            setError(r.message?.error || "Error cargando tareas del servidor.");
          }
          setLoading(false);
        }
      });
    } else {
      // Mock data for local testing outside Frappe
      setTimeout(() => {
        setTasks([]);
        setLoading(false);
      }, 1000);
    }
  }, []);

  if (loading) return <div style={{ padding: '40px', textAlign: 'center' }}>Cargando Cronograma...</div>;
  if (error) return <div style={{ padding: '40px', textAlign: 'center', color: 'red' }}>{error}</div>;

  const handleTaskClick = (taskId: string) => {
    // Open the standard Frappe Task form in a new tab
    const origin = window.location.origin;
    window.open(`${origin}/app/task/${taskId}`, '_blank');
  };

  const handleStatusChange = async (taskId: string, status: string) => {
    return new Promise((resolve) => {
      // @ts-ignore
      if (window.frappe) {
        // @ts-ignore
        frappe.call({
          method: "erpnext_npdi_suite.api.update_task_status",
          args: { task_id: taskId, status: status },
          callback: function(r: any) {
            resolve(r.message || {success: false});
          }
        });
      } else {
        resolve({success: true});
      }
    });
  };

  const handleDateChange = async (taskId: string, start: Date, end: Date) => {
    return new Promise((resolve) => {
      // @ts-ignore
      if (window.frappe) {
        // @ts-ignore
        frappe.call({
          method: "erpnext_npdi_suite.api.update_task_dates",
          args: { task_id: taskId, start: start.toISOString(), end: end.toISOString() },
          callback: function(r: any) {
            resolve(r.message || {success: false});
          }
        });
      } else {
        resolve({success: true});
      }
    });
  };

  const handleAddQuickTask = (stageName: string, parentTaskId: string | null) => {
    // @ts-ignore
    if (window.frappe) {
      // Open standard quick entry or new form for Task
      // @ts-ignore
      frappe.new_doc('Task', {
        project: new URLSearchParams(window.location.search).get('project') || window.frappe.get_route()[2],
        npdi_stage_name: stageName,
        parent_task: parentTaskId
      });
    }
  };

  return (
    <div style={{ padding: '20px' }}>
      <h2 style={{ marginBottom: '20px' }}>NPDI Project Timeline</h2>
      <GanttView 
        tasks={tasks} 
        onTaskClick={handleTaskClick}
        onStatusChange={handleStatusChange}
        onDateChange={handleDateChange}
        onAddQuickTask={handleAddQuickTask}
      />
    </div>
  )
}

export default App
