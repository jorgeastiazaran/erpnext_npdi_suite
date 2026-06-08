import React, { useState, useEffect } from 'react';
import { LayoutDashboard, CheckSquare, Search, Filter, AlertCircle, Clock, CheckCircle2, Maximize2, Minimize2 } from 'lucide-react';
import './ProjectsDashboard.css';

interface Project {
  name: string;
  title: string;
  stage: string;
  targetLaunchDate: string;
  baselineLaunchDate?: string;
  isBaselineLocked?: boolean;
  progress: number;
  status: string;
}

interface Task {
  id: string;
  taskName: string;
  status: string;
  project: string;
  projectName: string;
  stage: string;
  startDate: string;
  endDate: string;
  owner: string;
  isDelayed: boolean;
}

interface DashboardData {
  stats: {
    activeProjects: number;
    delayedTasks: number;
    globalProgress: number;
  };
  projects: Project[];
  tasks: Task[];
  owners: string[];
}

interface Props {
  onOpenProject: (projectName: string) => void;
  onCreateProject?: () => void;
  onOpenTask?: (taskId: string) => void;
}

const ProjectsDashboard: React.FC<Props> = ({ onOpenProject, onCreateProject, onOpenTask }) => {
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // View state
  const [activeTab, setActiveTab] = useState<'projects' | 'tasks'>('projects');
  const [taskGroupBy, setTaskGroupBy] = useState<'status' | 'owner' | 'stage' | 'taskName' | 'delayed'>('status');
  const [isFullscreen, setIsFullscreen] = useState(true);
  
  // Filters
  const [ownerFilter, setOwnerFilter] = useState<string>('All');
  const [projectFilter, setProjectFilter] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');

  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        // @ts-ignore
        if (window.frappe) {
          // @ts-ignore
          window.frappe.call({
            method: 'erpnext_npdi_suite.api.get_project_dashboard_data',
            callback: (r: any) => {
              if (r.message && r.message.success) {
                setDashboardData(r.message.data);
              } else {
                setError(r.message?.error || 'Failed to load dashboard data');
              }
              setLoading(false);
            }
          });
        } else {
          setLoading(false);
          setError("Not in Frappe environment");
        }
      } catch (err) {
        setError('Network error or invalid response');
        setLoading(false);
      }
    };

    fetchDashboard();

    // Enable focus mode by default on dashboard load
    window.dispatchEvent(new CustomEvent('npdi_toggle_focus_mode', { detail: true }));

    const handleRefresh = () => fetchDashboard();
    window.addEventListener('npdi_dashboard_refresh', handleRefresh);
    return () => {
      window.removeEventListener('npdi_dashboard_refresh', handleRefresh);
      // Restore normal layout when leaving dashboard
      window.dispatchEvent(new CustomEvent('npdi_toggle_focus_mode', { detail: false }));
    };
  }, []);

  if (loading) return <div className="loading-state">Cargando datos del dashboard...</div>;
  if (error) return <div className="error-state">Error: {error}</div>;
  if (!dashboardData) return <div className="empty-state">No hay datos disponibles.</div>;

  const { stats, projects, tasks, owners } = dashboardData;

  // Filtered Data
  const filteredProjects = projects.filter(p => {
    if (projectFilter !== 'All' && p.name !== projectFilter) return false;
    if (statusFilter !== 'All' && p.status !== statusFilter) return false;
    if (searchQuery && !p.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const filteredTasks = (tasks || []).filter(t => {
    if (ownerFilter !== 'All' && t.owner !== ownerFilter) return false;
    if (projectFilter !== 'All' && t.project !== projectFilter) return false;
    if (searchQuery && !t.taskName.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  // Calculate dynamic stats based on filters
  const delayedFilteredTasks = filteredTasks.filter(t => t.isDelayed);
  
  const upcomingTasks = filteredTasks
    .filter(t => !t.isDelayed && t.status !== 'Completed')
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
    .slice(0, 10);

  // Dynamic Kanban Columns
  let kanbanColumns: { id: string; title: string }[] = [];
  if (taskGroupBy === 'status') {
    kanbanColumns = [
      { id: 'Open', title: 'Por Hacer' },
      { id: 'Working', title: 'En Progreso' },
      { id: 'Pending Review', title: 'Revisión' },
      { id: 'Completed', title: 'Completado' }
    ];
  } else if (taskGroupBy === 'owner') {
    const uniqueOwners = Array.from(new Set(filteredTasks.map(t => t.owner))).sort();
    kanbanColumns = uniqueOwners.map(o => ({ id: o, title: o }));
  } else if (taskGroupBy === 'stage') {
    const uniqueStages = Array.from(new Set(filteredTasks.map(t => t.stage))).filter(s => s !== '-').sort();
    kanbanColumns = uniqueStages.map(s => ({ id: s, title: s }));
    if (filteredTasks.some(t => t.stage === '-')) kanbanColumns.push({ id: '-', title: 'Sin Etapa' });
  } else if (taskGroupBy === 'taskName') {
    const uniqueTaskNames = Array.from(new Set(filteredTasks.map(t => t.taskName))).sort();
    kanbanColumns = uniqueTaskNames.map(n => ({ id: n, title: n }));
  } else if (taskGroupBy === 'delayed') {
    kanbanColumns = [
      { id: 'true', title: 'Retrasadas' },
      { id: 'false', title: 'A Tiempo' }
    ];
  }

  const calculateDelayDays = (endDate: string, isDelayed: boolean) => {
    if (!isDelayed || !endDate) return 0;
    const end = new Date(endDate);
    const now = new Date();
    // Reset time to midnight for accurate day calculation
    end.setHours(0,0,0,0);
    now.setHours(0,0,0,0);
    const diffTime = now.getTime() - end.getTime();
    if (diffTime <= 0) return 0;
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
  };

  return (
    <div 
      className="dashboard-container" 
      style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        gap: isFullscreen ? '8px' : '20px', 
        padding: isFullscreen ? '8px' : '24px', 
        height: '100%', 
        overflowY: 'auto',
        background: 'var(--bg-canvas)',
      }}
    >
      {/* Header and Global Filters */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: isFullscreen ? '8px' : '20px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, margin: '0 0 8px 0' }}>Centro de Control NPDI</h1>
          <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '14px' }}>
            Monitorea el progreso, cuellos de botella y carga de trabajo del equipo.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <button 
            className="btn btn-ghost"
            onClick={() => {
              const newState = !isFullscreen;
              setIsFullscreen(newState);
              window.dispatchEvent(new CustomEvent('npdi_toggle_focus_mode', { detail: newState }));
            }}
            title={isFullscreen ? "Salir de Focus Mode" : "Focus Mode"}
            style={{ fontSize: '13px', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            {isFullscreen ? "Normal" : "Focus Mode"}
          </button>
          <button 
            className="btn btn-primary"
            onClick={() => onCreateProject ? onCreateProject() : window.open('/app/project/new', '_blank')}
            style={{ padding: '8px 16px' }}
          >
            + Nuevo Proyecto
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div style={{ display: 'flex', gap: '16px', background: 'var(--bg-surface-2)', padding: isFullscreen ? '8px 12px' : '16px', borderRadius: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--bg-surface)', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)' }}>
          <Search size={16} style={{ color: 'var(--text-muted)' }} />
          <input 
            type="text" 
            placeholder="Buscar..." 
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '14px', width: '200px' }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Filter size={16} style={{ color: 'var(--text-muted)' }} />
          <select className="input" value={ownerFilter} onChange={e => setOwnerFilter(e.target.value)} style={{ padding: '8px', height: 'auto' }}>
            <option value="All">Todos los Asignados</option>
            {(owners || []).map(o => <option key={o} value={o}>{o}</option>)}
          </select>
          
          <select className="input" value={projectFilter} onChange={e => setProjectFilter(e.target.value)} style={{ padding: '8px', height: 'auto' }}>
            <option value="All">Todos los Proyectos</option>
            {projects.map(p => <option key={p.name} value={p.name}>{p.title}</option>)}
          </select>
        </div>
      </div>

      {/* Top KPI Cards */}
      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
        <div className="card" style={{ flex: 1, minWidth: '200px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 600 }}>Proyectos Activos (Filtrados)</div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text-primary)' }}>{filteredProjects.length}</div>
        </div>
        <div className="card" style={{ flex: 1, minWidth: '200px', display: 'flex', flexDirection: 'column', gap: '8px', borderLeft: delayedFilteredTasks.length > 0 ? '4px solid var(--status-error-text)' : 'none' }}>
          <div style={{ color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
            Tareas Retrasadas <AlertCircle size={14} style={{ color: delayedFilteredTasks.length > 0 ? 'var(--status-error-text)' : 'var(--text-muted)' }}/>
          </div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: delayedFilteredTasks.length > 0 ? 'var(--status-error-text)' : 'var(--text-primary)' }}>
            {delayedFilteredTasks.length}
          </div>
        </div>
        <div className="card" style={{ flex: 1, minWidth: '200px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 600 }}>Progreso Global</div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--status-success-text)' }}>{stats.globalProgress}%</div>
          <div style={{ background: 'var(--bg-surface-2)', height: '4px', borderRadius: '2px', overflow: 'hidden' }}>
            <div style={{ width: `${stats.globalProgress}%`, height: '100%', background: 'var(--status-success-text)' }} />
          </div>
        </div>
      </div>

      {/* Atención Requerida Widget (Only visible if there are delays) */}
      {delayedFilteredTasks.length > 0 && (
        <div className="card" style={{ border: '1px solid var(--status-error-border)', background: 'var(--status-error-bg)' }}>
          <h3 style={{ fontSize: '14px', color: 'var(--status-error-text)', margin: '0 0 12px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertCircle size={16} /> Atención Requerida ({delayedFilteredTasks.length} tareas retrasadas)
          </h3>
          <div style={{ display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '8px' }}>
            {delayedFilteredTasks.slice(0, 5).map(t => (
              <div key={t.id} style={{ minWidth: '250px', background: 'var(--bg-surface)', padding: '12px', borderRadius: '8px', border: '1px solid var(--status-error-border)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }} className="truncate">{t.taskName}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between' }}>
                  <span className="truncate" style={{ maxWidth: '120px' }}>{t.projectName}</span>
                  <span style={{ color: 'var(--status-error-text)', fontWeight: 600 }}>Due: {t.endDate}</span>
                </div>
                <div style={{ fontSize: '11px', background: 'var(--bg-surface-2)', padding: '2px 6px', borderRadius: '4px', alignSelf: 'flex-start' }}>👤 {t.owner}</div>
              </div>
            ))}
            {delayedFilteredTasks.length > 5 && (
              <div style={{ minWidth: '100px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', color: 'var(--text-secondary)' }}>
                +{delayedFilteredTasks.length - 5} más
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tabs / Dashboard Switcher */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginTop: '8px' }}>
        <button 
          onClick={() => setActiveTab('projects')}
          style={{ 
            padding: '12px 24px', 
            background: 'none', 
            border: 'none', 
            borderBottom: activeTab === 'projects' ? '2px solid var(--accent)' : '2px solid transparent',
            color: activeTab === 'projects' ? 'var(--accent)' : 'var(--text-secondary)',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <LayoutDashboard size={16} /> Dashboard: Portafolio
        </button>
        <button 
          onClick={() => setActiveTab('tasks')}
          style={{ 
            padding: '12px 24px', 
            background: 'none', 
            border: 'none', 
            borderBottom: activeTab === 'tasks' ? '2px solid var(--accent)' : '2px solid transparent',
            color: activeTab === 'tasks' ? 'var(--accent)' : 'var(--text-secondary)',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <CheckSquare size={16} /> Dashboard: Tareas (Kanban)
        </button>
      </div>

      {/* Tab Content */}
      <div style={{ flex: 1, minHeight: '400px' }}>
        {activeTab === 'projects' ? (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="table-container" style={{ margin: 0 }}>
              <table className="projects-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-surface-2)', borderBottom: '1px solid var(--border)' }}>
                    <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>Nombre del Proyecto</th>
                    <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>Etapa Actual</th>
                    <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>Fecha Lanzamiento</th>
                    <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>Progreso</th>
                    <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>Estado</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProjects.map(p => (
                    <tr key={p.name} style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
                      <td style={{ padding: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>{p.title}</td>
                      <td style={{ padding: '16px', fontSize: '13px' }}>
                        <span style={{ background: 'var(--bg-surface-2)', padding: '4px 8px', borderRadius: '12px' }}>{p.stage}</span>
                      </td>
                      <td style={{ padding: '16px', fontSize: '13px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                              {p.targetLaunchDate || 'Sin Fecha'}
                            </span>
                          </div>
                          {p.isBaselineLocked && p.baselineLaunchDate ? (
                            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <span>Base: {p.baselineLaunchDate}</span>
                              {(() => {
                                if (!p.targetLaunchDate) return null;
                                const bDate = new Date(p.baselineLaunchDate);
                                const tDate = new Date(p.targetLaunchDate);
                                bDate.setHours(0,0,0,0);
                                tDate.setHours(0,0,0,0);
                                const diffTime = tDate.getTime() - bDate.getTime();
                                const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                                if (diffDays > 0) return <span style={{ color: 'var(--status-error-text)', fontWeight: 600 }}>(+{diffDays}d)</span>;
                                if (diffDays < 0) return <span style={{ color: 'var(--status-dev-text)', fontWeight: 600 }}>({diffDays}d)</span>;
                                return <span style={{ color: 'var(--text-muted)' }}>(0d)</span>;
                              })()}
                            </div>
                          ) : (
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                              Base: Sin Capturar
                            </div>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{ flex: 1, height: '6px', background: 'var(--bg-surface-2)', borderRadius: '3px', overflow: 'hidden' }}>
                            <div style={{ width: `${p.progress}%`, height: '100%', background: 'var(--accent)' }} />
                          </div>
                          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', width: '36px' }}>{p.progress}%</span>
                        </div>
                      </td>
                      <td style={{ padding: '16px' }}>
                        <span className={`status-badge ${p.status === 'Active' ? 'active' : p.status === 'Completed' ? 'completed' : 'cancelled'}`}>
                          {p.status === 'Active' ? 'Activo' : p.status === 'Completed' ? 'Completado' : 'Cancelado'}
                        </span>
                      </td>
                      <td style={{ padding: '16px', textAlign: 'right' }}>
                        <button onClick={() => onOpenProject(p.name)} className="btn btn-ghost" style={{ fontSize: '12px', padding: '6px 12px' }}>Abrir</button>
                      </td>
                    </tr>
                  ))}
                  {filteredProjects.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>No hay proyectos que coincidan con los filtros.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', height: '100%', minHeight: '600px' }}>
            {/* Kanban Grouping Controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'var(--bg-surface-2)', padding: '8px 16px', borderRadius: '8px', alignSelf: 'flex-start' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>Agrupar tareas por:</span>
              <div style={{ display: 'flex', background: 'var(--bg-surface)', borderRadius: '6px', border: '1px solid var(--border)', overflow: 'hidden' }}>
                <button 
                  onClick={() => setTaskGroupBy('status')} 
                  style={{ padding: '6px 12px', border: 'none', background: taskGroupBy === 'status' ? 'var(--accent)' : 'transparent', color: taskGroupBy === 'status' ? 'white' : 'var(--text-primary)', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                >Estado</button>
                <button 
                  onClick={() => setTaskGroupBy('owner')} 
                  style={{ padding: '6px 12px', border: 'none', borderLeft: '1px solid var(--border)', background: taskGroupBy === 'owner' ? 'var(--accent)' : 'transparent', color: taskGroupBy === 'owner' ? 'white' : 'var(--text-primary)', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                >Responsable</button>
                <button 
                  onClick={() => setTaskGroupBy('stage')} 
                  style={{ padding: '6px 12px', border: 'none', borderLeft: '1px solid var(--border)', background: taskGroupBy === 'stage' ? 'var(--accent)' : 'transparent', color: taskGroupBy === 'stage' ? 'white' : 'var(--text-primary)', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                >Etapa</button>
                <button 
                  onClick={() => setTaskGroupBy('taskName')} 
                  style={{ padding: '6px 12px', border: 'none', borderLeft: '1px solid var(--border)', background: taskGroupBy === 'taskName' ? 'var(--accent)' : 'transparent', color: taskGroupBy === 'taskName' ? 'white' : 'var(--text-primary)', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                >Nombre</button>
                <button 
                  onClick={() => setTaskGroupBy('delayed')} 
                  style={{ padding: '6px 12px', border: 'none', borderLeft: '1px solid var(--border)', background: taskGroupBy === 'delayed' ? 'var(--accent)' : 'transparent', color: taskGroupBy === 'delayed' ? 'white' : 'var(--text-primary)', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                >Retraso</button>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '16px', flex: 1, overflowX: 'auto', paddingBottom: '16px' }}>
              {kanbanColumns.map(col => {
                const colTasks = filteredTasks.filter(t => {
                  if (taskGroupBy === 'status') {
                    if (col.id === 'Open') return ['Open', 'Template'].includes(t.status);
                    if (col.id === 'Working') return ['Working', 'Overdue'].includes(t.status);
                    return t.status === col.id;
                  } else if (taskGroupBy === 'owner') {
                    return t.owner === col.id;
                  } else if (taskGroupBy === 'stage') {
                    return t.stage === col.id;
                  } else if (taskGroupBy === 'taskName') {
                    return t.taskName === col.id;
                  } else if (taskGroupBy === 'delayed') {
                    return col.id === 'true' ? t.isDelayed : !t.isDelayed;
                  }
                  return false;
                }).sort((a, b) => {
                  const delayA = calculateDelayDays(a.endDate, a.isDelayed);
                  const delayB = calculateDelayDays(b.endDate, b.isDelayed);
                  if (delayA !== delayB) {
                    return delayB - delayA; // most delayed first
                  }
                  return new Date(a.endDate).getTime() - new Date(b.endDate).getTime();
                });

                return (
                  <div key={col.id} style={{ flex: '1', minWidth: '300px', maxWidth: '350px', background: 'var(--bg-surface-2)', borderRadius: '12px', display: 'flex', flexDirection: 'column', overflow: 'hidden', border: '1px solid var(--border)' }}>
                    <div style={{ padding: '16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-surface)' }}>
                      <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>{col.title}</h3>
                      <span style={{ fontSize: '12px', background: 'var(--bg-surface-2)', padding: '2px 8px', borderRadius: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>{colTasks.length}</span>
                    </div>
                    <div style={{ padding: '12px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {colTasks.map(t => (
                        <div key={t.id} style={{ background: 'var(--bg-surface)', padding: '12px', borderRadius: '8px', border: t.isDelayed ? '1px solid var(--status-error-border)' : '1px solid var(--border)', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <button 
                              onClick={() => onOpenTask && onOpenTask(t.id)}
                              style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', fontSize: '13px', fontWeight: 600, color: 'var(--accent)', lineHeight: '1.4', cursor: 'pointer', textDecoration: 'underline', textDecorationColor: 'transparent', transition: 'text-decoration-color 0.2s' }}
                              onMouseOver={(e) => e.currentTarget.style.textDecorationColor = 'var(--accent)'}
                              onMouseOut={(e) => e.currentTarget.style.textDecorationColor = 'transparent'}
                            >
                              {t.taskName}
                            </button>
                            {t.isDelayed && <AlertCircle size={14} style={{ color: 'var(--status-error-text)', flexShrink: 0 }} title="Retrasada" />}
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                            <button 
                              onClick={() => onOpenProject(t.project)}
                              style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', fontSize: '11px', color: 'var(--text-secondary)', cursor: 'pointer', textDecoration: 'underline' }}
                            >
                              {t.projectName}
                            </button>
                          </div>
                          
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: t.isDelayed ? 'var(--status-error-text)' : 'var(--text-muted)' }}>
                              <Clock size={12} /> {t.endDate}
                            </div>
                            <div style={{ fontSize: '11px', background: 'var(--bg-surface-2)', padding: '2px 6px', borderRadius: '4px', color: 'var(--text-secondary)' }}>
                              👤 {t.owner}
                            </div>
                          </div>
                          {t.isDelayed && (
                            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--status-error-text)', background: 'var(--status-error-bg)', padding: '2px 6px', borderRadius: '4px', alignSelf: 'flex-start', marginTop: '2px', border: '1px solid var(--status-error-border)' }}>
                              Retraso: {calculateDelayDays(t.endDate, t.isDelayed)} días
                            </div>
                          )}
                        </div>
                      ))}
                      {colTasks.length === 0 && (
                        <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)', fontSize: '12px' }}>Sin tareas</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProjectsDashboard;
