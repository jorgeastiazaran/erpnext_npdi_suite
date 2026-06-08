# ERPNext NPDI Suite (Advanced Project Dashboard & Templates)

Una extensión de última generación para **ERPNext** que revoluciona la forma en que los administradores de proyectos interactúan con la plataforma. Sustituye la vista clásica de Proyectos de Frappe con una moderna Single Page Application (SPA) en React y ofrece un motor ultra-avanzado de Plantillas de Proyectos.

## 📖 Descripción Detallada

**ERPNext NPDI Suite** es un rediseño radical de la interfaz y lógica de gestión de proyectos nativa de ERPNext. Se compone de dos motores principales: el **Portafolio de Proyectos (Dashboard)** y el **Creador Visual de Plantillas (Template Engine)**.

A través de una integración fluida usando Vite y React, la aplicación secuestra elegantemente las rutas nativas de ERPNext (ej. `/app/project` y `/app/project-template`) y renderiza una interfaz rica, rápida y altamente visual que mejora significativamente la experiencia de usuario de gerentes y ejecutivos.

### Características Principales:

#### 1. Creador Visual de Plantillas (Project Template Editor)
- **Interfaz Gráfica de Nodos:** Diseña tus proyectos estándar con una visualización de árbol infinito. Añade, elimina, y edita tareas de forma recursiva (padres e hijos).
- **Importación/Exportación Inteligente por CSV:** Migra tus plantillas complejas entre distintas instalaciones de ERPNext con un solo clic. El motor de importación lee un archivo CSV y reconstruye por sí solo los registros subyacentes de Tareas, Sub-tareas, y las conexiones lógicas de Gantt.
- **Campos Enriquecidos (NPDI Metadata):** Asigna a cada tarea su Etapa, Módulo, Rol Responsable (leyendo directamente de los Roles de Frappe), y determina si la tarea funge como un _Hito de Lanzamiento_.
- **Dependencias Directas:** Vincula predecesores y sucesores de manera nativa sin tener que entrar a múltiples formularios.

#### 2. Tablero de Control de Proyectos (NPDI Dashboard)
- **Vistas Múltiples:** Alterna de forma instantánea entre **Gantt**, **Kanban**, y **Lista (Portafolio)** interactiva.
- **Focus Mode (Default):** Un modo de alta concentración que centra la vista únicamente en las tareas del proyecto activo, optimizado para productividad.
- **Motor CPM (Critical Path Method):** Un script nativo en Python que recalcula constantemente las fechas _Baseline_ vs _Actuales_ a lo largo de la ruta crítica, indicando instantáneamente los desvíos (Lanzamiento Original vs Proyectado).
- **Acceso Transparente:** Enlaces profundos integrados a lo largo de todas las tarjetas para saltar directamente a los documentos nativos del ERP cuando se requiera editar detalles técnicos.

## 💻 Requisitos del Sistema

- **Framework Frappe:** Versión 14 o 15.
- **ERPNext:** Versión 14 o 15.
- **Python:** 3.10 o superior.
- **Node.js:** v16, v18 o v20 (Requerido para compilar la aplicación React).
- **NPM o Yarn:** Administradores de paquetes.

## ⚙️ Instrucciones de Instalación

El proceso de instalación de esta aplicación tiene una particularidad: **requiere que compiles el código del frontend (React) antes o inmediatamente después de instalarla en el servidor.**

### 1. Obtener la aplicación
Sitúate en el directorio de tu bench y descarga la aplicación:
```bash
bench get-app https://github.com/jorgeastiazaran/erpnext_npdi_suite.git
```

### 2. Compilar el Frontend (React)
La interfaz de usuario no está empaquetada por defecto para permitir contribuciones al código. Debes compilarla manualmente.
```bash
# Navegar al directorio del frontend de la app
cd apps/erpnext_npdi_suite/frontend

# Instalar dependencias
npm install

# Compilar para producción (genera bundle.js dentro de la app)
npm run build

# Volver a la raíz del bench
cd ../../../
```

### 3. Instalar en tu Sitio
Asegúrate de saber el nombre del sitio de ERPNext donde deseas instalar el módulo (por ejemplo, `misitio.localhost`) e instálalo:
```bash
bench --site misitio.localhost install-app erpnext_npdi_suite
```

*(Nota: Al ejecutar `install-app` o `migrate`, la aplicación inyecta automáticamente de forma programática todos los Custom Fields necesarios en los doctypes estándar de "Task", "Project" y "Project Template Task" usando los scripts de `setup/install.py` y `setup/custom_fields.py`)*

### 4. Limpiar Caché y Reiniciar
```bash
bench --site misitio.localhost clear-cache
bench restart
# Si usas docker-compose: docker-compose restart erpnext
```

## 🚀 Uso Rápido

1. Inicia sesión en ERPNext.
2. Navega al buscador de barra global (Awesome Bar) y escribe **Project** o ve a la ruta normal de los proyectos.
3. Notarás que el sistema renderizará automáticamente la nueva Interfaz en React.
4. Para diseñar una nueva plantilla, dirígete a "Configuración" -> "Plantillas de Proyecto" o accede a la ruta clásica de plantillas; el nuevo Template Engine tomará el control automáticamente.

## 🛠 Soporte y Contribución
Las colaboraciones para expandir los widgets del tablero, agregar vistas, o expandir la API de CPM son bienvenidas. Por favor abre un _Pull Request_ o _Issue_ en GitHub.
