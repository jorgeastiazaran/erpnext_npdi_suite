import React, { useState, useRef, useEffect, useTransition } from 'react';
import { upsertTaskTemplate, addTemplateTaskDependency, removeTemplateTaskDependency } from './api_wrappers';
import { Plus, Trash2, Flag, Link as LinkIcon, Shield, Clock, X, Search, CornerDownRight, Loader2, Pencil, Check, ChevronDown as ExpandIcon, Circle } from 'lucide-react';

const DURATION_UNITS = [
  { value: 'days', label: 'Días', multiplier: 1 },
  { value: 'weeks', label: 'Semanas', multiplier: 7 },
  { value: 'months', label: 'Meses', multiplier: 30 },
] as const;

export function durationToDisplay(days: number, unit: string): string {
  const u = DURATION_UNITS.find(u => u.value === unit);
  if (!u) return `${days}d`;
  const val = Math.round(days / u.multiplier);
  const labels: Record<string,string> = { days:'día', weeks:'sem', months:'mes' };
  const plural: Record<string,string> = { days:'días', weeks:'sem', months:'meses' };
  return `${val} ${val === 1 ? labels[unit] : plural[unit]}`;
}

export function durationInputTodays(value: number, unit: string): number {
  const u = DURATION_UNITS.find(u => u.value === unit);
  return value * (u?.multiplier ?? 1);
}

function daysToDurationInput(days: number, unit: string): number {
  const u = DURATION_UNITS.find(u => u.value === unit);
  return Math.round(days / (u?.multiplier ?? 1));
}

export default function TaskTemplateRow({ task, allFlatTasks, allRoles, existingStageNames, templateId, scheduleMap, onDelete, onAddChild, depth, onDragStart, onDragEnter, onDrop, onRefresh }: {
  task: any; allFlatTasks: any[]; allRoles: any[]; existingStageNames: string[];
  templateId: string; scheduleMap: Map<string, {startDay: number, endDay: number, slack: number, isCriticalPath: boolean}>; onDelete: (id: string) => void; onAddChild: (parentTask: any) => void; depth: number;
  onDragStart?: (taskId: string, e: React.MouseEvent, coords: {x: number, y: number}) => void;
  onDragEnter?: (taskId: string) => void;
  onDrop?: (taskId: string) => void;
  onRefresh?: () => void;
}) {
  const [isPending, startTransition] = useTransition();

  const [depQuery, setDepQuery] = useState('');
  const [showDepSearch, setShowDepSearch] = useState(false);
  const [addingDep, setAddingDep] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [childrenCollapsed, setChildrenCollapsed] = useState(false);
  const [desc, setDesc] = useState(task.description || '');
  const [descSaving, setDescSaving] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Optimistic dependencies
  const [optimisticDeps, setOptimisticDeps] = useState<any[]>(task.dependsOn || []);
  
  // Sync state if task changes from props (when server data comes back)
  useEffect(() => {
    setOptimisticDeps(task.dependsOn || []);
  }, [task.dependsOn]);

  const [isEditing, setIsEditing] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editData, setEditData] = useState({
    name: task.taskName, stageName: task.stageName,
    durationValue: daysToDurationInput(task.durationDays, task.durationUnit),
    durationUnit: task.durationUnit || 'days', roleId: task.roleId?.toString() || '',
    module: task.module || 'core', isShared: task.isShared, isMilestone: task.isMilestone,
    isLaunchMilestone: task.isLaunchMilestone || false,
  });

  const handleSaveEdit = async () => {
    setEditSaving(true);
    const result = await upsertTaskTemplate({
      id: task.id, templateId, name: editData.name, stageName: editData.stageName,
      order: task.order, roleId: String(editData.roleId), isMilestone: editData.isMilestone,
      isShared: editData.isShared, durationDays: durationInputTodays(editData.durationValue, editData.durationUnit),
      durationUnit: editData.durationUnit, parentId: task.parentId, module: editData.module,
      isLaunchMilestone: editData.isLaunchMilestone,
    });
    setEditSaving(false);
    if (result.success) {
      setIsEditing(false);
      if (onRefresh) onRefresh();
    } else {
      alert(result.error);
    }
  };

  const handleSaveDesc = async () => {
    setDescSaving(true);
    await upsertTaskTemplate({
      id: task.id, templateId, name: task.taskName, stageName: task.stageName,
      order: task.order, roleId: task.roleId, isMilestone: task.isMilestone,
      isShared: task.isShared, durationDays: task.durationDays, durationUnit: task.durationUnit,
      parentId: task.parentId, module: task.module, description: desc || null,
    });
    setDescSaving(false);
    if (onRefresh) onRefresh();
  };

  useEffect(() => {
    function h(e: MouseEvent) { if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowDepSearch(false); }
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const existingDepIds = new Set(optimisticDeps.map((d: any) => d.dependsOn.id) ?? []);
  const searchResults = allFlatTasks.filter((t: any) => {
    if (t.id === task.id || existingDepIds.has(t.id)) return false;
    return !depQuery || t.taskName.toLowerCase().includes(depQuery.toLowerCase());
  });

  const handleAddDep = async (depTask: any) => { 
    setAddingDep(true); 
    
    // Optimistic update
    const tempId = Math.random() * -1000;
    setOptimisticDeps([...optimisticDeps, { id: tempId.toString(), dependsOn: depTask }]);
    
    const result = await addTemplateTaskDependency(task.id, depTask.id, templateId); 
    
    setAddingDep(false); 
    setShowDepSearch(false); 
    setDepQuery(''); 
    
    if (result.success) {
      if (onRefresh) onRefresh();
    } else {
      setOptimisticDeps(optimisticDeps.filter(d => d.id !== tempId.toString()));
      alert(result.error);
    }
  };

  const handleRemoveDep = async (depRecordId: string, depTaskId: string) => { 
    // Optimistic remove
    setOptimisticDeps(optimisticDeps.filter(d => d.dependsOn?.id !== depTaskId && d.dependsOn !== depTaskId));
    
    const result = await removeTemplateTaskDependency(depRecordId, templateId, task.id, depTaskId); 
    if (result && !result.success) {
      alert(result.error || 'Error al eliminar dependencia');
    }
    if (onRefresh) onRefresh();
  };

  const hasChildren = task.children && task.children.length > 0;
  
  // Use CPM calculated duration instead of simple sum
  let childrenDuration = null;
  if (hasChildren) {
    const sched = scheduleMap.get(task.id);
    childrenDuration = sched ? sched.endDay - sched.startDay : 0;
  }
  const depCount = optimisticDeps.length || 0;
  const roleName = task.responsibleRole?.name || 'Sin rol';

  const sched = scheduleMap.get(task.id);
  const isCritical = sched?.isCriticalPath || false;

  const [isInlineEditingDuration, setIsInlineEditingDuration] = useState(false);
  const [inlineDurationValue, setInlineDurationValue] = useState(daysToDurationInput(task.durationDays, task.durationUnit));
  const [inlineDurationUnit, setInlineDurationUnit] = useState(task.durationUnit || 'days');
  const [isInlineSaving, setIsInlineSaving] = useState(false);

  const handleInlineDurationSave = async () => {
    setIsInlineSaving(true);
    const result = await upsertTaskTemplate({
      id: task.id, templateId, name: task.taskName, stageName: task.stageName,
      order: task.order, roleId: task.roleId, isMilestone: task.isMilestone,
      isShared: task.isShared, durationDays: durationInputTodays(inlineDurationValue, inlineDurationUnit),
      durationUnit: inlineDurationUnit, parentId: task.parentId, module: task.module,
      description: task.description
    });
    setIsInlineSaving(false);
    if (result.success) {
      setIsInlineEditingDuration(false);
      if (onRefresh) onRefresh();
    } else {
      alert(result.error);
    }
  };

  const rowRef = useRef<HTMLDivElement>(null);
  return (
    <>
      {/* Compact row */}
      <div 
        ref={rowRef}
        className={`template-task-row ${isCritical ? 'task-critical' : ''}`} 
        style={{ paddingLeft: `calc(var(--space-4) + ${depth * 24}px)` }}
        onMouseEnter={() => { if (onDragEnter) onDragEnter(task.id); }}
        onMouseLeave={() => { if (onDragEnter) onDragEnter(null as any); }}
      >
        {depth > 0 && <CornerDownRight size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />}

        {isEditing ? (
          <div style={{ flex: 1 }}>
            <div className="template-edit-form">
              <div className="template-edit-row">
                <div style={{ flex: 1 }}><label className="template-form-label">Nombre</label>
                  <input className="input" value={editData.name} onChange={e => setEditData({...editData, name: e.target.value})} />
                </div>
                <div style={{ width: '100px' }}><label className="template-form-label">Duración</label>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <input type="number" min={1} className="input" style={{ width: '50px' }} value={editData.durationValue}
                      onChange={e => setEditData({...editData, durationValue: Math.max(1, parseInt(e.target.value) || 1)})} />
                    <select className="input" value={editData.durationUnit} onChange={e => setEditData({...editData, durationUnit: e.target.value})}>
                      {DURATION_UNITS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                    </select>
                  </div>
                </div>
              </div>
              <div className="template-edit-row">
                <div style={{ flex: 1 }}><label className="template-form-label">Rol</label>
                  <select className="input" value={editData.roleId} onChange={e => setEditData({...editData, roleId: e.target.value})}>
                    <option value="">Sin rol</option>
                    {allRoles.map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </div>
                <div style={{ gap: '12px', display: 'flex', alignItems: 'center' }}>
                  <label className="template-flag-label" style={{ fontSize: '12px' }}>
                    <input type="checkbox" checked={editData.isShared} onChange={e => setEditData({...editData, isShared: e.target.checked})} /> Compartida
                  </label>
                  <label className="template-flag-label" style={{ fontSize: '12px' }}>
                    <input type="checkbox" checked={editData.isMilestone} onChange={e => setEditData({...editData, isMilestone: e.target.checked})} /> Hito
                  </label>
                  <label className="template-flag-label" style={{ fontSize: '12px' }}>
                    <input type="checkbox" checked={editData.isLaunchMilestone} onChange={e => setEditData({...editData, isLaunchMilestone: e.target.checked})} /> Hito Lanzamiento
                  </label>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                <button className="btn btn-primary" style={{ fontSize: '12px', padding: '4px 12px' }} onClick={handleSaveEdit} disabled={editSaving}>
                  {editSaving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Guardar
                </button>
                <button className="btn btn-ghost" style={{ fontSize: '12px', padding: '4px 12px' }} onClick={() => setIsEditing(false)}>Cancelar</button>
              </div>
              
              {/* Dependencias - Inline in Edit Mode */}
              <div style={{ marginTop: 'var(--space-2)', paddingTop: 'var(--space-2)', borderTop: '1px solid var(--border)' }}>
                <label className="template-form-label" style={{ marginBottom: '4px' }}>Dependencias</label>
                {optimisticDeps && optimisticDeps.length > 0 ? (
                  <div className="template-dep-chips">
                    {optimisticDeps.map((dep: any) => (
                      <span key={dep.id} className="template-dep-chip">
                        {dep.dependsOn?.taskName || dep.dependsOnName || 'Tarea'}
                        <button className="template-dep-chip-remove" onClick={() => handleRemoveDep(dep.id, dep.dependsOn?.id)} title="Quitar"><X size={10} /></button>
                      </span>
                    ))}
                  </div>
                ) : (
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Sin dependencias</span>
                )}
                <div ref={searchRef} style={{ position: 'relative', marginTop: '6px' }}>
                  <button className="template-add-dep-btn" onClick={() => setShowDepSearch(!showDepSearch)} type="button">
                    <Plus size={11} /> Añadir Dependencia
                  </button>
                  {showDepSearch && (
                    <div className="template-dep-dropdown" style={{ position: 'absolute', top: '100%', left: 0, zIndex: 50, marginTop: '4px' }}>
                      <div className="template-dep-search-box">
                        <Search size={12} style={{ color: 'var(--text-muted)' }} />
                        <input className="template-dep-search-input" placeholder="Buscar tarea..." value={depQuery} onChange={e => setDepQuery(e.target.value)} autoFocus />
                      </div>
                      <div className="template-dep-results">
                        {searchResults.length === 0 ? (
                          <div style={{ padding: 'var(--space-3)', fontSize: '12px', color: 'var(--text-muted)' }}>No se encontraron tareas.</div>
                        ) : searchResults.slice(0, 15).map((t: any) => (
                          <button key={t.id} className="template-dep-result-item" onClick={() => handleAddDep(t)} disabled={addingDep}>
                            <span style={{ flex: 1 }}>{t.taskName}</span>
                            <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{t.stageName}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Expand toggle */}
            <button onClick={() => setExpanded(!expanded)} className="btn-icon" style={{ color: 'var(--text-muted)', padding: '2px', flexShrink: 0 }} title="Detalles">
              <ExpandIcon size={14} style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 150ms' }} />
            </button>
            {/* Name */}
            <span className="template-task-name" style={{ flex: 1, minWidth: 0 }}>
              {isCritical && <span style={{ color: 'var(--status-blocked-text)', marginRight: '4px' }}>🔥</span>}
              {task.taskName}
            </span>
            {/* Badges */}
            <div className="template-task-badges">
              {task.isLaunchMilestone && <span className="badge badge-launch" style={{ fontSize: '9px', background: 'var(--accent)', color: 'white' }}>Lanzamiento</span>}
              {!task.isLaunchMilestone && task.isMilestone && <span className="badge badge-idea" style={{ fontSize: '9px' }}>Hito</span>}
              {depCount > 0 && (
                <span 
                  onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
                  style={{ fontSize: '9px', color: 'var(--accent)', fontWeight: 600, cursor: 'pointer', background: 'rgba(79, 140, 255, 0.1)', padding: '2px 6px', borderRadius: '4px' }}
                  title="Ver y editar dependencias"
                >
                  🔗{depCount}
                </span>
              )}
              {hasChildren && (
                <button 
                  onClick={(e) => { e.stopPropagation(); setChildrenCollapsed(!childrenCollapsed); }}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', fontSize: '9px', color: 'var(--text-muted)', background: 'var(--bg-surface-2)', padding: '2px 6px', borderRadius: '4px', cursor: 'pointer', border: '1px solid var(--border)' }}
                >
                  <ExpandIcon size={10} style={{ transform: childrenCollapsed ? 'rotate(-90deg)' : 'rotate(0)', transition: 'transform 150ms' }} />
                  {task.children.length} subtarea{task.children.length !== 1 ? 's' : ''}
                </button>
              )}
            </div>
            {/* Info */}
            <div className="template-task-info">
              <span className="template-task-info-item"><Shield size={11} /> {roleName}</span>
              {task.isShared ? (
                <span className="template-task-info-item" style={{ color: 'var(--accent)', fontWeight: 600 }}><LinkIcon size={11} /> Comp.</span>
              ) : (
                <span className="template-task-info-item">Variante</span>
              )}
              
              {isInlineEditingDuration ? (
                <div className="template-duration-badge inline-edit" style={{ display: 'flex', gap: '2px', alignItems: 'center', padding: '0 4px' }}>
                  <input 
                    type="number" 
                    min={1} 
                    className="input" 
                    style={{ width: '35px', height: '18px', fontSize: '10px', padding: '0 2px', background: 'transparent', border: 'none' }} 
                    value={inlineDurationValue}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleInlineDurationSave();
                      if (e.key === 'Escape') setIsInlineEditingDuration(false);
                    }}
                    onChange={e => setInlineDurationValue(Math.max(1, parseInt(e.target.value) || 1))} 
                  />
                  <select 
                    className="input" 
                    style={{ width: '45px', height: '18px', fontSize: '10px', padding: '0', background: 'transparent', border: 'none' }} 
                    value={inlineDurationUnit}
                    onChange={e => setInlineDurationUnit(e.target.value)}
                  >
                    {DURATION_UNITS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                  </select>
                  {isInlineSaving ? (
                    <Loader2 size={10} className="animate-spin" />
                  ) : (
                    <Check size={10} style={{ color: 'var(--status-dev-text)', cursor: 'pointer' }} onClick={handleInlineDurationSave} />
                  )}
                </div>
              ) : (
                <span 
                  className="template-task-info-item template-duration-badge" 
                  onDoubleClick={() => {
                    if (!hasChildren) {
                      setIsInlineEditingDuration(true);
                    }
                  }}
                  title={hasChildren ? "Duración calculada por subtareas" : "Doble clic para editar duración"}
                  style={{ cursor: hasChildren ? 'default' : 'pointer' }}
                >
                  <Clock size={10} />
                  {hasChildren ? durationToDisplay(childrenDuration!, 'days') + ' (hijos)' : durationToDisplay(task.durationDays, task.durationUnit)}
                </span>
              )}
            </div>
            {/* Actions (hover) */}
            <div className="template-task-actions">
              <button onClick={() => onAddChild(task)} className="btn-icon" style={{ color: 'var(--accent)' }} title="Añadir subtarea"><Plus size={14} /></button>
              <button onClick={() => setIsEditing(true)} className="btn-icon" style={{ color: 'var(--text-muted)' }} title="Editar"><Pencil size={14} /></button>
              <button onClick={() => onDelete(task.id)} className="btn-icon" style={{ color: 'var(--status-concept-text)' }} title="Eliminar"><Trash2 size={14} /></button>
              
              {/* Drag Handle Node for Visual Connections */}
              <div
                className="template-task-drag-node"
                title="Arrastrar para conectar dependencia"
                onMouseDown={(e) => {
                  e.preventDefault(); // prevent text selection
                  const rect = e.currentTarget.getBoundingClientRect();
                  if (onDragStart) onDragStart(task.id, e, { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
                }}
              >
                <div className="inner-dot"></div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Expanded details */}
      {expanded && !isEditing && (
        <div className="template-task-details" style={{ paddingLeft: `calc(var(--space-4) + ${depth * 24 + 28}px)` }}>
          {/* Description */}
          <div>
            <label className="template-form-label" style={{ marginBottom: '4px' }}>Descripción</label>
            <textarea className="template-task-desc-input" rows={2} placeholder="Añadir descripción de la tarea..."
              value={desc} onChange={e => setDesc(e.target.value)} onBlur={handleSaveDesc} />
            {descSaving && <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Guardando...</span>}
          </div>
          {/* Dependencies */}
          <div>
            <label className="template-form-label" style={{ marginBottom: '4px' }}>Dependencias</label>
            {optimisticDeps && optimisticDeps.length > 0 ? (
              <div className="template-dep-chips">
                {optimisticDeps.map((dep: any) => (
                  <span key={dep.id} className="template-dep-chip">
                    {dep.dependsOn?.taskName || dep.dependsOnName || 'Tarea'}
                    <button className="template-dep-chip-remove" onClick={() => handleRemoveDep(dep.id, dep.dependsOn?.id)} title="Quitar"><X size={10} /></button>
                  </span>
                ))}
              </div>
            ) : (
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Sin dependencias</span>
            )}
            <div ref={searchRef} style={{ position: 'relative', marginTop: '6px' }}>
              <button className="template-add-dep-btn" onClick={() => setShowDepSearch(!showDepSearch)} type="button">
                <Plus size={11} /> Dependencia
              </button>
              {showDepSearch && (
                <div className="template-dep-dropdown" style={{ position: 'absolute', top: '100%', left: 0, zIndex: 50, marginTop: '4px' }}>
                  <div className="template-dep-search-box">
                    <Search size={12} style={{ color: 'var(--text-muted)' }} />
                    <input className="template-dep-search-input" placeholder="Buscar tarea..." value={depQuery} onChange={e => setDepQuery(e.target.value)} autoFocus />
                  </div>
                  <div className="template-dep-results">
                    {searchResults.length === 0 ? (
                      <div style={{ padding: 'var(--space-3)', fontSize: '12px', color: 'var(--text-muted)' }}>No se encontraron tareas.</div>
                    ) : searchResults.slice(0, 15).map((t: any) => (
                      <button key={t.id} className="template-dep-result-item" onClick={() => handleAddDep(t)} disabled={addingDep}>
                        <span style={{ flex: 1 }}>{t.taskName}</span>
                        <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{t.stageName}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Children */}
      {hasChildren && !childrenCollapsed && task.children.map((child: any) => (
        <TaskTemplateRow key={child.id}
          task={{ ...child, dependsOn: child.dependsOn ?? [] }}
          allFlatTasks={allFlatTasks} allRoles={allRoles} existingStageNames={existingStageNames}
          templateId={templateId} scheduleMap={scheduleMap} onDelete={onDelete} onAddChild={onAddChild} depth={depth + 1}
          onDragStart={onDragStart} onDragEnter={onDragEnter} onDrop={onDrop} onRefresh={onRefresh} />
      ))}

      {/* Add child zone (at end of each task) */}
      {depth === 0 && (
        <div className="template-add-zone" style={{ marginLeft: `calc(var(--space-4) + 24px)` }}>
          <div className="template-add-zone-trigger" />
          <button className="template-add-zone-btn" onClick={() => onAddChild(task)} type="button">
            <Plus size={11} /> Subtarea
          </button>
        </div>
      )}
    </>
  );
}
