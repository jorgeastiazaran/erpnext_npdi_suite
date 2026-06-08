import React, { useState, useEffect, useRef } from 'react';
import { Clock, ListChecks, Plus, Edit3, Copy, Download, Upload } from 'lucide-react';
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      // @ts-ignore
      const result = await window.frappe.call('erpnext_npdi_suite.api.get_template_list');
      setTemplates(result.message?.data || []);
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

  const handleImportCSV = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const newTemplateName = prompt("Ingresa el nombre para esta nueva plantilla:", file.name.replace('.csv', ''));
    if (!newTemplateName) {
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setLoading(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const csvText = e.target?.result as string;
        // @ts-ignore
        const result = await window.frappe.call('erpnext_npdi_suite.api.import_template_csv', {
          template_name: newTemplateName.trim(),
          csv_data: csvText
        });
        
        if (result.message && result.message.success) {
          alert(`Plantilla "${result.message.name}" importada exitosamente.`);
          fetchTemplates();
        } else {
          alert(result.message?.error || "Error al importar CSV.");
          setLoading(false);
        }
      } catch (error) {
        console.error('Import CSV failed:', error);
        alert('Error al procesar el archivo CSV.');
        setLoading(false);
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsText(file);
  };

  const [showNewModal, setShowNewModal] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const handleNewTemplate = () => {
    setShowNewModal(true);
  };

  const submitNewTemplate = async () => {
    if (!newTemplateName.trim()) {
      alert("Por favor ingresa un nombre para la plantilla.");
      return;
    }
    setIsCreating(true);
    try {
      // @ts-ignore
      const result = await window.frappe.call('erpnext_npdi_suite.api.create_empty_template', {
        template_name: newTemplateName.trim()
      });
      if (result.message && result.message.success) {
        setShowNewModal(false);
        setNewTemplateName('');
        onEditTemplate(result.message.name);
      } else {
        alert(result.message?.error || "Error al crear la plantilla.");
      }
    } catch (e: any) {
      alert("Error: " + e.message);
    } finally {
      setIsCreating(false);
    }
  };

  if (loading) {
    return <div className="loading">Cargando plantillas...</div>;
  }

  return (
    <div className="template-list-page">
      <div className="page-header">
        <h1>Plantillas de Proyecto</h1>
        <div style={{ display: 'flex', gap: '10px' }}>
          <input 
            type="file" 
            accept=".csv" 
            style={{ display: 'none' }} 
            ref={fileInputRef} 
            onChange={handleImportCSV} 
          />
          <button className="btn btn-secondary" onClick={() => fileInputRef.current?.click()}>
            <Upload size={16} />
            Importar CSV
          </button>
          <button className="btn btn-primary" onClick={handleNewTemplate}>
            <Plus size={16} />
            + Nueva Plantilla
          </button>
        </div>
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

      {showNewModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <div style={{
            background: 'var(--bg-surface)', padding: '24px', borderRadius: '12px',
            width: '400px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)'
          }}>
            <h3 style={{ marginTop: 0, marginBottom: '16px' }}>Nueva Plantilla</h3>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', fontWeight: 600 }}>Nombre de la Plantilla</label>
            <input
              type="text"
              value={newTemplateName}
              onChange={(e) => setNewTemplateName(e.target.value)}
              placeholder="Ej. Plantilla de Salsas 2026"
              style={{
                width: '100%', padding: '10px', borderRadius: '8px',
                border: '1px solid var(--border)', marginBottom: '24px',
                background: 'var(--bg-surface-2)', color: 'var(--text-primary)'
              }}
              autoFocus
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button className="btn btn-ghost" onClick={() => setShowNewModal(false)} disabled={isCreating}>
                Cancelar
              </button>
              <button className="btn btn-primary" onClick={submitNewTemplate} disabled={isCreating || !newTemplateName.trim()}>
                {isCreating ? 'Creando...' : 'Crear'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TemplateListPage;
