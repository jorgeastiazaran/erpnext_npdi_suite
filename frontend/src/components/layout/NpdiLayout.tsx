import React from 'react';
import { LayoutDashboard, Files, Settings, ChevronRight, PanelLeftClose, PanelLeftOpen, ChevronUp, ChevronDown } from 'lucide-react';

interface NpdiLayoutProps {
  children: React.ReactNode;
  appMode: string;
  projectName?: string;
}

const NpdiLayout: React.FC<NpdiLayoutProps> = ({ children, appMode, projectName }) => {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = React.useState(false);
  const [isTopbarCollapsed, setIsTopbarCollapsed] = React.useState(false);

  React.useEffect(() => {
    const handleFocusMode = (e: any) => {
      setIsSidebarCollapsed(e.detail);
      setIsTopbarCollapsed(e.detail);
    };
    window.addEventListener('npdi_toggle_focus_mode', handleFocusMode);
    return () => window.removeEventListener('npdi_toggle_focus_mode', handleFocusMode);
  }, []);

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
        width: isSidebarCollapsed ? '60px' : '250px',
        minWidth: isSidebarCollapsed ? '60px' : '250px',
        backgroundColor: 'var(--bg-surface)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        padding: '20px 0',
        boxSizing: 'border-box',
        overflowY: 'auto',
        overflowX: 'hidden',
        transition: 'width 0.2s ease, min-width 0.2s ease',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: isSidebarCollapsed ? 'center' : 'space-between',
          padding: isSidebarCollapsed ? '0' : '0 20px',
          marginBottom: '30px',
        }}>
          {!isSidebarCollapsed && (
            <div style={{
              fontSize: '18px',
              fontWeight: 700,
              color: 'var(--accent)',
              letterSpacing: '-0.5px',
            }}>
              NPDI
            </div>
          )}
          <button 
            className="btn-icon" 
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            title={isSidebarCollapsed ? "Expandir menú" : "Colapsar menú"}
            style={{ color: 'var(--text-muted)' }}
          >
            {isSidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        </div>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <button
            onClick={() => handleNavigation('npdi_project_dashboard')}
            title={isSidebarCollapsed ? "Dashboard" : undefined}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: isSidebarCollapsed ? 'center' : 'flex-start',
              gap: '12px',
              padding: isSidebarCollapsed ? '12px 0' : '12px 20px',
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
            {!isSidebarCollapsed && "Dashboard"}
          </button>
          <button
            onClick={() => handleNavigation('npdi_project_dashboard', 'Project Template')}
            title={isSidebarCollapsed ? "Plantillas" : undefined}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: isSidebarCollapsed ? 'center' : 'flex-start',
              gap: '12px',
              padding: isSidebarCollapsed ? '12px 0' : '12px 20px',
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
            {!isSidebarCollapsed && "Plantillas"}
          </button>
          <button
            onClick={() => handleNavigation('npdi-settings')}
            title={isSidebarCollapsed ? "Configuración" : undefined}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: isSidebarCollapsed ? 'center' : 'flex-start',
              gap: '12px',
              padding: isSidebarCollapsed ? '12px 0' : '12px 20px',
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
            {!isSidebarCollapsed && "Configuración"}
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
          height: isTopbarCollapsed ? '0px' : '60px',
          minHeight: isTopbarCollapsed ? '0px' : '60px',
          backgroundColor: 'var(--bg-surface)',
          borderBottom: isTopbarCollapsed ? 'none' : '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: isTopbarCollapsed ? '0' : '0 24px',
          boxSizing: 'border-box',
          overflow: 'hidden',
          transition: 'height 0.2s ease, min-height 0.2s ease, padding 0.2s ease',
          opacity: isTopbarCollapsed ? 0 : 1,
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
          
          <button 
            className="btn-icon" 
            onClick={() => setIsTopbarCollapsed(true)}
            title="Colapsar panel superior"
            style={{ color: 'var(--text-muted)' }}
          >
            <ChevronUp size={18} />
          </button>
        </header>

        {/* Floating button to restore top bar when collapsed */}
        {isTopbarCollapsed && (
          <button
            onClick={() => setIsTopbarCollapsed(false)}
            style={{
              position: 'absolute',
              top: '8px',
              right: '24px',
              zIndex: 1000,
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: '50%',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              boxShadow: '0 2px 5px rgba(0,0,0,0.1)',
            }}
            title="Expandir panel superior"
          >
            <ChevronDown size={16} />
          </button>
        )}

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
