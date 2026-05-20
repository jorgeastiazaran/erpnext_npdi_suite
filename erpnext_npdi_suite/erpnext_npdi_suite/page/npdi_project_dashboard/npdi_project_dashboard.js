frappe.pages['npdi_project_dashboard'].on_page_load = function(wrapper) {
    var page = frappe.ui.make_app_page({
        parent: wrapper,
        title: 'NPDI Project Dashboard',
        single_column: true
    });

    // Inyectar contenedor raíz para React
    $(wrapper).find('.layout-main-section').empty().append('<div id="npdi-react-root"></div>');

    // Cargar estilos de Vite
    let cssLink = document.createElement('link');
    cssLink.rel = 'stylesheet';
    cssLink.href = '/assets/erpnext_npdi_suite/frontend/index.css?v=' + Date.now();
    document.head.appendChild(cssLink);

    // Cargar JavaScript compilado de Vite
    let jsScript = document.createElement('script');
    jsScript.type = 'module';
    jsScript.src = '/assets/erpnext_npdi_suite/frontend/bundle.js?v=' + Date.now();
    document.body.appendChild(jsScript);
};
