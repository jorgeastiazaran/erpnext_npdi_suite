import React, { useEffect, useState } from 'react'
import GanttView from './GanttView'
import './App.css'

function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const fetchTasks = () => {
    let projectName: string | null = null;
    let templateName: string | null = null;

    // @ts-ignore
    if (window.frappe && window.frappe.get_route) {
      // @ts-ignore
      const route = window.frappe.get_route();
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
      setTimeout(() => {
        setTasks([]);
        setLoading(false);
      }, 1000);
    }
  };

  useEffect(() => {
    fetchTasks();

    // Lógica para detectar y observar el tema activo de ERPNext / Frappe
    const checkTheme = () => {
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark' ||
                     document.documentElement.getAttribute('data-color-scheme') === 'dark' ||
                     document.documentElement.classList.contains('dark') ||
                     document.body.classList.contains('dark');
      setTheme(isDark ? 'dark' : 'light');
    };

    checkTheme();

    const observer = new MutationObserver(checkTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-color-scheme', 'class'] });
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });

    return () => observer.disconnect();
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
            if (r.message && r.message.success) {
              fetchTasks();
            }
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
            if (r.message && r.message.success) {
              fetchTasks();
            } else {
              fetchTasks();
            }
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
    <div className={`theme-${theme}`} style={{ padding: '20px', background: 'var(--bg)', color: 'var(--text)', minHeight: '100vh', transition: 'background 0.3s, color 0.3s' }}>
      <h2 style={{ marginBottom: '20px', color: 'var(--text-h)' }}>NPDI Project Timeline</h2>
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
