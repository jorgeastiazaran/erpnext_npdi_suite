import React, { useEffect, useState } from 'react'
import TemplateEditorView from './components/template-editor/TemplateEditorView'
import TemplateListPage from './components/TemplateListPage'
import ProjectsDashboard from './components/ProjectsDashboard'
import GanttView from './GanttView'
import ListView from './ListView'
import TaskDetailDrawer from './components/TaskDetailDrawer'
import ProjectCreationModal from './components/ProjectCreationModal'
import NpdiLayout from './components/layout/NpdiLayout'
import { Calendar, List, ChevronRight } from 'lucide-react'
import './App.css'
import { toISODateString } from './dateUtils'
import { frappeClient } from './api/frappeClient'

function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [tasks, setTasks] = useState<any[]>([]);
  const [projectMeta, setProjectMeta] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isTemplateMode, setIsTemplateMode] = useState(false);
  const [templateData, setTemplateData] = useState<any>(null);
  const [activeView, setActiveView] = useState<'gantt' | 'list'>('gantt');
  const [appMode, setAppMode] = useState<'project' | 'template_editor' | 'template_list' | 'project_dashboard' | 'error'>('error');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [showCreationModal, setShowCreationModal] = useState(false);
  const [erpnextRoles, setErpnextRoles] = useState<any[]>([]);

  const fetchTasks = async (signal?: AbortSignal) => {
    let projectName: string | null = null;
    let templateName: string | null = null;

    if (window.frappe && window.frappe.get_route) {
      const route = window.frappe.get_route();
      const projIdx = route.indexOf("Project");
      const tmplIdx = route.indexOf("Project Template");

      if (projIdx !== -1 && route.length > projIdx + 1 && route[projIdx + 1]) {
        projectName = route[projIdx + 1];
      } else if (tmplIdx !== -1 && route.length > tmplIdx + 1 && route[tmplIdx + 1]) {
        templateName = route[tmplIdx + 1];
      }
    }


    if (!projectName && !templateName) {
      const route = window.frappe?.get_route?.();
      if (route && route[1] === "Project Template" && !route[2]) {
        setAppMode('template_list');
        setLoading(false);
        return;
      } else if (route && route[1] === "Project" && !route[2]) {
        setAppMode('project_dashboard');
        setLoading(false);
        return;
      } else {
        setAppMode('project_dashboard');
        setLoading(false);
        return;
      }
    }

    if (templateName) {
      setAppMode('template_editor');
      if (window.frappe) {
        try {
          const res: any = await frappeClient.call(
            "erpnext_npdi_suite.api.get_template_editor_data",
            { template: templateName },
            signal
          );
          if (res.success) {
            setTemplateData(res.data.template);
            setTasks(res.data.tasks);
          } else {
            setError(res.error || "Error cargando plantilla.");
          }
        } catch (err: any) {
          if (err.name !== 'AbortError') setError(err.message || "Error cargando plantilla.");
        } finally {
          setLoading(false);
        }
      } else {
        setLoading(false);
      }
      return;
    }

    if (window.frappe) {
      try {
        const res: any = await frappeClient.call(
          "erpnext_npdi_suite.api.get_project_gantt_data",
          { project: projectName, template: templateName },
          signal
        );
        if (res.success) {
          setAppMode('project');
          setTasks(res.tasks);
          setProjectMeta(res.project_meta || null);
        } else {
          setError(res.error || "Error cargando tareas del servidor.");
        }
      } catch (err: any) {
        if (err.name !== 'AbortError') setError(err.message || "Error cargando tareas del servidor.");
      } finally {
        setLoading(false);
      }
    } else {
      setTimeout(() => {
        setTasks([]);
        setLoading(false);
      }, 1000);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    const fetchRoles = async () => {
      // @ts-ignore
      if (window.frappe) {
        try {
          // @ts-ignore
          const res = await window.frappe.call('erpnext_npdi_suite.api.get_erpnext_roles');
          if (res.message && res.message.success) {
            setErpnextRoles(res.message.data || []);
          }
        } catch (e) {
          console.error("Failed to fetch roles", e);
        }
      }
    };

    fetchTasks(signal);
    fetchRoles();

    const handleRouteChange = () => {
      setTimeout(() => {
        setLoading(true);
        fetchTasks(signal);
      }, 50);
    };

    window.addEventListener('npdi_route_changed', handleRouteChange);
    window.addEventListener('popstate', handleRouteChange);

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

    return () => {
      controller.abort();
      observer.disconnect();
      window.removeEventListener('npdi_route_changed', handleRouteChange);
      window.removeEventListener('popstate', handleRouteChange);
    };
  }, []);

  if (loading) return <div style={{ padding: '40px', textAlign: 'center' }}>Cargando Cronograma...</div>;
  if (error) return <div style={{ padding: '40px', textAlign: 'center', color: 'red' }}>{error}</div>;

  const handleTaskClick = (taskId: string) => {
    setSelectedTaskId(taskId);
  };

  const handleStatusChange = async (taskId: string, status: string) => {
    if (window.frappe) {
      try {
        const res: any = await frappeClient.call("erpnext_npdi_suite.api.update_task_status", { task_id: taskId, status: status });
        if (res.success) {
          await fetchTasks();
        }
        return res;
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    } else {
      return { success: true };
    }
  };

  const handleDateChange = async (taskId: string, start: Date, end: Date) => {
    if (window.frappe) {
      try {
        const res: any = await frappeClient.call("erpnext_npdi_suite.api.update_task_dates", {
          task_id: taskId,
          start: toISODateString(start),
          end: toISODateString(end)
        });
        if (res.success) {
          await fetchTasks();
        } else {
          await fetchTasks();
        }
        return res;
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    } else {
      return { success: true };
    }
  };

  const handleUpdateTask = async (taskId: string, data: any) => {
    if (window.frappe) {
      try {
        const res: any = await frappeClient.call("erpnext_npdi_suite.api.update_project_task", { task_id: taskId, task_data: data });
        if (res.success) {
          await fetchTasks();
        } else {
          alert(res.error || "Error al actualizar la tarea.");
        }
        return res;
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    } else {
      return { success: true };
    }
  };

  const handleRecalculateCpm = async () => {
    const proj = new URLSearchParams(window.location.search).get('project') || window.frappe?.get_route()[2];
    if (!proj) return;
    setLoading(true);
    if (window.frappe) {
      try {
        const res: any = await frappeClient.call("erpnext_npdi_suite.api.recalculate_cpm", { project: proj });
        if (res.success) {
          window.frappe.show_alert({ message: res.message || "Ruta crítica recalculada.", indicator: "green" });
          fetchTasks();
        } else {
          alert(res.error || "Error al recalcular la ruta crítica.");
          setLoading(false);
        }
      } catch (err: any) {
        alert(err.message || "Error al recalcular la ruta crítica.");
        setLoading(false);
      }
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
    if (window.frappe) {
      if (inheritedData) {
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

      window.frappe.new_doc('Task', docAttrs);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (window.frappe) {
      try {
        const res: any = await frappeClient.call("erpnext_npdi_suite.api.delete_task", { task_id: taskId });
        if (res.success) {
          fetchTasks();
        } else {
          alert(res.error || "Error al eliminar la tarea.");
        }
        return res;
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    } else {
      setTasks(prev => prev.filter(t => t.id !== taskId));
      return { success: true };
    }
  };

  const handleAddTaskDependency = async (taskId: string, dependsOnId: string) => {
    if (window.frappe) {
      try {
        const res: any = await frappeClient.call("erpnext_npdi_suite.api.add_task_dependency", { task_id: taskId, depends_on: dependsOnId });
        if (res.success) {
          fetchTasks();
        } else {
          alert(res.error || "Error al agregar dependencia.");
        }
        return res;
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    } else {
      setTasks(prev => prev.map(t => {
        if (t.id === taskId) {
          const deps = t.dependencies ? [...t.dependencies] : [];
          deps.push({ dependentOnId: dependsOnId });
          return { ...t, dependencies: deps };
        }
        return t;
      }));
      return { success: true };
    }
  };

  const handleSkipTask = async (taskId: string, isSkip: boolean) => {
    if (window.frappe) {
      try {
        const res: any = await frappeClient.call("erpnext_npdi_suite.api.update_task_status", {
          task_id: taskId,
          status: isSkip ? 'Cancelled' : 'Open'
        });
        if (res.success) {
          fetchTasks();
        } else {
          alert(res.error || "Error al actualizar la tarea.");
        }
        return res;
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    } else {
      setTasks(prev => prev.map(t => {
        if (t.id === taskId) {
          return { ...t, isSkipped: isSkip, status: isSkip ? 'Cancelled' : 'Open' };
        }
        return t;
      }));
      return { success: true };
    }
  };

  const handleCaptureBaseline = async () => {
    if (!projectMeta || !projectMeta.name) return;
    setLoading(true);
    if (window.frappe) {
      try {
        const res: any = await frappeClient.call("erpnext_npdi_suite.api.capture_project_baseline", { project_name: projectMeta.name });
        if (res.success) {
          window.frappe.show_alert({ message: res.message || "Línea base capturada.", indicator: "green" });
          fetchTasks();
        } else {
          alert(res.error || "Error al capturar línea base.");
          setLoading(false);
        }
      } catch (err: any) {
        alert(err.message || "Error al capturar línea base.");
        setLoading(false);
      }
    } else {
      setProjectMeta((prev: any) => prev ? { ...prev, npdi_baseline_locked: 1 } : null);
      setLoading(false);
    }
  };

  if (appMode === 'template_list') {
    return (
      <NpdiLayout appMode={appMode}>
        <TemplateListPage onEditTemplate={(name) => {
          // @ts-ignore
          if (window.frappe && window.frappe.set_route) {
            // @ts-ignore
            window.frappe.set_route('npdi_project_dashboard', 'Project Template', name).then(() => window.dispatchEvent(new Event('npdi_route_changed')));
          } else {
            window.location.href = `/app/npdi_project_dashboard/Project Template/${name}`;
          }
        }} />
      </NpdiLayout>
    );
  }

  if (appMode === 'project_dashboard') {
    return (
      <NpdiLayout appMode={appMode}>
        <ProjectsDashboard
          onOpenProject={(name) => {
            // @ts-ignore
            if (window.frappe && window.frappe.set_route) {
              // @ts-ignore
              window.frappe.set_route('npdi_project_dashboard', 'Project', name).then(() => {
                window.dispatchEvent(new Event('npdi_route_changed'));
              });
            } else {
              window.location.hash = `#npdi_project_dashboard/Project/${name}`;
              window.dispatchEvent(new Event('npdi_route_changed'));
            }
          }}

          onOpenTask={handleTaskClick}
          onCreateProject={() => setShowCreationModal(true)}
        />
        <ProjectCreationModal
          isOpen={showCreationModal}
          onClose={() => setShowCreationModal(false)}
          onProjectCreated={(projectName) => {
            setShowCreationModal(false);
            // @ts-ignore
            if (window.frappe && window.frappe.set_route) {
              // @ts-ignore
              window.frappe.set_route('npdi_project_dashboard', 'Project', projectName).then(() => window.dispatchEvent(new Event('npdi_route_changed')));
            } else {
              window.location.href = `/app/npdi_project_dashboard/Project/${projectName}`;
            }
          }}
        />
        {selectedTaskId && (
          <TaskDetailDrawer
            taskId={selectedTaskId}
            onClose={() => setSelectedTaskId(null)}
            onRefresh={() => window.dispatchEvent(new Event('npdi_dashboard_refresh'))}
          />
        )}
      </NpdiLayout>
    );
  }

  if (appMode === 'template_editor' && templateData) {
    const roles = erpnextRoles.length > 0 ? erpnextRoles : ["CEO", "Marketing", "I+D", "Calidad", "Supply Chain", "Finanzas", "Producción"].map(r => ({name: r, id: r}));
    return (
      <NpdiLayout appMode={appMode} projectName={templateData.project_template_name}>
        <TemplateEditorView template={{ ...templateData, tasks: tasks }} allRoles={roles} onRefresh={fetchTasks} />
      </NpdiLayout>
    );
  }

  return (
    <NpdiLayout appMode={appMode} projectName={projectMeta?.name}>
      <div className={`theme-${theme}`} style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', flexWrap: 'wrap', gap: '12px', borderBottom: '1px solid var(--border)', paddingBottom: '20px' }}>
          <div>
            <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 800, margin: '0 0 8px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
              {projectMeta?.name ? (
                <a 
                  href={`/app/project/${projectMeta.name}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: 'var(--text-primary)', textDecoration: 'none' }}
                  onMouseOver={(e) => e.currentTarget.style.textDecoration = 'underline'}
                  onMouseOut={(e) => e.currentTarget.style.textDecoration = 'none'}
                  title="Abrir documento del proyecto en ERPNext"
                >
                  {projectMeta.name}
                </a>
              ) : (
                <span style={{ color: 'var(--text-primary)' }}>NPDI Project Timeline</span>
              )}
            </h1>
            {projectMeta && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', marginTop: 'var(--space-2)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
                  <Calendar size={14} />
                  Lanzamiento Objetivo: {projectMeta.target_launch_date ? new Date(projectMeta.target_launch_date).toLocaleDateString() : 'Por definir'}
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
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

        {selectedTaskId && (
          <TaskDetailDrawer
            taskId={selectedTaskId}
            onClose={() => setSelectedTaskId(null)}
            onRefresh={fetchTasks}
          />
        )}
      </div>
    </NpdiLayout>
  )
}

export default App
