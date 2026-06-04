import React, { useState, useEffect } from 'react';
import './ProjectsDashboard.css';

// TypeScript interfaces
interface Project {
  name: string;
  title: string;
  stage: string;
  targetLaunchDate: string;
  progress: number;
  status: string;
}

interface DashboardData {
  stats: {
    activeProjects: number;
    delayedTasks: number;
    globalProgress: number;
  };
  projects: Project[];
}

interface Props {
  onOpenProject: (projectName: string) => void;
}

const ProjectsDashboard: React.FC<Props> = ({ onOpenProject }) => {
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

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
  }, []);

  if (loading) {
    return <div className="loading-state">Cargando datos del dashboard...</div>;
  }

  if (error) {
    return <div className="error-state">Error: {error}</div>;
  }

  if (!dashboardData) {
    return <div className="empty-state">No hay datos disponibles.</div>;
  }

  const { stats, projects } = dashboardData;

  return (
    <div className="dashboard-container">
      {/* Header */}
      <div className="dashboard-header">
        <div>
          <h1 className="dashboard-title">Proyectos NPDI</h1>
          <p className="dashboard-subtitle">
            Gestiona y monitorea todos los proyectos NPDI activos.
          </p>
        </div>
        <button 
          className="btn-new-project"
          onClick={() => window.open('/app/project/new', '_blank')}
        >
          + Nuevo Proyecto
        </button>
      </div>

      {/* Summary Stats Cards */}
      <div className="stats-grid">
        <div className="stat-card">
          <p className="stat-label">Proyectos Activos</p>
          <p className="stat-value">{stats.activeProjects}</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Tareas Retrasadas</p>
          <p className="stat-value danger">{stats.delayedTasks}</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Progreso Global</p>
          <p className="stat-value success">{stats.globalProgress}%</p>
          <div className="progress-bar-bg">
            <div
              className="progress-bar-fill success-fill"
              style={{ width: `${stats.globalProgress}%` }}
            ></div>
          </div>
        </div>
      </div>

      {/* Projects Table */}
      <div className="table-container">
        <table className="projects-table">
          <thead>
            <tr>
              <th>Nombre del Proyecto</th>
              <th>Etapa</th>
              <th>Fecha Lanzamiento</th>
              <th>Progreso</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {projects.map(project => (
              <tr key={project.name}>
                <td className="project-title">{project.title}</td>
                <td>{project.stage}</td>
                <td>{project.targetLaunchDate}</td>
                <td>
                  <div className="progress-cell">
                    <div className="progress-bar-bg small">
                      <div
                        className="progress-bar-fill"
                        style={{ width: `${project.progress}%` }}
                      ></div>
                    </div>
                    <span className="progress-text">{project.progress}%</span>
                  </div>
                </td>
                <td>
                  <span
                    className={`status-badge ${
                      project.status === 'Active'
                        ? 'active'
                        : project.status === 'Completed'
                        ? 'completed'
                        : 'cancelled'
                    }`}
                  >
                    {project.status === 'Active' ? 'Activo' : project.status === 'Completed' ? 'Completado' : 'Cancelado'}
                  </span>
                </td>
                <td className="actions-cell">
                  <button
                    onClick={() => onOpenProject(project.name)}
                    className="btn-open"
                  >
                    Abrir
                  </button>
                </td>
              </tr>
            ))}
            {projects.length === 0 && (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '20px' }}>
                  No hay proyectos activos.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ProjectsDashboard;
