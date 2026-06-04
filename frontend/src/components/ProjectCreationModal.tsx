import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  X, Calendar, Check, Loader2, RefreshCcw, Clock, Eye,
  LayoutTemplate, User as UserIcon, ChevronRight
} from 'lucide-react';
import { runPreviewScheduler } from '../lib/previewScheduler';
import type { PreviewTaskInput, PreviewSchedulerResult } from '../lib/previewScheduler';
import UserAutocomplete from './UserAutocomplete';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProjectCreationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProjectCreated: (projectName: string) => void;
}

interface TemplateOption {
  name: string;
  description: string;
  project_type: string;
  taskCount: number;
  totalDurationDays: number;
}

interface UserOption {
  email: string;
  full_name: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ProjectCreationModal({
  isOpen,
  onClose,
  onProjectCreated,
}: ProjectCreationModalProps) {
  // Step 1 state
  const [step, setStep] = useState<1 | 2>(1);
  const [projectName, setProjectName] = useState('');
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    return d.toISOString().split('T')[0];
  });
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [selectedOwner, setSelectedOwner] = useState('');

  // Data
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [templateDetail, setTemplateDetail] = useState<any>(null);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Step 2 state
  const [taskConfigs, setTaskConfigs] = useState<Record<string, { isSkipped: boolean; durationDays: number }>>({});
  const [schedulerResult, setSchedulerResult] = useState<PreviewSchedulerResult | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ── Fetch templates and users on open ───────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    setLoadingTemplates(true);

    // @ts-ignore
    if (window.frappe) {
      // @ts-ignore
      frappe.call({
        method: 'erpnext_npdi_suite.api.get_template_list',
        callback: (r: any) => {
          if (r.message && r.message.success) {
            setTemplates(r.message.data || []);
          }
          setLoadingTemplates(false);
        },
      });

      // @ts-ignore
      frappe.call({
        method: 'erpnext_npdi_suite.api.get_frappe_users_for_project',
        callback: (r: any) => {
          if (r.message && r.message.success) {
            setUsers(r.message.data || []);
          }
        },
      });
    }
  }, [isOpen]);

  // ── Fetch template detail when template changes ─────────────────────────
  useEffect(() => {
    if (!selectedTemplate) {
      setTemplateDetail(null);
      return;
    }
    setLoadingDetail(true);
    // @ts-ignore
    if (window.frappe) {
      // @ts-ignore
      frappe.call({
        method: 'erpnext_npdi_suite.api.get_template_editor_data',
        args: { template: selectedTemplate },
        callback: (r: any) => {
          if (r.message && r.message.success) {
            setTemplateDetail(r.message.data);
          }
          setLoadingDetail(false);
        },
      });
    }
  }, [selectedTemplate]);

  // ── Flatten tasks helper ────────────────────────────────────────────────
  const flatTasks = useMemo(() => {
    if (!templateDetail?.tasks) return [];
    const flat: any[] = [];
    const extract = (tasks: any[]) => {
      for (const t of tasks) {
        flat.push(t);
        if (t.children && t.children.length > 0) extract(t.children);
      }
    };
    extract(templateDetail.tasks);
    return flat;
  }, [templateDetail]);

  // ── Run scheduler ───────────────────────────────────────────────────────
  const calculateSchedule = useCallback(
    (configs = taskConfigs) => {
      if (!flatTasks.length || !startDate) return;

      const schedulerInputs: PreviewTaskInput[] = flatTasks.map((t: any) => {
        const config = configs[t.id];
        return {
          id: t.id,
          durationDays: config?.durationDays ?? t.durationDays,
          dependencies: (t.dependsOn || []).map((d: any) =>
            typeof d === 'string' ? d : d.dependsOn?.id || d.id
          ),
          parentId: t.parentId || null,
          isSkipped: config?.isSkipped ?? false,
        };
      });

      const result = runPreviewScheduler(new Date(startDate), schedulerInputs);
      setSchedulerResult(result);
    },
    [flatTasks, startDate, taskConfigs]
  );

  // Recalculate when entering step 2
  useEffect(() => {
    if (step === 2 && flatTasks.length > 0) {
      calculateSchedule(taskConfigs);
    }
  }, [step, flatTasks, startDate]);

  // ── Handlers ────────────────────────────────────────────────────────────

  const handleToggleSkip = (taskId: string) => {
    const flatTasksMap = new Map<string, any>();
    const parentMap = new Map<string, string>();
    const extract = (tasks: any[], parentId?: string) => {
      tasks.forEach((t: any) => {
        flatTasksMap.set(t.id, t);
        if (parentId) parentMap.set(t.id, parentId);
        if (t.children) extract(t.children, t.id);
      });
    };
    extract(templateDetail.tasks);

    let newConfigs = { ...taskConfigs };

    const isTaskSkipped = (tId: string) => {
      if (newConfigs[tId]?.isSkipped !== undefined) return newConfigs[tId].isSkipped;
      return false;
    };

    const current = isTaskSkipped(taskId);
    const newIsSkipped = !current;

    const setSkipped = (id: string, skipped: boolean) => {
      const t = flatTasksMap.get(id);
      newConfigs[id] = {
        isSkipped: skipped,
        durationDays: newConfigs[id]?.durationDays ?? t?.durationDays ?? 1,
      };
    };

    setSkipped(taskId, newIsSkipped);

    if (newIsSkipped) {
      // Deactivate descendants
      const deactivateDescendants = (id: string) => {
        const task = flatTasksMap.get(id);
        if (task?.children) {
          task.children.forEach((c: any) => {
            setSkipped(c.id, true);
            deactivateDescendants(c.id);
          });
        }
      };
      deactivateDescendants(taskId);

      // Check ancestors: if all siblings skipped, skip parent
      const checkAncestors = (id: string) => {
        const pId = parentMap.get(id);
        if (!pId) return;
        const parent = flatTasksMap.get(pId);
        if (parent?.children) {
          const allSkipped = parent.children.every((c: any) => isTaskSkipped(c.id));
          if (allSkipped) {
            setSkipped(pId, true);
            checkAncestors(pId);
          }
        }
      };
      checkAncestors(taskId);
    } else {
      // Activate descendants
      const activateDescendants = (id: string) => {
        const task = flatTasksMap.get(id);
        if (task?.children) {
          task.children.forEach((c: any) => {
            setSkipped(c.id, false);
            activateDescendants(c.id);
          });
        }
      };
      activateDescendants(taskId);

      // Activate ancestors
      const activateAncestors = (id: string) => {
        const pId = parentMap.get(id);
        if (!pId) return;
        setSkipped(pId, false);
        activateAncestors(pId);
      };
      activateAncestors(taskId);
    }

    setTaskConfigs(newConfigs);
    calculateSchedule(newConfigs);
  };

  const handleDurationChange = (taskId: string, newDuration: number) => {
    if (isNaN(newDuration) || newDuration < 1) return;
    const newConfigs = {
      ...taskConfigs,
      [taskId]: { ...taskConfigs[taskId], durationDays: newDuration, isSkipped: taskConfigs[taskId]?.isSkipped ?? false },
    };
    setTaskConfigs(newConfigs);
    calculateSchedule(newConfigs);
  };

  const handlePreview = () => {
    if (!projectName.trim()) {
      alert('Por favor ingresa un nombre para el proyecto.');
      return;
    }
    if (!startDate) {
      alert('Por favor selecciona una fecha de inicio.');
      return;
    }
    if (!selectedTemplate) {
      alert('Por favor selecciona una plantilla de proyecto.');
      return;
    }
    if (!templateDetail) {
      alert('Cargando detalles de la plantilla, por favor espera...');
      return;
    }
    setStep(2);
  };

  const handleSubmit = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);

    // Build task overrides
    const overrides = flatTasks.map((t: any) => {
      const config = taskConfigs[t.id];
      return {
        templateTaskRowName: t.id,
        durationDays: config?.durationDays ?? t.durationDays,
        isSkipped: config?.isSkipped ?? false,
      };
    });

    // @ts-ignore
    if (window.frappe) {
      // @ts-ignore
      frappe.call({
        method: 'erpnext_npdi_suite.api.create_project_from_template',
        args: {
          project_name: projectName.trim(),
          template_name: selectedTemplate,
          start_date: startDate,
          owner: selectedOwner || undefined,
          task_overrides: JSON.stringify(overrides),
        },
        callback: (r: any) => {
          setIsSubmitting(false);
          if (r.message && r.message.success) {
            // @ts-ignore
            frappe.show_alert &&
              // @ts-ignore
              frappe.show_alert({
                message: `Proyecto "${r.message.project_name}" creado exitosamente.`,
                indicator: 'green',
              });
            onProjectCreated(r.message.project_name);
            handleClose();
          } else {
            alert(r.message?.error || 'Error al crear el proyecto.');
          }
        },
      });
    }
  };

  const handleClose = () => {
    setStep(1);
    setProjectName('');
    setSelectedTemplate('');
    setSelectedOwner('');
    setTemplateDetail(null);
    setTaskConfigs({});
    setSchedulerResult(null);
    onClose();
  };

  // ── Grouped tasks for Step 2 ────────────────────────────────────────────
  const groupedTasks = useMemo(() => {
    if (!templateDetail?.tasks) return {};
    return templateDetail.tasks.reduce((acc: any, task: any) => {
      const stage = task.stageName || 'Sin Etapa';
      if (!acc[stage]) acc[stage] = [];
      acc[stage].push(task);
      return acc;
    }, {});
  }, [templateDetail?.tasks]);

  // ── Render ──────────────────────────────────────────────────────────────

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.6)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: step === 1 ? '640px' : '1000px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: 'var(--bg-surface)',
          borderRadius: '12px',
          boxShadow: '0 25px 50px rgba(0,0,0,0.25)',
          overflow: 'hidden',
          transition: 'max-width 0.3s ease',
        }}
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '4px' }}>
              {step === 1 ? 'Nuevo Proyecto NPDI' : 'Confirmar Plan de Proyecto'}
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
              {step === 1
                ? 'Configura el lanzamiento, plantilla y responsable.'
                : 'Revisa las fechas calculadas y tareas antes de crear el proyecto.'}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {step === 2 && (
              <button
                className="btn btn-ghost"
                onClick={() => setStep(1)}
                style={{ fontSize: '12px', padding: '4px 12px' }}
              >
                ← Volver
              </button>
            )}
            <button
              onClick={handleClose}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '4px',
                color: 'var(--text-muted)',
              }}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* ── Step 1: Configuration Form ────────────────────────────────── */}
        {step === 1 && (
          <div style={{ padding: '24px', flex: 1, overflowY: 'auto' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
              {/* Project Name */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Nombre del Proyecto
                </label>
                <input
                  type="text"
                  placeholder="Ej. Takumi Ichi - Salsas"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    fontSize: '14px',
                    backgroundColor: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                    outline: 'none',
                  }}
                />
              </div>

              {/* Start Date */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  <Calendar size={12} style={{ marginRight: '4px', verticalAlign: '-1px' }} />
                  Fecha de Inicio
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    fontSize: '14px',
                    backgroundColor: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                    outline: 'none',
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              {/* Template */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  <LayoutTemplate size={12} style={{ marginRight: '4px', verticalAlign: '-1px' }} />
                  Plantilla de Proyecto
                </label>
                <select
                  value={selectedTemplate}
                  onChange={(e) => setSelectedTemplate(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    fontSize: '14px',
                    backgroundColor: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                    outline: 'none',
                  }}
                >
                  <option value="">Selecciona una plantilla...</option>
                  {templates.map((t) => (
                    <option key={t.name} value={t.name}>
                      {t.name} {t.taskCount ? `(${t.taskCount} tareas)` : ''}
                    </option>
                  ))}
                </select>
                {loadingDetail && (
                  <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', fontSize: '12px' }}>
                    <Loader2 size={14} className="animate-spin" /> Cargando plantilla...
                  </div>
                )}
              </div>

              {/* Owner */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  <UserIcon size={12} style={{ marginRight: '4px', verticalAlign: '-1px' }} />
                  Responsable del Proyecto
                </label>
                <UserAutocomplete
                  users={users}
                  value={selectedOwner}
                  onChange={setSelectedOwner}
                />
              </div>
            </div>

            {/* Template info card */}
            {templateDetail && (
              <div
                style={{
                  marginTop: '24px',
                  padding: '16px',
                  backgroundColor: 'var(--accent-muted, rgba(99,102,241,0.08))',
                  border: '1px solid var(--accent, #6366f1)',
                  borderRadius: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  fontSize: '13px',
                }}
              >
                <LayoutTemplate size={20} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                <div>
                  <strong>{templateDetail.template?.name}</strong>
                  <span style={{ color: 'var(--text-muted)', marginLeft: '8px' }}>
                    {flatTasks.length} tareas
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Step 2: Task Preview ─────────────────────────────────────── */}
        {step === 2 && (
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '0',
              backgroundColor: 'var(--bg-surface-2, #f8f9fa)',
            }}
          >
            {schedulerResult ? (
              <div style={{ margin: '16px', borderRadius: '10px', overflow: 'hidden', border: '1px solid var(--border)', backgroundColor: 'var(--bg-surface)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border)', backgroundColor: 'var(--bg-surface-2, #f8f9fa)' }}>
                      <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tarea</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Módulo</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Duración</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Inicio</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Fin</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', width: '70px' }}>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(groupedTasks).map(([stageName, tasks]: [string, any]) => (
                      <React.Fragment key={stageName}>
                        {/* Stage header row */}
                        <tr style={{ backgroundColor: 'var(--bg-surface-2, #f0f0f0)', borderBottom: '2px solid var(--border)' }}>
                          <td colSpan={6} style={{ padding: '10px 16px', fontWeight: 700, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <span>{stageName}</span>
                              {(() => {
                                const taskIds: string[] = [];
                                const extractIds = (ts: any[]) => {
                                  ts.forEach((t: any) => {
                                    taskIds.push(t.id);
                                    if (t.children) extractIds(t.children);
                                  });
                                };
                                extractIds(tasks);

                                const results = taskIds
                                  .map((id) => schedulerResult.tasks.get(id))
                                  .filter(Boolean) as any[];
                                if (results.length === 0) return null;

                                const stageStart = new Date(Math.min(...results.map((r: any) => r.planStartDate.getTime())));
                                const stageEnd = new Date(Math.max(...results.map((r: any) => r.planEndDate.getTime())));
                                const diff = Math.max(1, Math.round((stageEnd.getTime() - stageStart.getTime()) / (1000 * 60 * 60 * 24)));

                                return (
                                  <div style={{ display: 'flex', gap: '6px' }}>
                                    <span style={{ fontSize: '10px', padding: '2px 8px', background: 'var(--bg-surface)', borderRadius: '4px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                      <Calendar size={10} />
                                      {stageStart.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })} - {stageEnd.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}
                                    </span>
                                    <span style={{ fontSize: '10px', padding: '2px 8px', background: 'var(--bg-surface)', borderRadius: '4px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                      <Clock size={10} /> {diff} días
                                    </span>
                                  </div>
                                );
                              })()}
                            </div>
                          </td>
                        </tr>
                        {/* Task rows */}
                        {renderTaskRows(tasks, 0)}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
                <Loader2 className="animate-spin" size={32} style={{ color: 'var(--text-muted)' }} />
              </div>
            )}
          </div>
        )}

        {/* ── Footer ───────────────────────────────────────────────────── */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: 'var(--bg-surface)',
          }}
        >
          {step === 2 && schedulerResult ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Calendar size={18} style={{ color: 'var(--text-muted)' }} />
              <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Fecha estimada de finalización:</span>
              <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
                {schedulerResult.estimatedEndDate.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}
              </span>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: '4px' }}>
                ({schedulerResult.totalDurationDays} días)
              </span>
            </div>
          ) : (
            <div />
          )}

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              className="btn btn-ghost"
              onClick={handleClose}
              disabled={isSubmitting}
              style={{ padding: '8px 20px', fontSize: '13px' }}
            >
              Cancelar
            </button>

            {step === 1 ? (
              <button
                className="btn btn-primary"
                onClick={handlePreview}
                disabled={!projectName.trim() || !startDate || !selectedTemplate || !templateDetail || loadingDetail}
                style={{ padding: '8px 24px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Eye size={16} />
                Previsualizar
                <ChevronRight size={14} />
              </button>
            ) : (
              <button
                className="btn btn-primary"
                onClick={handleSubmit}
                disabled={isSubmitting}
                style={{ padding: '8px 24px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                Confirmar y Crear
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  // ── Recursive task row renderer ─────────────────────────────────────────
  function renderTaskRows(tasks: any[], level: number): React.ReactNode {
    return tasks.map((t: any) => {
      const config = taskConfigs[t.id];
      const isSkipped = config?.isSkipped ?? false;
      const scheduled = schedulerResult?.tasks.get(t.id);
      const isParent = scheduled?.isParent ?? (t.children && t.children.length > 0);

      const currentDuration = config?.durationDays ?? t.durationDays;

      const rowStyle: React.CSSProperties = isSkipped
        ? { opacity: 0.45, backgroundColor: 'var(--bg-surface-2, #f8f8f8)' }
        : {};

      const moduleColors: Record<string, string> = {
        core: 'var(--text-muted)',
        formula: '#059669',
        pack: '#d97706',
        brand: '#7c3aed',
      };

      return (
        <React.Fragment key={t.id}>
          <tr style={{ borderBottom: '1px solid var(--border)', ...rowStyle }}>
            {/* Task Name */}
            <td style={{ padding: '10px 16px', paddingLeft: `${16 + level * 20}px` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {isParent && <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>▾</span>}
                {t.isMilestone && <span style={{ fontSize: '12px' }}>🏁</span>}
                <span style={{ textDecoration: isSkipped ? 'line-through' : 'none', fontWeight: isParent ? 600 : 400 }}>
                  {t.taskName}
                </span>
              </div>
            </td>

            {/* Module */}
            <td style={{ padding: '10px 16px' }}>
              <span
                style={{
                  fontSize: '10px',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  backgroundColor: `${moduleColors[t.module] || 'var(--text-muted)'}15`,
                  color: moduleColors[t.module] || 'var(--text-muted)',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                }}
              >
                {t.module}
              </span>
            </td>

            {/* Duration */}
            <td style={{ padding: '10px 16px' }}>
              {isParent ? (
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  {scheduled
                    ? `${Math.max(1, Math.round((scheduled.planEndDate.getTime() - scheduled.planStartDate.getTime()) / (1000 * 60 * 60 * 24)))} días`
                    : '-'}
                </span>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <input
                    type="number"
                    min="1"
                    value={currentDuration}
                    onChange={(e) => handleDurationChange(t.id, parseInt(e.target.value))}
                    disabled={isSkipped}
                    style={{
                      width: '55px',
                      padding: '4px 8px',
                      fontSize: '12px',
                      border: '1px solid var(--border)',
                      borderRadius: '6px',
                      backgroundColor: isSkipped ? 'var(--bg-surface-2)' : 'var(--bg-surface)',
                      color: 'var(--text-primary)',
                      outline: 'none',
                    }}
                  />
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>días</span>
                </div>
              )}
            </td>

            {/* Start Date */}
            <td style={{ padding: '10px 16px', fontSize: '12px', color: 'var(--text-muted)' }}>
              {scheduled?.planStartDate
                ? scheduled.planStartDate.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })
                : '-'}
            </td>

            {/* End Date */}
            <td style={{ padding: '10px 16px', fontSize: '12px', color: 'var(--text-muted)' }}>
              {scheduled?.planEndDate
                ? scheduled.planEndDate.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })
                : '-'}
            </td>

            {/* Action */}
            <td style={{ padding: '10px 16px' }}>
              <button
                onClick={() => handleToggleSkip(t.id)}
                title={isSkipped ? 'Restaurar tarea' : 'Omitir tarea'}
                style={{
                  background: 'none',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  padding: '4px 8px',
                  color: isSkipped ? 'var(--accent)' : 'var(--text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {isSkipped ? <RefreshCcw size={14} /> : <X size={14} />}
              </button>
            </td>
          </tr>
          {t.children && t.children.length > 0 && renderTaskRows(t.children, level + 1)}
        </React.Fragment>
      );
    });
  }
}
