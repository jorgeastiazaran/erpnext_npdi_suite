import React, { useState, useEffect } from 'react';
import { Clock, ListChecks, Plus, Edit3, Copy, Download } from 'lucide-react';
import './TemplateListPage.css';

interface Template {
  name: string;
  description: string;
  module: string;
  taskCount: number;
  durationDays: number;
}

interface Props {
  onEditTemplate: (name: string) => void;
}

const TemplateListPage: React.FC<Props> = ({ onEditTemplate }) => {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      // @ts-ignore
      const result = await window.frappe.call('erpnext_npdi_suite.api.get_template_list');
      setTemplates(result.message || []);
    } catch (error) {
      console.error('Failed to fetch templates:', error);
      alert('Error al cargar las plantillas.');
    } finally {
      setLoading(false);
    }
  };

  const handleDuplicate = async (templateName: string) => {
    try {
      // @ts-ignore
      const result = await window.frappe.call('erpnext_npdi_suite.api.duplicate_template', {
        template_name: templateName,
      });
      if (result.message && result.message.success) {
        alert(`Plantilla duplicada como "${result.message.new_template_name}".`);
        fetchTemplates(); // Refresh list
      } else {
        alert('Error al duplicar la plantilla.');
      }
    } catch (error) {
      console.error('Duplicate failed:', error);
      alert('Error al duplicar la plantilla.');
    }
  };

  const handleExportCSV = async (templateName: string) => {
    try {
      // @ts-ignore
      const result = await window.frappe.call('erpnext_npdi_suite.api.export_template_csv', {
        template_name: templateName,
      });
      if (result.message && result.message.success) {
        const csv = result.message.csv;
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${templateName}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
      } else {
        alert('Error al exportar la plantilla.');
      }
    } catch (error) {
      console.error('Export CSV failed:', error);
      alert('Error al exportar la plantilla.');
    }
  };

  const handleNewTemplate = () => {
    window.open('/app/project-template/new', '_blank');
  };

  if (loading) {
    return <div className="loading">Cargando plantillas...</div>;
  }

  return (
    <div className="template-list-page">
      <div className="page-header">
        <h1>Plantillas de Proyecto</h1>
        <button className="btn btn-primary" onClick={handleNewTemplate}>
          <Plus size={16} />
          + Nueva Plantilla
        </button>
      </div>
      <p className="page-subheading">
        Selecciona una plantilla para editar o crear un nuevo proyecto basado en ella.
      </p>
      <div className="projects-grid">
        {templates.map((template) => (
          <div className="card template-card" key={template.name}>
            <div className="card-header">
              <span className="badge badge-module">{template.module || 'Core'}</span>
              <h3 className="template-name">{template.name}</h3>
            </div>
            <p className="card-description">{template.description || 'Sin descripción'}</p>
            <div className="card-metrics">
              <span className="metric">
                <Clock size={14} />
                Duración est: {template.durationDays || 0} días
              </span>
              <span className="metric">
                <ListChecks size={14} />
                {template.taskCount || 0} Tareas
              </span>
            </div>
            <div className="card-actions">
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => onEditTemplate(template.name)}
                title="Editar plantilla"
              >
                <Edit3 size={14} />
                Editar
              </button>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => handleDuplicate(template.name)}
                title="Duplicar plantilla"
              >
                <Copy size={14} />
                Duplicar
              </button>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => handleExportCSV(template.name)}
                title="Exportar como CSV"
              >
                <Download size={14} />
                Exportar CSV
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default TemplateListPage;
