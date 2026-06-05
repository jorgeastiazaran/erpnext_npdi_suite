import React from 'react';
import { LayoutDashboard, Files, Settings, ChevronRight } from 'lucide-react';

interface NpdiLayoutProps {
  children: React.ReactNode;
  appMode: string;
  projectName?: string;
}

const NpdiLayout: React.FC<NpdiLayoutProps> = ({ children, appMode, projectName }) => {
  // Generate breadcrumb trail based on appMode
  const breadcrumbs = (() => {
    switch (appMode) {
      case 'project':
        return ['NPDI Suite', 'Proyectos', projectName || 'Sin nombre'];
      case 'template_editor':
        return ['NPDI Suite', 'Plantillas', 'Editor'];
      case 'template_list':
        return ['NPDI Suite', 'Plantillas'];
      case 'project_dashboard':
        return ['NPDI Suite', 'Proyectos', projectName || 'Dashboard'];
      case 'error':
        return ['NPDI Suite', 'Error'];
      default:
        return ['NPDI Suite'];
    }
  })();

  const handleNavigation = (route: string, view?: string) => {
    // @ts-ignore
    if (window.frappe && window.frappe.set_route) {
      const routePromise = view 
        // @ts-ignore
        ? window.frappe.set_route(route, view) 
        // @ts-ignore
        : window.frappe.set_route(route);
        
      if (routePromise && routePromise.then) {
        routePromise.then(() => {
          window.dispatchEvent(new Event('npdi_route_changed'));
        });
      } else {
        setTimeout(() => window.dispatchEvent(new Event('npdi_route_changed')), 100);
      }
    }
  };

  return (
    <div style={{
      display: 'flex',
      height: '100vh',
      margin: 0,
      padding: 0,
      overflow: 'hidden',
      backgroundColor: 'var(--bg-surface)',
      color: 'var(--text-primary)',
      fontFamily: 'Inter, system-ui, sans-serif',
    }}>
      {/* Sidebar */}
      <aside style={{
        width: '250px',
        minWidth: '250px',
        backgroundColor: 'var(--bg-surface)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        padding: '20px 0',
        boxSizing: 'border-box',
        overflowY: 'auto',
      }}>
        <div style={{
          padding: '0 20px',
          marginBottom: '30px',
          fontSize: '18px',
          fontWeight: 700,
          color: 'var(--accent)',
          letterSpacing: '-0.5px',
        }}>
          NPDI
        </div>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <button
            onClick={() => handleNavigation('npdi_project_dashboard')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '12px 20px',
              background: 'none',
              border: 'none',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 500,
              transition: 'background-color 0.15s',
              textAlign: 'left',
              width: '100%',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--hover-bg)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <LayoutDashboard size={18} />
            Dashboard
          </button>
          <button
            onClick={() => handleNavigation('npdi_project_dashboard', 'Project Template')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '12px 20px',
              background: 'none',
              border: 'none',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 500,
              transition: 'background-color 0.15s',
              textAlign: 'left',
              width: '100%',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--hover-bg)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <Files size={18} />
            Plantillas
          </button>
          <button
            onClick={() => handleNavigation('npdi-settings')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '12px 20px',
              background: 'none',
              border: 'none',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 500,
              transition: 'background-color 0.15s',
              textAlign: 'left',
              width: '100%',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--hover-bg)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <Settings size={18} />
            Configuración
          </button>
        </nav>
      </aside>

      {/* Main content area */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Top App Bar */}
        <header style={{
          height: '60px',
          minHeight: '60px',
          backgroundColor: 'var(--bg-surface)',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 24px',
          boxSizing: 'border-box',
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '14px',
            color: 'var(--text-secondary)',
            fontWeight: 450,
          }}>
            {breadcrumbs.map((crumb, index) => (
              <React.Fragment key={index}>
                <span>{crumb}</span>
                {index < breadcrumbs.length - 1 && (
                  <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />
                )}
              </React.Fragment>
            ))}
          </div>
        </header>

        {/* Page content */}
        <main style={{
          flex: 1,
          overflow: 'auto',
          backgroundColor: 'var(--bg-canvas)',
        }}>
          {children}
        </main>
      </div>
    </div>
  );
};

export default NpdiLayout;
