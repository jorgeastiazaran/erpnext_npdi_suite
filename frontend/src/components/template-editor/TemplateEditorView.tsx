import './TemplateEditor.css';

import React, { useState, useEffect, useTransition, useRef } from 'react';


import { Plus, Layers, ChevronRight, ChevronDown, Clock, X, Loader2, LayoutList, Columns2, Link as LinkIcon, Search, Flag, Maximize2, Minimize2 } from 'lucide-react';
import TaskTemplateRow, { durationToDisplay, durationInputTodays } from './TaskTemplateRow';
import GanttView from '../../GanttView';

const DURATION_UNITS = [
  { value: 'days', label: 'Días', multiplier: 1 },
  { value: 'weeks', label: 'Semanas', multiplier: 7 },
  { value: 'months', label: 'Meses', multiplier: 30 },
] as const;

interface TemplateEditorClientProps { template: any; allRoles: any[]; onRefresh?: () => void; }

import { calculateTemplateSchedule } from './scheduler';

function flattenTasks(tasks: any[]): any[] {
  const r: any[] = [];
  for (const t of tasks) { r.push(t); if (t.children) for (const c of t.children) r.push(c); }
  return r;
}

import {
  upsertTaskTemplate,
  deleteTaskTemplate,
  addTemplateTaskDependency,
  removeTemplateTaskDependency,
  addStageTemplateDependency,
  removeStageTemplateDependency,
  getNPDIStages
} from './api_wrappers';

export default function TemplateEditorClient({ template, allRoles, onRefresh }: TemplateEditorClientProps) {
  const tasks = template.tasks || [];
  const allFlatTasks = flattenTasks(tasks);
  const existingStageNames: string[] = Array.from(new Set(allFlatTasks.map((t: any) => t.stageName as string)));

  const [npdiStages, setNpdiStages] = useState<Array<{ name: string; stage_name: string; color?: string; stage_order?: number; is_group?: number }>>([]);
  const [selectedPresetStage, setSelectedPresetStage] = useState('');
  const [isCustomStage, setIsCustomStage] = useState(false);

  useEffect(() => {
    getNPDIStages().then(res => {
      if (res.success && res.stages) {
        setNpdiStages(res.stages);
      }
    });
  }, []);

  
  const isPending = false; const startTransition = (cb: any) => cb();
  const [activeTab, setActiveTab] = useState<'list' | 'gantt'>('list');
  const [isFullscreen, setIsFullscreen] = useState(false);

  const scheduleMap = React.useMemo(() => calculateTemplateSchedule(allFlatTasks), [allFlatTasks]);

  const getStageDurationCPM = (stageTasks: any[]) => {
    if (stageTasks.length === 0) return 0;
    let minStart = Infinity;
    let maxEnd = 0;
    for (const t of stageTasks) {
      const sched = scheduleMap.get(t.id);
      if (!sched) continue;
      if (sched.startDay < minStart) minStart = sched.startDay;
      if (sched.endDay > maxEnd) maxEnd = sched.endDay;
    }
    if (minStart === Infinity) return 0;
    return maxEnd - minStart;
  };

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogContext, setDialogContext] = useState<{ stageName: string; parentId: string | null; roleId: string; isShared: boolean }>({
    stageName: '', parentId: null, roleId: '', isShared: false,
  });
  const [newTask, setNewTask] = useState({ name: '', durationValue: 1, durationUnit: 'days', roleId: '', isShared: false, isMilestone: false });
  const [saving, setSaving] = useState(false);

  // New stage dialog
  const [newStageOpen, setNewStageOpen] = useState(false);
  const [newStageName, setNewStageName] = useState('');

  // Stage dependency search
  const [showStageSearch, setShowStageSearch] = useState<string | null>(null);
  const [stageDepQuery, setStageDepQuery] = useState('');

  // Drag & Drop Visual Dependencies State
  const [dragState, setDragState] = useState<{
    sourceId: string | null;
    startCoords: {x: number, y: number} | null;
    currentCoords: {x: number, y: number} | null;
    hoverTargetId: string | null;
    hoverTargetStage: string | null;
  }>({ sourceId: null, startCoords: null, currentCoords: null, hoverTargetId: null, hoverTargetStage: null });

  const dragRef = useRef(dragState);
  useEffect(() => {
    dragRef.current = dragState;
  }, [dragState]);

  useEffect(() => {
    if (!dragState.sourceId) return;

    const handleMouseMove = (e: MouseEvent) => {
      setDragState(prev => ({ ...prev, currentCoords: { x: e.clientX, y: e.clientY } }));
    };

    const handleMouseUp = async () => {
      const state = dragRef.current;
      if (state.sourceId) {
        if (state.hoverTargetId && state.sourceId !== state.hoverTargetId) {
          // Task to Task - Check hierarchy to prevent circular parent-child dependency
          const getAncestors = (taskId: string): Set<string> => {
            const ancestors = new Set<string>();
            let current = allFlatTasks.find(t => t.id === taskId);
            while (current && current.parentId) {
              ancestors.add(current.parentId);
              current = allFlatTasks.find(t => t.id === current?.parentId);
            }
            return ancestors;
          };
          const sourceAncestors = getAncestors(state.sourceId);
          const targetAncestors = getAncestors(state.hoverTargetId);
          if (sourceAncestors.has(state.hoverTargetId) || targetAncestors.has(state.sourceId)) {
            alert("No se puede crear una dependencia entre una tarea y su subtarea.");
          } else {
            const result = await addTemplateTaskDependency(state.hoverTargetId, state.sourceId, template.id);
            if (result.success) startTransition(() => { if (onRefresh) onRefresh(); });
            else alert(result.error);
          }
        } else if (state.hoverTargetStage) {
          // Task to Stage
          const result = await addStageTemplateDependency(template.id, state.hoverTargetStage, state.sourceId);
          if (result.success) startTransition(() => { if (onRefresh) onRefresh(); });
          else alert(result.error);
        }
      }
      setDragState({ sourceId: null, startCoords: null, currentCoords: null, hoverTargetId: null, hoverTargetStage: null });
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragState.sourceId, template.id]);

  const handleDragStart = (taskId: string, e: React.MouseEvent, coords: {x: number, y: number}) => {
    setDragState({
      sourceId: taskId,
      startCoords: coords,
      currentCoords: { x: e.clientX, y: e.clientY },
      hoverTargetId: null,
      hoverTargetStage: null
    });
  };

  const handleDragEnter = (taskId: string | null) => {
    setDragState(prev => {
      if (prev.sourceId && prev.sourceId !== taskId) {
        return { ...prev, hoverTargetId: taskId, hoverTargetStage: null };
      }
      return prev;
    });
  };

  const handleStageDragEnter = (stageName: string | null) => {
    setDragState(prev => {
      if (prev.sourceId) {
        return { ...prev, hoverTargetStage: stageName, hoverTargetId: null };
      }
      return prev;
    });
  };

  // Collapsed stages
  const [collapsedStages, setCollapsedStages] = useState<Set<string>>(new Set());
  const toggleStage = (s: string) => {
    setCollapsedStages(prev => { const n = new Set(prev); n.has(s) ? n.delete(s) : n.add(s); return n; });
  };

  // Open dialog for adding task to a stage
  const openDialogForStage = (stageName: string, stageTasks: any[]) => {
    const lastTask = stageTasks[stageTasks.length - 1];
    const roleId = lastTask?.roleId?.toString() || '';
    const isShared = lastTask?.isShared ?? false;
    setDialogContext({ stageName, parentId: null, roleId, isShared });
    setNewTask({ name: '', durationValue: 1, durationUnit: 'days', roleId, isShared, isMilestone: false });
    setDialogOpen(true);
  };

  // Open dialog for adding child to a task
  const openDialogForChild = (parentTask: any) => {
    const roleId = parentTask.roleId?.toString() || '';
    setDialogContext({ stageName: parentTask.stageName, parentId: parentTask.id, roleId, isShared: parentTask.isShared ?? false });
    setNewTask({ name: '', durationValue: 1, durationUnit: 'days', roleId, isShared: parentTask.isShared ?? false, isMilestone: false });
    setDialogOpen(true);
  };

  // Open dialog for new stage
  const openNewStageDialog = () => {
    getNPDIStages().then(res => {
      if (res.success && res.stages && res.stages.length > 0) {
        setNpdiStages(res.stages);
        const firstUnused = res.stages.find((s: any) => !existingStageNames.includes(s.name) && !existingStageNames.includes(s.stage_name));
        setSelectedPresetStage(firstUnused ? (firstUnused.name || firstUnused.stage_name) : (res.stages[0]?.name || '1 – IDEA'));
      }
    });
    setNewStageOpen(true);
    const firstUnused = npdiStages.find(s => !existingStageNames.includes(s.name) && !existingStageNames.includes(s.stage_name));
    setSelectedPresetStage(firstUnused ? (firstUnused.name || firstUnused.stage_name) : (npdiStages[0]?.name || '1 – IDEA'));
  };
  const confirmNewStage = () => {
    const finalStage = selectedPresetStage.trim();
    if (!finalStage) return;
    setNewStageOpen(false);
    setDialogContext({ stageName: finalStage, parentId: null, roleId: '', isShared: false });
    setNewTask({ name: '', durationValue: 1, durationUnit: 'days', roleId: '', isShared: false, isMilestone: false });
    setDialogOpen(true);
  };

  const [keepOpen, setKeepOpen] = useState(false);

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTask.name || !newTask.roleId) return;
    setSaving(true);
    const order = (allFlatTasks.length + 1) * 10;
    const result = await upsertTaskTemplate({
      templateId: template.id, name: newTask.name, stageName: dialogContext.stageName,
      order, roleId: newTask.roleId, isMilestone: newTask.isMilestone,
      isShared: newTask.isShared, durationDays: durationInputTodays(newTask.durationValue, newTask.durationUnit),
      durationUnit: newTask.durationUnit, parentId: dialogContext.parentId, module: 'core',
    });
    setSaving(false);
    if (result.success) { 
      // Clear name to allow adding another quickly
      setNewTask(prev => ({ ...prev, name: '' }));
      if (!keepOpen) {
        setDialogOpen(false); 
      }
      startTransition(() => {
        if (onRefresh) onRefresh();
      });
    }
  };

  const handleDeleteTask = async (id: any) => {
    if (confirm('¿Eliminar esta tarea de la plantilla?')) { 
      const res = await deleteTaskTemplate(id, template.id); 
      if (!res?.success) {
        alert(res?.error || 'Error al eliminar la tarea');
      }
      startTransition(() => {
        if (onRefresh) onRefresh();
      });
    }
  };

  const groupedTasks = React.useMemo(() => {
    const map = tasks.reduce((acc: any, task: any) => {
      const stage = task.stageName || '1 – IDEA';
      if (!acc[stage]) acc[stage] = [];
      acc[stage].push(task);
      return acc;
    }, {} as Record<string, any[]>);

    const stageOrderMap = new Map<string, number>();
    npdiStages.forEach((s, idx) => {
      stageOrderMap.set(s.name, s.stage_order ?? (idx * 10));
      if (s.stage_name) stageOrderMap.set(s.stage_name, s.stage_order ?? (idx * 10));
    });

    const sortedEntries = Object.entries(map).sort(([a], [b]) => {
      const orderA = stageOrderMap.get(a) ?? 999;
      const orderB = stageOrderMap.get(b) ?? 999;
      if (orderA !== orderB) return orderA - orderB;
      return a.localeCompare(b);
    });

    return Object.fromEntries(sortedEntries);
  }, [tasks, npdiStages]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* View Switcher */}
      <div style={{ display: 'flex', background: 'var(--bg-surface-2)', padding: '4px', borderRadius: '8px', gap: '4px', alignSelf: 'flex-start', marginBottom: 'var(--space-2)' }}>
        <button 
          className={`btn ${activeTab === 'list' ? 'btn-primary' : 'btn-ghost'}`} 
          style={{ padding: '4px 12px', fontSize: '11px', height: 'auto' }}
          onClick={() => setActiveTab('list')}
        >
          <LayoutList size={14} /> Estructura
        </button>
        <button 
          className={`btn ${activeTab === 'gantt' ? 'btn-primary' : 'btn-ghost'}`} 
          style={{ padding: '4px 12px', fontSize: '11px', height: 'auto' }}
          onClick={() => setActiveTab('gantt')}
        >
          <Columns2 size={14} /> Vista Previa Gantt
        </button>
      </div>

      {activeTab === 'list' ? (
        <div 
          className="template-list-container"
          style={{
            background: isFullscreen ? 'var(--bg-surface)' : 'transparent',
            borderRadius: isFullscreen ? '0' : '12px',
            display: 'flex',
            flexDirection: 'column',
            ...(isFullscreen ? {
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 9999,
              height: '100vh',
            } : {})
          }}
        >
          <div className="list-toolbar" style={{ padding: '8px 12px', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: isFullscreen ? '0' : '12px', borderBottom: isFullscreen ? '1px solid var(--border)' : 'none', background: isFullscreen ? 'var(--bg-surface-2)' : 'transparent' }}>
            <button
              className="btn btn-ghost"
              onClick={() => setIsFullscreen(!isFullscreen)}
              title={isFullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
              style={{ fontSize: '11px', padding: '4px 8px', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              {isFullscreen ? "Salir" : "Pantalla Completa"}
            </button>
          </div>
          <div style={{ flex: 1, overflowY: isFullscreen ? 'auto' : 'visible', padding: isFullscreen ? '16px' : '0', display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
            {Object.keys(groupedTasks).length === 0 ? (
              <div className="card" style={{ padding: 'var(--space-12)', textAlign: 'center', color: 'var(--text-muted)' }}>
            <Layers size={48} style={{ margin: '0 auto var(--space-4)', opacity: 0.2 }} />
            <p>Aún no has definido tareas para esta plantilla.</p>
            <button className="btn btn-primary" style={{ marginTop: 'var(--space-4)' }} onClick={openNewStageDialog}>
              <Plus size={16} /> Crear primera etapa
            </button>
          </div>
        ) : (
          <>
            {Object.entries(groupedTasks).map(([stageName, stageTasks]: [string, any]) => {
              // Detect stage-level dependencies (milestones that ALL tasks in this stage depend on)
              // We use a Map to deduplicate by ID since instances might be different
              const allDepsMap = new Map<number, any>();
              stageTasks.forEach((t: any) => {
                t.dependsOn?.forEach((d: any) => {
                  allDepsMap.set(d.dependsOn.id, d.dependsOn);
                });
              });

              const stageCommonDeps = Array.from(allDepsMap.values()).filter((dep: any) => {
                // Keep only if every task in the stage depends on this task
                return stageTasks.every((t: any) => 
                  t.dependsOn?.some((d: any) => d.dependsOn.id === dep.id)
                );
              });

              const isHovered = dragState.hoverTargetStage === stageName;

              return (
                <div key={stageName} className={`card ${isHovered ? 'drag-target-active' : ''}`} style={{ overflow: 'visible', transition: 'all 200ms' }}>
                  <div 
                    className="template-stage-header" 
                    onMouseEnter={() => handleStageDragEnter(stageName)}
                    onMouseLeave={() => handleStageDragEnter(null)}
                  >
                    <button className="template-stage-toggle" onClick={() => toggleStage(stageName)} type="button">
                      {collapsedStages.has(stageName) ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                      <span style={{ fontWeight: 800, fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{stageName}</span>
                    </button>

                    <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '12px' }}>
                      {/* Stage Dependencies Chips */}
                      {stageCommonDeps.length > 0 && (
                        <div className="template-dep-chips" style={{ marginRight: '12px' }}>
                          {stageCommonDeps.map((dep: any) => (
                            <span key={dep.id} className="template-dep-chip" style={{ background: 'var(--bg-surface-1)', border: '1px solid var(--accent-alpha)' }}>
                              <LinkIcon size={10} style={{ color: 'var(--accent)' }} /> {dep.taskName}
                              <button 
                                className="template-dep-chip-remove" 
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  const res = await removeStageTemplateDependency(template.id, stageName, dep.id);
                                  if (res.success) startTransition(() => { if (onRefresh) onRefresh(); });
                                }}
                              >
                                <X size={10} />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}

                          <span className="template-duration-badge" style={{ fontSize: '10px' }}>
                            <Clock size={10} />
                            {(() => { const d = getStageDurationCPM(stageTasks); if (d >= 30) return `~${Math.round(d/30)} mes${Math.round(d/30)!==1?'es':''}`; if (d >= 7) return `~${Math.round(d/7)} sem`; return `${d} días`; })()}
                          </span>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 500 }}>
                            {stageTasks.length} tarea{stageTasks.length !== 1 ? 's' : ''}
                          </span>
                          
                          {/* Manual Add Dependency Button for Stage */}
                          <div style={{ position: 'relative' }}>
                            <button 
                              className="btn-icon" 
                              style={{ color: 'var(--accent)' }} 
                              title="Añadir dependencia a toda la etapa"
                              onClick={(e) => {
                                e.stopPropagation();
                                // We'll reuse the existing search dialog logic or similar
                                setShowStageSearch(stageName === showStageSearch ? null : stageName);
                                setStageDepQuery('');
                              }}
                            >
                              <Plus size={14} />
                            </button>
                            
                            {showStageSearch === stageName && (
                              <div className="template-dep-dropdown" style={{ position: 'absolute', top: '100%', right: 0, zIndex: 100, marginTop: '8px', width: '280px' }} onClick={e => e.stopPropagation()}>
                                <div className="template-dep-search-box">
                                  <Search size={12} style={{ color: 'var(--text-muted)' }} />
                                  <input 
                                    className="template-dep-search-input" 
                                    placeholder="Buscar hito (milestone)..." 
                                    value={stageDepQuery} 
                                    onChange={e => setStageDepQuery(e.target.value)} 
                                    autoFocus 
                                  />
                                </div>
                                <div className="template-dep-results">
                                  {allFlatTasks
                                    .filter(t => t.isMilestone && !stageTasks.some((st: any) => st.id === t.id))
                                    .filter(t => !stageDepQuery || t.taskName.toLowerCase().includes(stageDepQuery.toLowerCase()))
                                    .slice(0, 10)
                                    .map(t => (
                                      <button 
                                        key={t.id} 
                                        className="template-dep-result-item" 
                                        onClick={async () => {
                                          const res = await addStageTemplateDependency(template.id, stageName, t.id);
                                          if (res.success) {
                                            setShowStageSearch(null);
                                            startTransition(() => { if (onRefresh) onRefresh(); });
                                          } else alert(res.error);
                                        }}
                                      >
                                        <div style={{ flex: 1 }}>
                                          <div style={{ fontWeight: 600 }}>{t.taskName}</div>
                                          <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{t.stageName}</div>
                                        </div>
                                        <Flag size={10} style={{ color: 'var(--status-idea-text)' }} />
                                      </button>
                                    ))
                                  }
                                  {allFlatTasks.filter(t => t.isMilestone).length === 0 && (
                                    <div style={{ padding: 'var(--space-3)', fontSize: '12px', color: 'var(--text-muted)' }}>No hay hitos definidos.</div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Drop node for Stage */}
                          <div 
                            className={`template-task-drag-node ${isHovered ? 'active' : ''}`}
                            style={{ position: 'relative', marginLeft: '8px', background: isHovered ? 'var(--accent)' : 'var(--border)' }}
                          >
                            <div className="inner-dot"></div>
                          </div>
                        </div>
                      </div>
                  {!collapsedStages.has(stageName) && (
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      {stageTasks.map((task: any) => (
                        <TaskTemplateRow key={task.id} task={task} allFlatTasks={allFlatTasks} allRoles={allRoles}
                          existingStageNames={existingStageNames} availableStages={npdiStages} templateId={template.id} scheduleMap={scheduleMap}
                          onDelete={handleDeleteTask} onAddChild={openDialogForChild} depth={0}
                          onDragStart={handleDragStart} onDragEnter={handleDragEnter} onRefresh={onRefresh} />
                      ))}
                    </div>
                  )}
                  {/* Add task zone at bottom of stage */}
                  <div className="template-add-zone">
                    <div className="template-add-zone-trigger" />
                    <button className="template-add-zone-btn" onClick={() => openDialogForStage(stageName, stageTasks)} type="button">
                      <Plus size={11} /> Tarea en {stageName}
                    </button>
                  </div>
                </div>
              );
            })}

            <button className="template-new-stage-btn" onClick={openNewStageDialog} type="button">
              <Plus size={16} /> Crear nueva etapa
            </button>
          </>
        )}
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <GanttView 
            tasks={allFlatTasks.map(t => {
              const sched = scheduleMap.get(t.id);
              const start = new Date();
              start.setHours(0,0,0,0);
              const startDate = new Date(start);
              startDate.setDate(startDate.getDate() + (sched?.startDay || 0));
              const endDate = new Date(start);
              endDate.setDate(endDate.getDate() + (sched?.endDay || 1));

              return {
                ...t,
                name: t.taskName,
                planStartDate: startDate,
                planEndDate: endDate,
                slack: sched?.slack || 0,
                isCriticalPath: sched?.slack === 0
              };
            })}
            onDateChange={async (id, start, end) => {
              const task = allFlatTasks.find(t => t.id === id);
              if (!task) return { success: false };
              const duration = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
              const res = await upsertTaskTemplate({
                ...task,
                templateId: template.id,
                durationDays: duration || 1,
              });
              if (res.success) {
                startTransition(() => {
                  if (onRefresh) onRefresh();
                });
              }
              return res;
            }}
          />
          <div style={{ padding: 'var(--space-4)', fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center' }}>
            💡 Esta es una simulación basada en las duraciones y dependencias definidas. Las fechas reales se calcularán al instanciar el proyecto.
          </div>
        </div>
      )}

      {/* SVG Overlay for Drag & Drop Visual Dependencies */}
      {dragState.sourceId && dragState.startCoords && dragState.currentCoords && (
        <svg
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            pointerEvents: 'none',
            zIndex: 9999
          }}
        >
          <path
            d={`M ${dragState.startCoords.x} ${dragState.startCoords.y} C ${dragState.startCoords.x + 100} ${dragState.startCoords.y}, ${dragState.currentCoords.x - 100} ${dragState.currentCoords.y}, ${dragState.currentCoords.x} ${dragState.currentCoords.y}`}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="3"
            strokeDasharray="6 6"
            className="animate-dash"
          />
          <circle cx={dragState.startCoords.x} cy={dragState.startCoords.y} r="5" fill="var(--accent)" />
          <circle cx={dragState.currentCoords.x} cy={dragState.currentCoords.y} r="5" fill="var(--accent)" />
        </svg>
      )}

      {/* ── New Stage Dialog (NPDI Stage Link) ── */}
      {newStageOpen && (
        <div className="template-dialog-backdrop" onClick={() => setNewStageOpen(false)}>
          <div className="template-dialog" style={{ width: '420px' }} onClick={e => e.stopPropagation()}>
            <div className="template-dialog-header">
              <div>
                <div className="template-dialog-title">Añadir Etapa a la Plantilla</div>
                <div className="template-dialog-subtitle">Selecciona una Etapa NPDI existente para incorporar a esta plantilla</div>
              </div>
              <button className="btn-icon" onClick={() => setNewStageOpen(false)}><X size={18} /></button>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div>
                <label className="template-form-label">Etapa NPDI (Link a NPDI Stage)</label>
                <select 
                  className="input" 
                  value={selectedPresetStage} 
                  onChange={e => setSelectedPresetStage(e.target.value)}
                  autoFocus
                >
                  {npdiStages.length === 0 ? (
                    <option value="">Cargando etapas...</option>
                  ) : (
                    npdiStages.map(s => {
                      const stageKey = s.name;
                      const isUsed = existingStageNames.includes(stageKey);
                      return (
                        <option key={stageKey} value={stageKey}>
                          {stageKey} {isUsed ? '— (Ya agregada en plantilla)' : ''}
                        </option>
                      );
                    })
                  )}
                </select>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    DocType: <strong>NPDI Stage</strong>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      if ((window as any).frappe?.new_doc) {
                        (window as any).frappe.new_doc('NPDI Stage');
                      } else {
                        window.open('/app/npdi-stage', '_blank');
                      }
                    }}
                    style={{ fontSize: '11px', color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                  >
                    + Crear nueva en NPDI Stage
                  </button>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end', marginTop: 'var(--space-4)' }}>
              <button className="btn btn-ghost" onClick={() => setNewStageOpen(false)}>Cancelar</button>
              <button 
                className="btn btn-primary" 
                onClick={confirmNewStage} 
                disabled={!selectedPresetStage}
              >
                Continuar <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Task Dialog ── */}
      {dialogOpen && (
        <div className="template-dialog-backdrop" onClick={() => setDialogOpen(false)}>
          <div className="template-dialog" onClick={e => e.stopPropagation()}>
            <div className="template-dialog-header">
              <div>
                <div className="template-dialog-title">Añadir Tarea</div>
                <div className="template-dialog-subtitle">
                  {dialogContext.parentId
                    ? `Subtarea de: ${allFlatTasks.find(t => t.id === dialogContext.parentId)?.taskName || ''}`
                    : `Etapa: ${dialogContext.stageName}`}
                </div>
              </div>
              <button className="btn-icon" onClick={() => setDialogOpen(false)}><X size={18} /></button>
            </div>

            <form onSubmit={handleAddTask} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div>
                <label className="template-form-label">Etapa NPDI</label>
                <select 
                  className="input" 
                  value={dialogContext.stageName} 
                  onChange={e => setDialogContext(prev => ({ ...prev, stageName: e.target.value }))}
                >
                  {npdiStages && npdiStages.length > 0 ? (
                    npdiStages.map(s => (
                      <option key={s.name} value={s.stage_name || s.name}>{s.stage_name || s.name}</option>
                    ))
                  ) : (
                    <option value={dialogContext.stageName}>{dialogContext.stageName}</option>
                  )}
                </select>
              </div>

              <div>
                <label className="template-form-label">Nombre de la Tarea</label>
                <input className="input" value={newTask.name} onChange={e => setNewTask({...newTask, name: e.target.value})}
                  placeholder="¿Qué se debe hacer?" required autoFocus />
              </div>

              <div>
                <label className="template-form-label">Duración</label>
                <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                  <input type="number" min={1} value={newTask.durationValue} className="input" style={{ width: '80px' }}
                    onChange={e => setNewTask({...newTask, durationValue: Math.max(1, parseInt(e.target.value) || 1)})} required />
                  <select className="input" value={newTask.durationUnit} onChange={e => setNewTask({...newTask, durationUnit: e.target.value})} style={{ flex: 1 }}>
                    {DURATION_UNITS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="template-form-label">Rol Responsable</label>
                <select className="input" value={newTask.roleId} onChange={e => setNewTask({...newTask, roleId: e.target.value})} required>
                  <option value="">Seleccionar rol...</option>
                  {allRoles.map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>

              <div className="template-flags">
                <label className="template-flag-label">
                  <input type="checkbox" checked={newTask.isShared} onChange={e => setNewTask({...newTask, isShared: e.target.checked})} />
                  <div><div style={{ fontWeight: 600 }}>Tarea Compartida</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Se sincroniza entre todas las variantes.</div></div>
                </label>
                <label className="template-flag-label">
                  <input type="checkbox" checked={newTask.isMilestone} onChange={e => setNewTask({...newTask, isMilestone: e.target.checked})} />
                  <div><div style={{ fontWeight: 600 }}>Es un Hito (Milestone)</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Marca un punto crítico en el proyecto.</div></div>
                </label>
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-secondary)', cursor: 'pointer', padding: 'var(--space-2) 0' }}>
                <input type="checkbox" checked={keepOpen} onChange={e => setKeepOpen(e.target.checked)} />
                Seguir añadiendo tareas sin cerrar esta ventana
              </label>

              <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', gap: 'var(--space-2)' }} disabled={saving}>
                {saving ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
                Añadir al Blueprint
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
