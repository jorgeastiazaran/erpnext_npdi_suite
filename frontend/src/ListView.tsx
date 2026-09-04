import React, { useMemo, useState, useRef, useEffect } from 'react';
import { 
  ChevronRight, 
  ChevronDown, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  MoreVertical,
  Flag,
  User as UserIcon,
  Link as LinkIcon,
  Plus, 
  Trash2,
  Calendar,
  Maximize2,
  Minimize2
} from 'lucide-react';

interface ListViewProps {
  tasks: any[];
  onTaskClick?: (taskId: string) => void;
  onStatusChange?: (taskId: string, status: string) => Promise<any>;
  onAddQuickTask?: (
    stageName: string,
    parentTaskId: string | null,
    inheritedData?: {
      dependencies?: string[];
      startDate?: string;
      npdiModule?: string;
    }
  ) => void;
  onDeleteQuickTask?: (taskId: string) => void;
  onAddTaskDependency?: (taskId: string, dependsOnId: string) => Promise<any>;
  onSkipTask?: (taskId: string, isSkip: boolean) => Promise<any>;
  onUpdateTask?: (taskId: string, data: any) => Promise<any>;
}

export default function ListView({ 
  tasks, 
  onTaskClick, 
  onStatusChange, 
  onAddQuickTask, 
  onDeleteQuickTask,
  onAddTaskDependency,
  onSkipTask,
  onUpdateTask
}: ListViewProps) {

  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [collapsedParents, setCollapsedParents] = useState<Set<string>>(new Set());
  const [collapsedStages, setCollapsedStages] = useState<Set<string>>(new Set());
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  // Depth-level expand state per stage: 0 = all collapsed, Infinity = all expanded
  const [stageExpandDepths, setStageExpandDepths] = useState<Record<string, number>>({});

  // ── Drag-to-connect Visual Dependencies ─────────────────────────────────
  const [dragState, setDragState] = useState<{
    sourceId: string | null;
    startCoords: {x: number, y: number} | null;
    currentCoords: {x: number, y: number} | null;
    hoverTargetId: string | null;
  }>({ sourceId: null, startCoords: null, currentCoords: null, hoverTargetId: null });

  const dragRef = useRef(dragState);
  useEffect(() => { dragRef.current = dragState; }, [dragState]);

  useEffect(() => {
    if (!dragState.sourceId) return;

    const handleMouseMove = (e: MouseEvent) => {
      setDragState(prev => ({ ...prev, currentCoords: { x: e.clientX, y: e.clientY } }));
    };

    const handleMouseUp = async () => {
      const state = dragRef.current;
      if (state.sourceId && state.hoverTargetId && state.sourceId !== state.hoverTargetId) {
        // sourceId -> hoverTargetId
        if (onAddTaskDependency) {
          const result = await onAddTaskDependency(state.hoverTargetId, state.sourceId);
          if (!result?.success) {
            alert(result?.error || 'Error al crear dependencia');
          }
        }
      }
      setDragState({ sourceId: null, startCoords: null, currentCoords: null, hoverTargetId: null });
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragState.sourceId, onAddTaskDependency]);

  const normalizeStatus = (status?: string): string => {
    if (!status) return 'Pending';
    const s = status.toLowerCase();
    if (s === 'open' || s === 'pending') return 'Pending';
    if (s === 'working' || s === 'in progress') return 'In Progress';
    if (s === 'pending review' || s === 'awaiting approval') return 'Awaiting Approval';
    if (s === 'completed') return 'Completed';
    if (s === 'overdue' || s === 'blocked') return 'Blocked';
    if (s === 'cancelled' || s === 'skipped') return 'Cancelled';
    return status;
  };

  const handleDragStart = (taskId: string, e: React.MouseEvent, coords: {x: number, y: number}) => {
    e.preventDefault();
    setDragState({ sourceId: taskId, startCoords: coords, currentCoords: { x: e.clientX, y: e.clientY }, hoverTargetId: null });
  };

  const handleDragEnter = (taskId: string | null) => {
    setDragState(prev => {
      if (prev.sourceId && prev.sourceId !== taskId) {
        return { ...prev, hoverTargetId: taskId };
      }
      return prev;
    });
  };

  const getTaskDepth = React.useCallback((taskId: string, allFlatTasks: any[]): number => {
    let depth = 0;
    let current = allFlatTasks.find((t: any) => t.id === taskId);
    const visited = new Set<string>();
    while (current && current.parentTaskId && !visited.has(current.id)) {
      visited.add(current.id);
      depth++;
      current = allFlatTasks.find((t: any) => t.id === current.parentTaskId);
    }
    return depth;
  }, []);

  const getMaxDepth = React.useCallback((stageTasks: any[]): number => {
    if (stageTasks.length === 0) return 0;
    return Math.max(...stageTasks.map((t: any) => getTaskDepth(t.id, stageTasks)));
  }, [getTaskDepth]);

  const applyDepthToStage = React.useCallback((stageTasks: any[], expandDepth: number) => {
    setCollapsedParents(prev => {
      const next = new Set(prev);
      stageTasks.forEach((task: any) => {
        const hasChildren = stageTasks.some((t: any) => t.parentTaskId === task.id);
        if (!hasChildren) return;
        const taskDepth = getTaskDepth(task.id, stageTasks);
        if (taskDepth >= expandDepth) {
          next.add(task.id);
        } else {
          next.delete(task.id);
        }
      });
      return next;
    });
  }, [getTaskDepth]);

  const handleExpandDepth = React.useCallback((stageName: string, stageTasks: any[], direction: 1 | -1) => {
    const maxDepth = getMaxDepth(stageTasks);
    const current = stageExpandDepths[stageName] ?? maxDepth;
    const next = Math.min(maxDepth, Math.max(0, current + direction));
    setStageExpandDepths(prev => ({ ...prev, [stageName]: next }));
    applyDepthToStage(stageTasks, next);
  }, [stageExpandDepths, getMaxDepth, applyDepthToStage]);

  const activeTasks = React.useMemo(() => tasks.filter((t: any) => !t.isDeleted) || [], [tasks]);

  const groupedTasks = React.useMemo(() => activeTasks.reduce((acc: any, task: any) => {
    const stage = task.stageName || 'General';
    if (!acc[stage]) {
      acc[stage] = [];
    }
    acc[stage].push(task);
    return acc;
  }, {}), [activeTasks]);

  const globalChildrenByParent = React.useMemo(() => {
    return activeTasks.reduce((acc: any, t: any) => {
      if (t.parentTaskId) {
        if (!acc[t.parentTaskId]) acc[t.parentTaskId] = [];
        acc[t.parentTaskId].push(t);
      }
      return acc;
    }, {});
  }, [activeTasks]);

  const handleStatusChangeSafe = async (taskId: string, newStatus: string) => {
    if (!onStatusChange) return;
    setUpdatingTaskId(taskId);
    await onStatusChange(taskId, newStatus);
    setUpdatingTaskId(null);
  };

  const handleSkipTaskSafe = async (taskId: string, skip: boolean) => {
    if (!onSkipTask) return;
    setUpdatingTaskId(taskId);
    await onSkipTask(taskId, skip);
    setUpdatingTaskId(null);
  };

  const handleDurationBlur = async (task: any, newDuration: number) => {
    setEditingDurationId(null);
    if (newDuration === task.durationDays || isNaN(newDuration) || newDuration < 0) return;
    if (onUpdateTask) {
      setUpdatingTaskId(task.id);
      await onUpdateTask(task.id, { duration_days: newDuration });
      setUpdatingTaskId(null);
    }
  };

  const toggleParent = (taskId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCollapsedParents(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  };

  const handleToggleStage = (stageName: string) => {
    setCollapsedStages(prev => {
      const next = new Set(prev);
      if (next.has(stageName)) next.delete(stageName);
      else next.add(stageName);
      return next;
    });
  };

  const renderTask = (task: any, depth = 0, children: any[] = []) => {
    // Basic properties mapping
    const isCritical = Boolean(task.isCritical || task.npdi_cpm_is_critical || (task.slack !== undefined && task.slack === 0));
    const slack = task.slack ?? task.npdi_cpm_slack ?? 0;
    const currentStatus = normalizeStatus(task.status);
    
    const now = new Date();
    now.setHours(0,0,0,0);
    const planEnd = task.planEndDate ? new Date(task.planEndDate) : new Date();
    planEnd.setHours(0,0,0,0);
    const isOverdue = currentStatus !== 'Completed' && !task.isSkipped && planEnd < now;
    const overdueDays = isOverdue ? Math.round((now.getTime() - planEnd.getTime()) / (1000 * 60 * 60 * 24)) : 0;

    const hasChildren = children.length > 0;
    const isCollapsed = collapsedParents.has(task.id);

    return (
      <React.Fragment key={task.id}>
        <div
          className={`task-row ${updatingTaskId === task.id ? 'opacity-50' : ''} ${task.isSkipped ? 'task-skipped' : ''} ${currentStatus === 'Completed' ? 'task-completed' : ''} ${isCritical && !task.isSkipped && currentStatus !== 'Completed' ? (isOverdue ? 'task-overdue-critical' : 'task-critical') : ''} ${dragState.hoverTargetId === task.id && dragState.sourceId !== task.id ? 'drag-dep-target' : ''}`}
          onClick={() => { setSelectedTaskId(task.id); onTaskClick?.(task.id); }}
          onMouseEnter={() => handleDragEnter(task.id)}
          onMouseLeave={() => handleDragEnter(null)}
          style={{ 
            cursor: 'pointer', 
            paddingLeft: `calc(var(--space-4) + ${depth * 28}px)`,
            borderLeft: dragState.hoverTargetId === task.id && dragState.sourceId !== task.id
              ? '5px solid var(--accent)'
              : (currentStatus === 'In Progress' ? '5px solid var(--accent)' : 
                (currentStatus === 'Blocked' ? '5px solid var(--status-blocked-text)' : '5px solid transparent')),
            background: dragState.hoverTargetId === task.id && dragState.sourceId !== task.id
              ? 'rgba(79, 140, 255, 0.08)'
              : (hasChildren && !isCollapsed ? 'var(--bg-surface-2)' : (currentStatus === 'In Progress' ? 'rgba(79, 140, 255, 0.05)' : undefined)),
            outline: dragState.hoverTargetId === task.id && dragState.sourceId !== task.id ? '1.5px dashed var(--accent)' : undefined,
            transition: 'background 0.15s, outline 0.15s',
            position: 'relative'
          }}
        >
          {/* Vertical connecting line for children */}
          {depth > 0 && (
            <div style={{
              position: 'absolute',
              left: `calc(${depth * 28}px - 14px)`,
              top: 0,
              bottom: task.id === children[children.length-1]?.id ? '50%' : 0,
              width: '1px',
              background: 'var(--border)',
              zIndex: 1
            }} />
          )}

          <div className="task-main" style={{ gap: '12px' }}>
            {depth > 0 && (
              <ChevronRight 
                size={14} 
                style={{ 
                  color: 'var(--text-muted)', 
                  transform: 'rotate(0deg)', 
                  flexShrink: 0,
                  opacity: 0.5
                }} 
              />
            )}
            {task.isMilestone && (
              <Flag size={14} style={{ color: isOverdue ? 'var(--status-blocked-text)' : '#f59e0b', flexShrink: 0, marginTop: '2px' }} />
            )}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span className="task-name" style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '8px',
                fontWeight: depth === 0 ? 700 : 500,
                fontSize: depth === 0 ? '14px' : '13px',
                color: depth === 0 ? 'var(--text-primary)' : 'var(--text-secondary)'
              }}>
                {task.name}
                <span style={{ color: 'var(--text-muted)', fontSize: '10px', fontWeight: 500 }}>({task.role?.name || task.npdiResponsibleRole || 'Rol no definido'})</span>
                
                {task.isFixed && (
                  <span title="Fecha de inicio anclada manualmente" style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', padding: '2px 6px', background: 'rgba(245, 158, 11, 0.1)', borderRadius: '10px', fontSize: '10px', fontWeight: 600, color: '#d97706' }}>
                    📌 Fijada
                  </span>
                )}
                {isOverdue && (
                  <span title="Tarea retrasada" style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', padding: '2px 6px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '10px', fontSize: '10px', fontWeight: 700, color: '#ef4444' }}>
                    ⚠️ {overdueDays}d retraso
                  </span>
                )}
                {task.isSkipped && (
                  <span style={{ padding: '2px 6px', background: 'var(--bg-surface-2)', borderRadius: '4px', fontSize: '9px', fontWeight: 600, color: 'var(--text-muted)' }}>
                    Omitida
                  </span>
                )}
                {isCritical && !task.isSkipped && task.status !== 'Completed' && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', padding: '2px 6px', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '4px', fontSize: '9px', fontWeight: 600, color: 'var(--status-blocked-text)' }}>
                    🔥 Ruta Crítica
                  </span>
                )}
                {hasChildren && (
                  <button 
                    onClick={(e) => toggleParent(task.id, e)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', fontSize: '9px', color: 'var(--text-muted)', background: 'var(--bg-surface-2)', padding: '2px 6px', borderRadius: '4px', cursor: 'pointer', border: '1px solid var(--border)' }}
                  >
                    <ChevronDown size={10} style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0)', transition: 'transform 150ms' }} />
                    {children.length} subtarea{children.length !== 1 ? 's' : ''}
                  </button>
                )}
                {task.isContextual && (
                  <span style={{ padding: '2px 6px', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '4px', fontSize: '9px', fontWeight: 600, color: 'var(--status-blocked-text)' }}>
                    Ad-hoc
                  </span>
                )}
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  {!task.isMilestone && (
                    <button 
                      className="btn btn-ghost p-1 h-auto" 
                      onClick={(e) => { e.stopPropagation(); onAddQuickTask?.(task.stageName, task.id); }}
                      title="Agregar sub-tarea"
                    >
                      <Plus size={12} />
                    </button>
                  )}
                  {task.isContextual && (
                    <button 
                      className="btn btn-ghost p-1 h-auto" 
                      onClick={(e) => { e.stopPropagation(); onDeleteQuickTask?.(task.id); }}
                      style={{ color: '#ef4444' }}
                      title="Eliminar tarea"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                  {/* Drag Handle Node for Visual Dependency Connection */}
                  <div
                    className="template-task-drag-node"
                    title="Arrastra hasta otra tarea para crear una dependencia"
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      const rect = e.currentTarget.getBoundingClientRect();
                      handleDragStart(task.id, e, { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
                    }}
                  >
                    <div className="inner-dot" />
                  </div>
                </div>
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px', fontSize: '10px' }}>
                {isOverdue ? (
                  <span style={{ color: 'var(--status-blocked-text)', fontWeight: 600 }}>Vencida por {overdueDays} día{overdueDays !== 1 ? 's' : ''}</span>
                ) : (
                  <span style={{ color: 'var(--text-muted)' }}>
                    <span style={{ fontSize: '11px' }}>
                      {(() => {
                        const start = new Date(task.planStartDate);
                        const end = new Date(task.planEndDate);
                        const f = (d: Date) => {
                          const day = d.getDate().toString().padStart(2, '0');
                          const month = d.toLocaleDateString('es-ES', { month: 'short' }).replace('.', '');
                          const year = d.getFullYear().toString().substring(2);
                          return `${day}-${month}-${year}`;
                        };
                        return `${f(start)} — ${f(end)}`;
                      })()}
                    </span>
                    <span style={{ marginLeft: '8px', color: 'var(--accent)', fontWeight: 600 }}>
                      ({task.durationDays || (Math.round((new Date(task.planEndDate).getTime() - new Date(task.planStartDate).getTime()) / (1000 * 60 * 60 * 24)) + 1)} días)
                    </span>
                  </span>
                )}
                {!isCritical && !task.isSkipped && task.status !== 'Completed' && slack > 0 && (
                  <span style={{ color: 'var(--status-idea-text)' }}>• Holgura: {slack} día{slack !== 1 ? 's' : ''}</span>
                )}
              </div>
            </div>
            {task.isMilestone && <span className="task-milestone">Hito</span>}
          </div>

          <div className="task-actions-cell">
            {/* Responsible User */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '120px' }}>
              <div className="sidebar-user-avatar" style={{ width: '24px', height: '24px', fontSize: '9px', background: 'var(--bg-surface-2)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                {task.assignedTo?.substring(0, 2) || <UserIcon size={12} />}
              </div>
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{task.assignedTo || 'Sin asignar'}</span>
            </div>

            {/* Status Toggle */}
            {!task.isSkipped ? (
              <div className="status-toggle">
                {['Pending', 'In Progress', 'Awaiting Approval', 'Completed', 'Blocked'].map((status) => (
                  <button 
                    key={status}
                    title={status === 'Pending' ? 'Pendiente' : 
                           status === 'In Progress' ? 'En curso' : 
                           status === 'Awaiting Approval' ? 'Esperando Aprobación' : 
                           status === 'Completed' ? 'Completado' : 'Bloqueado'}
                    className={`status-btn ${currentStatus === status ? `active ${status.toLowerCase().replace(' ', '-')}` : ''}`}
                    onClick={(e) => { e.stopPropagation(); handleStatusChangeSafe(task.id, status); }}
                  >
                    {status === 'Pending' ? 'Pendiente' : 
                     status === 'In Progress' ? 'En curso' : 
                     status === 'Awaiting Approval' ? 'Esperando Aprobación' : 
                     status === 'Completed' ? 'Completado' : 'Bloqueado'}
                  </button>
                ))}
              </div>
            ) : (
              <button 
                className="btn btn-ghost" 
                style={{ fontSize: '11px', padding: '4px 12px', border: '1px solid var(--border)' }}
                onClick={(e) => { e.stopPropagation(); handleSkipTaskSafe(task.id, false); }}
              >
                Restaurar Tarea
              </button>
            )}
            
            <button className="btn-icon" onClick={(e) => { e.stopPropagation(); setSelectedTaskId(task.id); onTaskClick?.(task.id); }}>
              <MoreVertical size={14} />
            </button>
          </div>
        </div>
        {/* Render children if not collapsed */}
        {hasChildren && !isCollapsed && (
          <div className="nested-task-container" style={{ borderLeft: '1px solid var(--border)', marginLeft: `calc(${depth * 28}px + 14px)` }}>
            {children.map(child => renderTask(child, depth + 1, globalChildrenByParent[child.id] || []))}
          </div>
        )}
      </React.Fragment>
    );
  };

  return (
    <div 
      className="list-container"
      style={{
        background: 'var(--bg-surface)', 
        borderRadius: isFullscreen ? '0' : '12px', 
        border: isFullscreen ? 'none' : '1px solid var(--border)', 
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
      <div className="list-toolbar" style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', background: 'var(--bg-surface-2)', alignItems: 'center' }}>
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
      <div className="task-list" style={{ flex: 1, overflowY: 'auto' }}>
      {groupedTasks && Object.entries(groupedTasks).map(([stageName, tasksInStage]: [string, any]) => {
        const completedCount = tasksInStage.filter((t: any) => t.status === 'Completed').length;
        const totalCount = tasksInStage.length;
        const topLevelTasks = tasksInStage.filter((t: any) => !t.parentTaskId);
        const isCollapsed = collapsedStages.has(stageName);

        // Depth controls — only relevant if stage has parent tasks
        const stageHasParents = tasksInStage.some((t: any) => tasksInStage.some((c: any) => c.parentTaskId === t.id));
        const maxDepth = stageHasParents ? getMaxDepth(tasksInStage) : 0;
        const currentDepth = stageExpandDepths[stageName] ?? maxDepth;

        return (
          <div key={stageName} className="stage-section">
            <div
              className="stage-header"
              onClick={() => handleToggleStage(stageName)}
              style={{ cursor: 'pointer', userSelect: 'none' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button
                    className="btn btn-ghost p-1 h-auto"
                    onClick={(e) => { e.stopPropagation(); onAddQuickTask?.(stageName, null); }}
                    title="Agregar tarea a esta etapa"
                  >
                    <Plus size={14} />
                  </button>
                  <ChevronRight size={16} style={{
                    transform: isCollapsed ? 'rotate(0deg)' : 'rotate(90deg)',
                    transition: 'transform 0.2s',
                    color: 'var(--text-muted)'
                  }} />
                </div>
                <h3 style={{ fontSize: '15px', fontWeight: 700 }}>{stageName}</h3>
                {(() => {
                  if (tasksInStage.length === 0) return null;
                  const start = new Date(Math.min(...tasksInStage.map((r: any) => new Date(r.planStartDate).getTime())));
                  const end = new Date(Math.max(...tasksInStage.map((r: any) => new Date(r.planEndDate).getTime())));
                  const diff = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
                  let label = `${diff} días`;
                  if (diff >= 30) label = `~${Math.round(diff / 30)} mes${Math.round(diff / 30) !== 1 ? 'es' : ''}`;
                  else if (diff >= 7) label = `~${Math.round(diff / 7)} sem`;
                  return (
                    <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                      <span className="template-duration-badge" style={{ fontSize: '11px', padding: '2px 8px', background: 'var(--bg-surface-2)' }}>
                        <Calendar size={10} style={{ display: 'inline', marginRight: '4px', verticalAlign: '-1px' }} />
                        {(() => {
                          const f = (d: Date) => {
                            const day = d.getDate().toString().padStart(2, '0');
                            const month = d.toLocaleDateString('es-ES', { month: 'short' }).replace('.', '');
                            const year = d.getFullYear().toString().substring(2);
                            return `${day}-${month}-${year}`;
                          };
                          return `${f(start)} - ${f(end)}`;
                        })()}
                      </span>
                      <span className="template-duration-badge" style={{ fontSize: '10px', padding: '2px 8px', background: 'var(--bg-surface-2)' }}>
                        <Clock size={10} /> {label}
                      </span>
                    </div>
                  );
                })()}
              </div>

              {/* Right side: completion counter + depth controls */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  {completedCount} / {totalCount} Tareas
                </span>

                {stageHasParents && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0px' }} onClick={e => e.stopPropagation()}>
                    <button
                      className="btn btn-ghost"
                      disabled={currentDepth >= maxDepth}
                      onClick={() => handleExpandDepth(stageName, tasksInStage, 1)}
                      title={`Expandir un nivel (nivel ${Math.min(currentDepth + 1, maxDepth)})`}
                      style={{ 
                        fontSize: '11px', padding: '3px 7px', fontWeight: 700, 
                        borderRadius: '6px 0 0 6px', borderRight: 'none',
                        opacity: currentDepth >= maxDepth ? 0.4 : 1,
                        cursor: currentDepth >= maxDepth ? 'not-allowed' : 'pointer',
                        color: 'var(--text-secondary)'
                      }}
                    >
                      ▼
                    </button>
                    <div style={{ 
                      background: 'var(--accent)', color: '#fff', 
                      fontSize: '10px', fontWeight: 800, 
                      minWidth: '22px', textAlign: 'center', 
                      padding: '3px 4px', 
                      border: '1px solid var(--border)',
                      lineHeight: 1.5,
                    }}>
                      {currentDepth}
                    </div>
                    <button
                      className="btn btn-ghost"
                      disabled={currentDepth <= 0}
                      onClick={() => handleExpandDepth(stageName, tasksInStage, -1)}
                      title={`Contraer un nivel (nivel ${Math.max(currentDepth - 1, 0)})`}
                      style={{ 
                        fontSize: '11px', padding: '3px 7px', fontWeight: 700, 
                        borderRadius: '0 6px 6px 0', borderLeft: 'none',
                        opacity: currentDepth <= 0 ? 0.4 : 1,
                        cursor: currentDepth <= 0 ? 'not-allowed' : 'pointer',
                        color: 'var(--text-secondary)'
                      }}
                    >
                      ▲
                    </button>
                  </div>
                )}
              </div>
            </div>

            {!isCollapsed && (
              <div className="task-list">
                {topLevelTasks.map((task: any) => renderTask(task, 0, globalChildrenByParent[task.id] || []))}
              </div>
            )}
          </div>
        );
      })}
      </div>

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
          <defs>
            <marker
              id="list-view-dep-arrowhead"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="var(--accent, #2563eb)" />
            </marker>
          </defs>
          <path
            d={`M ${dragState.startCoords.x} ${dragState.startCoords.y} C ${dragState.startCoords.x + 100} ${dragState.startCoords.y}, ${dragState.currentCoords.x - 100} ${dragState.currentCoords.y}, ${dragState.currentCoords.x} ${dragState.currentCoords.y}`}
            fill="none"
            stroke="var(--accent, #2563eb)"
            strokeWidth="3"
            strokeDasharray="6 6"
            className="animate-dash"
            markerEnd="url(#list-view-dep-arrowhead)"
          />
          <circle cx={dragState.startCoords.x} cy={dragState.startCoords.y} r="5" fill="var(--accent, #2563eb)" />
          <circle cx={dragState.currentCoords.x} cy={dragState.currentCoords.y} r="5" fill="var(--accent, #2563eb)" />
        </svg>
      )}
    </div>
  );
}
