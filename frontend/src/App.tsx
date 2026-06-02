import React, { useEffect, useState } from 'react'
import TemplateEditorView from './components/template-editor/TemplateEditorView'
import GanttView from './GanttView'
import ListView from './ListView'
import { Calendar, List } from 'lucide-react'
import './App.css'
import { toISODateString } from './dateUtils'

function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [tasks, setTasks] = useState<any[]>([]);
  const [projectMeta, setProjectMeta] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isTemplateMode, setIsTemplateMode] = useState(false);
  const [templateData, setTemplateData] = useState<any>(null);
  const [activeView, setActiveView] = useState<'gantt' | 'list'>('gantt');

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

    if (templateName) {
      setIsTemplateMode(true);
      // @ts-ignore
      if (window.frappe) {
        // @ts-ignore
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
      } else {
        setLoading(false);
      }
      return;
    }

    // @ts-ignore
    if (window.frappe) {
      // @ts-ignore
      frappe.call({
        method: "erpnext_npdi_suite.api.get_project_gantt_data",
        args: { project: projectName, template: templateName },
        callback: function (r: any) {
          if (r.message && r.message.success) {
            setTasks(r.message.tasks);
            setProjectMeta(r.message.project_meta || null);
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
          callback: function (r: any) {
            if (r.message && r.message.success) {
              fetchTasks();
            }
            resolve(r.message || { success: false });
          }
        });
      } else {
        resolve({ success: true });
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
      } else {
        resolve({ success: true });
      }
    });
  };

  const handleUpdateTask = async (taskId: string, data: any) => {
    return new Promise((resolve) => {
      // @ts-ignore
      if (window.frappe) {
        // @ts-ignore
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
      } else {
        resolve({ success: true });
      }
    });
  };

  const handleRecalculateCpm = async () => {
    const proj = new URLSearchParams(window.location.search).get('project') || window.frappe?.get_route()[2];
    if (!proj) return;
    setLoading(true);
    // @ts-ignore
    if (window.frappe) {
      // @ts-ignore
      frappe.call({
        method: "erpnext_npdi_suite.api.recalculate_cpm",
        args: { project: proj },
        callback: function (r: any) {
          if (r.message && r.message.success) {
            // @ts-ignore
            frappe.show_alert({ message: r.message.message || "Ruta crítica recalculada.", indicator: "green" });
            fetchTasks();
          } else {
            alert(r.message?.error || "Error al recalcular la ruta crítica.");
            setLoading(false);
          }
        }
      });
    } else {
      setTimeout(() => setLoading(false), 500);
    }
  };

  const handleAddQuickTask = (
    stageName: string,
    parentTaskId: string | null,
    inheritedData?: {
      dependencies?: string[];
      startDate?: string;
      npdiModule?: string;
    }
  ) => {
    // @ts-ignore
    if (window.frappe) {
      if (inheritedData) {
        // @ts-ignore
        window.npdi_subtask_inheritance = {
          startDate: inheritedData.startDate,
          dependencies: inheritedData.dependencies
        };
      }

      const docAttrs: any = {
        project: new URLSearchParams(window.location.search).get('project') || window.frappe.get_route()[2],
        npdi_stage_name: stageName,
        parent_task: parentTaskId
      };

      if (inheritedData && inheritedData.npdiModule) {
        docAttrs.npdi_module = inheritedData.npdiModule;
      }

      // @ts-ignore
      frappe.new_doc('Task', docAttrs);
    }
  };
  const handleDeleteTask = async (taskId: string) => {
    return new Promise((resolve) => {
      // @ts-ignore
      if (window.frappe) {
        // @ts-ignore
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
      } else {
        // Mock fallback
        setTasks(prev => prev.filter(t => t.id !== taskId));
        resolve({ success: true });
      }
    });
  };

  const handleAddTaskDependency = async (taskId: string, dependsOnId: string) => {
    return new Promise((resolve) => {
      // @ts-ignore
      if (window.frappe) {
        // @ts-ignore
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
      } else {
        // Mock fallback
        setTasks(prev => prev.map(t => {
          if (t.id === taskId) {
            const deps = t.dependencies ? [...t.dependencies] : [];
            deps.push({ dependentOnId: dependsOnId });
            return { ...t, dependencies: deps };
          }
          return t;
        }));
        resolve({ success: true });
      }
    });
  };

  const handleSkipTask = async (taskId: string, isSkip: boolean) => {
    return new Promise((resolve) => {
      // @ts-ignore
      if (window.frappe) {
        // @ts-ignore
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
      } else {
        setTasks(prev => prev.map(t => {
          if (t.id === taskId) {
            return { ...t, isSkipped: isSkip, status: isSkip ? 'Cancelled' : 'Open' };
          }
          return t;
        }));
        resolve({ success: true });
      }
    });
  };

  const handleCaptureBaseline = async () => {
    if (!projectMeta || !projectMeta.name) return;
    setLoading(true);
    // @ts-ignore
    if (window.frappe) {
      // @ts-ignore
      frappe.call({
        method: "erpnext_npdi_suite.api.capture_project_baseline",
        args: { project_name: projectMeta.name },
        callback: function (r: any) {
          if (r.message && r.message.success) {
            // @ts-ignore
            frappe.show_alert({ message: r.message.message || "Línea base capturada.", indicator: "green" });
            fetchTasks();
          } else {
            alert(r.message?.error || "Error al capturar línea base.");
            setLoading(false);
          }
        }
      });
    } else {
      setProjectMeta((prev: any) => prev ? { ...prev, npdi_baseline_locked: 1 } : null);
      setLoading(false);
    }
  };

  
  if (isTemplateMode && templateData) {
    const roles = ["CEO", "Marketing", "I+D", "Calidad", "Supply Chain", "Finanzas", "Producción"].map(r => ({name: r, id: r}));
    return (
      <div className={`theme-${theme}`} style={{ background: 'var(--bg)', color: 'var(--text)', minHeight: '100vh', padding: '20px' }}>
        <TemplateEditorView template={{ ...templateData, tasks: tasks }} allRoles={roles} onRefresh={fetchTasks} />
      </div>
    );
  }

  return (
    <div className={`theme-${theme}`} style={{ padding: '20px', background: 'var(--bg)', color: 'var(--text)', minHeight: '100vh', transition: 'background 0.3s, color 0.3s' }}>

      {/* Header and Switcher Section */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <h2 style={{ margin: 0, color: 'var(--text-h)' }}>NPDI Project Timeline</h2>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          {/* Recalculate Button */}
          <button
            onClick={handleRecalculateCpm}
            disabled={loading}
            style={{
              padding: '6px 14px',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              background: 'var(--bg-surface)',
              color: 'var(--text-secondary)',
              fontSize: '13px',
              fontWeight: '600',
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            {loading ? 'Calculando...' : 'Recalcular Ruta Crítica'}
          </button>

          {/* Premium View Switcher Button Group */}
          <div style={{
            display: 'flex',
            background: 'var(--bg-surface-2)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            padding: '2px',
            boxShadow: 'var(--shadow)'
          }}>
          <button
            onClick={() => setActiveView('gantt')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              border: 'none',
              borderRadius: '6px',
              background: activeView === 'gantt' ? 'var(--accent)' : 'transparent',
              color: activeView === 'gantt' ? '#ffffff' : 'var(--text)',
              fontSize: '13px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s',
              fontFamily: 'var(--sans)',
            }}
          >
            <Calendar size={14} />
            Cronograma
          </button>
          <button
            onClick={() => setActiveView('list')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              border: 'none',
              borderRadius: '6px',
              background: activeView === 'list' ? 'var(--accent)' : 'transparent',
              color: activeView === 'list' ? '#ffffff' : 'var(--text)',
              fontSize: '13px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s',
              fontFamily: 'var(--sans)',
            }}
          >
            <List size={14} />
            Vista de Lista
          </button>
        </div>
        </div>
      </div>

      {activeView === 'gantt' ? (
        <GanttView
          tasks={tasks}
          onTaskClick={handleTaskClick}
          onStatusChange={handleStatusChange}
          onDateChange={handleDateChange}
          onAddQuickTask={handleAddQuickTask}
          projectMeta={projectMeta}
          onCaptureBaseline={handleCaptureBaseline}
        />
      ) : (
        <ListView
          tasks={tasks}
          onTaskClick={handleTaskClick}
          onStatusChange={handleStatusChange}
          onAddQuickTask={handleAddQuickTask}
          onDeleteQuickTask={handleDeleteTask}
          onAddTaskDependency={handleAddTaskDependency}
          onSkipTask={handleSkipTask}
          onUpdateTask={handleUpdateTask}
        />
      )}
    </div>
  )
}

export default App
