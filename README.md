# ERPNext NPDI Suite

Aplicación nativa de Frappe / ERPNext para la gestión estratégica del Desarrollo e Introducción de Nuevos Productos (NPDI) en la industria de alimentos.

## Características Principales
- **Motor CPM (Ruta Crítica)**: Algoritmo integrado en Python que calcula y propaga automáticamente fechas tempranas/tardías y holguras (*Total Float*) sobre las tareas estándar del ERP.
- **Herencia de Plantillas**: Intercepción automatizada que hereda atributos avanzados (módulo, duración, rol responsable y dependencias) desde las plantillas nativas de proyectos (`Project Template Task`) hacia los proyectos en desarrollo.
- **Auditoría de Desviaciones (Baselines)**: Captura instantáneas de la red de fechas en el tiempo para comparar el plan original de lanzamiento frente a la realidad operativa.
- **Panel Dedicado (Dashboard)**: Interfaz de usuario unificada y aislada construida sobre una Página de Frappe (`Page`) que enriquece la experiencia multi-vista (Lista, Reporte, Gantt) agrupando por Módulo e indentando sub-tareas anidadas sin sobreescribir vistas del ERP.

## Instalación en el Bench
```bash
bench get-app https://github.com/tecnofood/erpnext_npdi_suite
bench install-app erpnext_npdi_suite
```
