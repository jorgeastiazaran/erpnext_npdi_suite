frappe.pages['npdi_project_dashboard'].on_page_load = function(wrapper) {
    var page = frappe.ui.make_app_page({
        parent: wrapper,
        title: 'NPDI Project Dashboard',
        single_column: true
    });

    $(wrapper).find('.layout-main-section').empty().append('<div id="npdi-react-root"></div>');

    // Cargar estilos de Vite (única vez)
    if (!document.getElementById('npdi-frontend-css')) {
        let cssLink = document.createElement('link');
        cssLink.id = 'npdi-frontend-css';
        cssLink.rel = 'stylesheet';
        cssLink.href = '/assets/erpnext_npdi_suite/frontend/index.css';
        document.head.appendChild(cssLink);
    }

    function renderApp() {
        var container = document.getElementById('npdi-react-root');
        if (container && window.mountNpdiDashboard) {
            window.mountNpdiDashboard(container);
        }
    }

    if (window.mountNpdiDashboard) {
        renderApp();
    } else if (!document.getElementById('npdi-frontend-js')) {
        let jsScript = document.createElement('script');
        jsScript.id = 'npdi-frontend-js';
        jsScript.type = 'module';
        jsScript.src = '/assets/erpnext_npdi_suite/frontend/bundle.js';
        jsScript.onload = renderApp;
        document.body.appendChild(jsScript);
    }
};

frappe.pages['npdi_project_dashboard'].on_page_show = function(wrapper) {
    var container = document.getElementById('npdi-react-root');
    if (!container || !container.children.length) {
        $(wrapper).find('.layout-main-section').empty().append('<div id="npdi-react-root"></div>');
        container = document.getElementById('npdi-react-root');
    }
    if (container && window.mountNpdiDashboard) {
        window.mountNpdiDashboard(container);
    }
    window.dispatchEvent(new Event('npdi_route_changed'));
};

