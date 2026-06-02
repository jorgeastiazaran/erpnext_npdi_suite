import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { 
  Search, 
  Calendar, 
  Flame, 
  Plus, 
  Trash2, 
  ArrowUpDown, 
  ExternalLink, 
  ChevronRight, 
  ChevronDown,
  Filter,
  Clock,
  Activity,
  Users,
  ShieldAlert,
  User,
  MoreVertical,
  Link,
  Flag,
  Pencil,
  Check,
  X,
  Loader2
} from 'lucide-react';
import './ListView.css';
import { parseLocalDate, toISODateString } from './dateUtils';

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
  const getStatusClass = (status: string) => {
    const s = status || 'Open';
    switch (s) {
      case 'Open':
      case 'Pending':
        return 'pending';
      case 'Working':
      case 'In Progress':
        return 'in-progress';
      case 'Pending Review':
      case 'Awaiting Approval':
        return 'awaiting-approval';
      case 'Completed':
        return 'completed';
      case 'Overdue':
      case 'Cancelled':
      case 'Blocked':
      case 'Skipped':
        return 'blocked';
      default:
        return 'pending';
    }
  };

  const getStatusLabel = (status: string, short: boolean = false) => {
    const s = status || 'Open';
    switch (s) {
      case 'Open':
      case 'Pending':
        return 'Pendiente';
      case 'Working':
      case 'In Progress':
        return 'En curso';
      case 'Pending Review':
      case 'Awaiting Approval':
        return short ? 'Espera' : 'En revisión';
      case 'Completed':
        return 'Completado';
      case 'Overdue':
      case 'Blocked':
        return 'Vencido';
      case 'Cancelled':
      case 'Skipped':
        return 'Cancelado';
      default:
        return s;
    }
  };

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStage, setSelectedStage] = useState('All');
  const [selectedModule, setSelectedModule] = useState('All');
  const [selectedStatus, setSelectedStatus] = useState('All');
  const [showOnlyCritical, setShowOnlyCritical] = useState(false);
  const [sortBy, setSortBy] = useState<'startDate' | 'endDate' | 'status' | 'stage' | 'slack' | 'name'>('startDate');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Collapse states for tree hierarchy
  const [collapsedStages, setCollapsedStages] = useState<Set<string>>(new Set());
  const [collapsedParents, setCollapsedParents] = useState<Set<string>>(new Set());
  const [stageExpandDepths, setStageExpandDepths] = useState<Record<string, number>>({});
  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null);

  // ── Inline Editing State ──────────────────────────────────────────────────
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editData, setEditData] = useState<any>(null);
  const [isEditSaving, setIsEditSaving] = useState(false);

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
        // Check hierarchy to prevent circular parent-child dependency
        const getAncestors = (taskId: string): Set<string> => {
          const ancestors = new Set<string>();
          let current = tasks.find((t: any) => t.id === taskId);
          while (current && current.parentTaskId) {
            ancestors.add(current.parentTaskId);
            current = tasks.find((t: any) => t.id === current?.parentTaskId);
          }
          return ancestors;
        };
        const sourceAncestors = getAncestors(state.sourceId);
        const targetAncestors = getAncestors(state.hoverTargetId);
        if (sourceAncestors.has(state.hoverTargetId) || targetAncestors.has(state.sourceId)) {
          alert("No se puede crear una dependencia entre una tarea y su subtarea.");
        } else if (onAddTaskDependency) {
          await onAddTaskDependency(state.hoverTargetId, state.sourceId);
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

  // Extract unique stages & modules
  const stages = useMemo(() => {
    const s = new Set<string>();
    tasks.forEach(t => { if (t.stageName) s.add(t.stageName); });
    return ['All', ...Array.from(s)];
  }, [tasks]);

  const modules = useMemo(() => {
    const m = new Set<string>();
    tasks.forEach(t => { if (t.npdiModule) m.add(t.npdiModule); });
    return ['All', ...Array.from(m)];
  }, [tasks]);

  // Handle Sort Toggle (only active when flat listing filtered tasks)
  const handleSort = (field: typeof sortBy) => {
    if (sortBy === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  };

  // Check if any filter is currently applied
  const isFilteringActive = useMemo(() => {
    return searchQuery.trim() !== '' || 
           selectedStage !== 'All' || 
           selectedModule !== 'All' || 
           selectedStatus !== 'All' || 
           showOnlyCritical;
  }, [searchQuery, selectedStage, selectedModule, selectedStatus, showOnlyCritical]);

  // Filter Tasks
  const filteredTasks = useMemo(() => {
    return tasks.filter(t => {
      const query = searchQuery.toLowerCase();
      const matchesSearch = 
        t.name?.toLowerCase().includes(query) || 
        t.id?.toLowerCase().includes(query);
      
      const matchesStage = selectedStage === 'All' || t.stageName === selectedStage;
      const matchesModule = selectedModule === 'All' || t.npdiModule === selectedModule;
      const matchesStatus = selectedStatus === 'All' || t.status === selectedStatus;
      const matchesCritical = !showOnlyCritical || t.isCritical || t.slack === 0;

      return matchesSearch && matchesStage && matchesModule && matchesStatus && matchesCritical;
    });
  }, [tasks, searchQuery, selectedStage, selectedModule, selectedStatus, showOnlyCritical]);

  // Grouped tasks representation
  const groupedTasks = useMemo(() => {
    const listToGroup = isFilteringActive ? filteredTasks : tasks;
    return listToGroup.reduce((acc: Record<string, any[]>, task: any) => {
      const stage = task.stageName || 'General';
      if (!acc[stage]) {
        acc[stage] = [];
      }
      acc[stage].push(task);
      return acc;
    }, {});
  }, [tasks, filteredTasks, isFilteringActive]);

  // Parent-to-children mapping lookup (for tree mode)
  const globalChildrenByParent = useMemo(() => {
    return tasks.reduce((acc: Record<string, any[]>, t: any) => {
      if (t.parentTaskId) {
        if (!acc[t.parentTaskId]) acc[t.parentTaskId] = [];
        acc[t.parentTaskId].push(t);
      }
      return acc;
    }, {});
  }, [tasks]);

  // Helpers for Hierarchical Depth Expansion
  const getTaskDepth = useCallback((taskId: string, allFlatTasks: any[]): number => {
    let depth = 0;
    let current = allFlatTasks.find((t: any) => t.id === taskId);
    const visited = new Set<string>();
    while (current?.parentTaskId && !visited.has(current.id)) {
      visited.add(current.id);
      depth++;
      current = allFlatTasks.find((t: any) => t.id === current.parentTaskId);
    }
    return depth;
  }, []);

  const getMaxDepth = useCallback((stageTasks: any[]): number => {
    if (stageTasks.length === 0) return 0;
    return Math.max(...stageTasks.map((t: any) => getTaskDepth(t.id, stageTasks)));
  }, [getTaskDepth]);

  const applyDepthToStage = useCallback((stageTasks: any[], expandDepth: number) => {
    setCollapsedParents(prev => {
      const next = new Set(prev);
      stageTasks.forEach((task: any) => {
        const hasChildren = stageTasks.some((t: any) => t.parentTaskId === task.id);
        if (!hasChildren) return;
        const taskDepth = getTaskDepth(task.id, stageTasks);
        if (taskDepth < expandDepth) {
          next.delete(task.id);
        } else {
          next.add(task.id);
        }
      });
      return next;
    });
  }, [getTaskDepth]);

  const handleExpandDepth = useCallback((stageName: string, stageTasks: any[], direction: 1 | -1) => {
    const maxDepth = getMaxDepth(stageTasks);
    const current = stageExpandDepths[stageName] ?? maxDepth;
    const next = Math.min(maxDepth, Math.max(0, current + direction));
    setStageExpandDepths(prev => ({ ...prev, [stageName]: next }));
    applyDepthToStage(stageTasks, next);
  }, [stageExpandDepths, getMaxDepth, applyDepthToStage]);

  // Event handlers
  const handleToggleStage = (stageName: string) => {
    setCollapsedStages(prev => {
      const next = new Set(prev);
      if (next.has(stageName)) next.delete(stageName);
      else next.add(stageName);
      return next;
    });
  };

  const handleToggleParent = (parentId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCollapsedParents(prev => {
      const next = new Set(prev);
      if (next.has(parentId)) next.delete(parentId);
      else next.add(parentId);
      return next;
    });
  };

  const handleEditTask = (task: any, e: React.MouseEvent) => {
    e.stopPropagation();
    const duration = getDuration(task.planStartDate, task.planEndDate);
    setEditData({
      name: task.name,
      stageName: task.stageName || 'General',
      durationValue: duration,
      durationUnit: 'days', // currently only days supported in ListView UI naturally
      roleId: task.assignedTo?.name || task.npdiResponsibleRole || '',
      module: task.npdiModule || 'core'
    });
    setEditingTaskId(task.id);
  };

  const handleSaveEdit = async (taskId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (isEditSaving || !onUpdateTask) return;
    setIsEditSaving(true);
    try {
      await onUpdateTask(taskId, editData);
      setEditingTaskId(null);
      setEditData(null);
    } catch (err) {
      console.error(err);
    } finally {
      setIsEditSaving(false);
    }
  };

  const handleCancelEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingTaskId(null);
    setEditData(null);
  };

  const handleStatusChangeInternal = async (taskId: string, status: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (updatingTaskId || !onStatusChange) return;
    setUpdatingTaskId(taskId);
    try {
      await onStatusChange(taskId, status);
    } catch (err) {
      console.error(err);
    } finally {
      setUpdatingTaskId(null);
    }
  };

  const handleDeleteTaskInternal = (taskId: string, taskName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onDeleteQuickTask) return;
    if (confirm(`¿Estás seguro de que deseas eliminar la tarea "${taskName}"?`)) {
      onDeleteQuickTask(taskId);
    }
  };

  // Date Formatter
  const formatDate = (dateString: string) => {
    if (!dateString) return '-';
    const d = parseLocalDate(dateString);
    if (isNaN(d.getTime())) return dateString;
    const day = d.getDate().toString().padStart(2, '0');
    const month = d.toLocaleDateString('es-ES', { month: 'short' }).replace('.', '').toLowerCase();
    const year = d.getFullYear().toString().substring(2);
    return `${day}-${month}-${year}`;
  };

  // Calculate Duration in Days
  const getDuration = (startStr: string, endStr: string) => {
    if (!startStr || !endStr) return 0;
    const start = parseLocalDate(startStr);
    const end = parseLocalDate(endStr);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  };

  const getModuleBadgeColor = (moduleName: string) => {
    const colors: Record<string, { bg: string, text: string }> = {
      'Formula': { bg: 'rgba(139, 92, 246, 0.1)', text: '#8b5cf6' },
      'Pack': { bg: 'rgba(59, 130, 246, 0.1)', text: '#3b82f6' },
      'Brand': { bg: 'rgba(236, 72, 153, 0.1)', text: '#ec4899' },
      'Core': { bg: 'rgba(16, 185, 129, 0.1)', text: '#10b981' }
    };
    return colors[moduleName] || { bg: 'var(--bg-surface-2)', text: 'var(--text-muted)' };
  };

  // Recursive task row renderer
  const renderTask = (task: any, depth = 0, children: any[] = []) => {
    const isCritical = task.isCritical || task.slack === 0;
    
    const now = new Date();
    now.setHours(0,0,0,0);
    const planEnd = task.planEndDate ? parseLocalDate(task.planEndDate) : new Date();
    planEnd.setHours(0,0,0,0);
    const isOverdue = task.status !== 'Completed' && task.status !== 'Cancelled' && task.status !== 'Overdue' && task.status !== 'Blocked' && planEnd < now;
    const overdueDays = isOverdue ? Math.round((now.getTime() - planEnd.getTime()) / (1000 * 60 * 60 * 24)) : 0;

    const hasChildren = children.length > 0 && !isFilteringActive;
    const isCollapsed = collapsedParents.has(task.id);
    const duration = getDuration(task.planStartDate, task.planEndDate);

    return (
      <React.Fragment key={task.id}>
        <div
          className={`task-row ${updatingTaskId === task.id ? 'opacity-50' : ''} ${task.isSkipped ? 'task-skipped' : ''} ${task.status?.toLowerCase() === 'completed' ? 'task-completed' : ''} ${isCritical && !task.isSkipped && task.status !== 'Completed' ? (isOverdue ? 'task-overdue-critical' : 'task-critical') : ''} ${dragState.hoverTargetId === task.id && dragState.sourceId !== task.id ? 'drag-dep-target' : ''}`}
          onClick={() => onTaskClick?.(task.id)}
          onMouseEnter={() => handleDragEnter(task.id)}
          onMouseLeave={() => handleDragEnter(null)}
          style={{ 
            paddingLeft: `calc(16px + ${depth * 28}px)`,
            borderLeft: dragState.hoverTargetId === task.id && dragState.sourceId !== task.id
              ? '5px solid var(--accent, #3b82f6)'
              : (getStatusClass(task.status) === 'in-progress' ? '5px solid var(--accent, #3b82f6)' : 
                (getStatusClass(task.status) === 'blocked' ? '5px solid #ef4444' : '5px solid transparent')),
            background: dragState.hoverTargetId === task.id && dragState.sourceId !== task.id
              ? 'rgba(79, 140, 255, 0.08)'
              : (hasChildren && !isCollapsed ? 'var(--bg-surface-2)' : (getStatusClass(task.status) === 'in-progress' ? 'rgba(79, 140, 255, 0.05)' : undefined)),
            outline: dragState.hoverTargetId === task.id && dragState.sourceId !== task.id ? '1.5px dashed var(--accent, #3b82f6)' : undefined,
            transition: 'background 0.15s, outline 0.15s',
            position: 'relative'
          }}
        >
          {/* Vertical guideline for child tasks */}
          {depth > 0 && !isFilteringActive && (
            <div style={{
              position: 'absolute',
              left: `calc(${depth * 28}px - 14px)`,
              top: 0,
              bottom: 0,
              width: '1px',
              background: 'var(--border)',
              zIndex: 1
            }} />
          )}

          {editingTaskId === task.id ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input 
                  type="text" 
                  className="template-input" 
                  value={editData.name} 
                  onChange={e => setEditData({ ...editData, name: e.target.value })} 
                  style={{ flex: 1 }}
                  placeholder="Nombre de la tarea"
                  autoFocus
                />
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'var(--bg-surface-2)', padding: '2px 8px', borderRadius: '6px', border: '1px solid var(--border)' }}>
                  <Clock size={12} style={{ color: 'var(--text-muted)' }} />
                  <input
                    type="number"
                    className="template-input"
                    style={{ width: '50px', padding: '4px', textAlign: 'center', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)', borderRadius: 0 }}
                    value={editData.durationValue}
                    onChange={e => setEditData({ ...editData, durationValue: parseInt(e.target.value) || 1 })}
                    min={1}
                  />
                  <select
                    className="template-select"
                    style={{ border: 'none', background: 'transparent', paddingLeft: '4px' }}
                    value={editData.durationUnit}
                    onChange={e => setEditData({ ...editData, durationUnit: e.target.value })}
                  >
                    <option value="days">Días</option>
                  </select>
                </div>
              </div>
              
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                <select 
                  className="template-select" 
                  value={editData.stageName} 
                  onChange={e => setEditData({ ...editData, stageName: e.target.value })}
                  style={{ width: '120px' }}
                >
                  <option value="General">General</option>
                  {stages.filter((s: string) => s !== 'All' && s !== 'General').map((s: string) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>

                <select 
                  className="template-select" 
                  value={editData.module} 
                  onChange={e => setEditData({ ...editData, module: e.target.value })}
                  style={{ width: '120px' }}
                >
                  <option value="core">Core</option>
                  <option value="formula">Fórmula</option>
                  <option value="pack">Empaque</option>
                  <option value="brand">Marca</option>
                </select>

                <select 
                  className="template-select" 
                  value={editData.roleId} 
                  onChange={e => setEditData({ ...editData, roleId: e.target.value })}
                  style={{ width: '140px' }}
                >
                  <option value="">Sin Rol Asignado</option>
                  {["CEO", "Marketing", "I+D", "Calidad", "Supply Chain", "Finanzas", "Producción"].map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>

                <div style={{ flex: 1 }} />
                
                <button 
                  className="btn-icon" 
                  onClick={(e) => handleSaveEdit(task.id, e)} 
                  disabled={isEditSaving}
                  style={{ background: '#22c55e', color: 'white', border: 'none' }}
                  title="Guardar"
                >
                  {isEditSaving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                </button>
                <button 
                  className="btn-icon" 
                  onClick={handleCancelEdit} 
                  style={{ border: '1px solid var(--border)', background: 'var(--bg-surface)' }}
                  title="Cancelar"
                >
                  <X size={12} />
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="task-main">
                {depth > 0 && !isFilteringActive && (
                  <ChevronRight 
                    size={14} 
                    style={{ 
                      color: 'var(--text-muted)', 
                      flexShrink: 0,
                      opacity: 0.5
                    }} 
                  />
                )}
                
                {task.isMilestone && (
                  <Flag size={14} style={{ color: isOverdue ? '#ef4444' : '#f59e0b', flexShrink: 0, marginTop: '2px' }} />
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', overflow: 'hidden' }}>
                  <span className="task-name" style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '8px',
                    fontWeight: depth === 0 ? 700 : 500,
                    fontSize: depth === 0 ? '14px' : '13px'
                  }}>
                    <span className="task-name-text">{task.name}</span>
                    {task.role?.name && (
                      <span style={{ color: 'var(--text-muted)', fontSize: '10px', fontWeight: 500 }}>
                        ({task.role.name})
                      </span>
                    )}
                    
                    {task.attachmentUrl && (
                      <span title="Tiene evidencia adjunta" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 6px', background: 'rgba(34, 197, 94, 0.1)', borderRadius: '10px', fontSize: '9px', fontWeight: 600, color: '#22c55e' }}>
                        <Link size={10} /> Evidencia
                      </span>
                    )}

                    {task.isFixed && (
                      <span title="Fecha anclada" style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 6px', background: 'rgba(245, 158, 11, 0.1)', borderRadius: '10px', fontSize: '9px', fontWeight: 600, color: '#d97706' }}>
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
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', padding: '2px 6px', background: 'rgba(239, 68, 68, 0.15)', borderRadius: '4px', fontSize: '9px', fontWeight: 600, color: '#ef4444' }}>
                        🔥 Ruta Crítica
                      </span>
                    )}

                    {hasChildren && (
                      <button 
                        onClick={(e) => handleToggleParent(task.id, e)}
                        style={{ 
                          display: 'inline-flex', 
                          alignItems: 'center', 
                          gap: '2px', 
                          fontSize: '9px', 
                          color: 'var(--text-muted)', 
                          background: 'var(--bg-surface-2)', 
                          padding: '2px 6px', 
                          borderRadius: '4px', 
                          cursor: 'pointer', 
                          border: '1px solid var(--border)' 
                        }}
                      >
                        <ChevronDown size={10} style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0)', transition: 'transform 150ms' }} />
                        {children.length} subtarea{children.length !== 1 ? 's' : ''}
                      </button>
                    )}
                  </span>

                  {/* Task metadata row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '10px' }}>
                    <span style={{ color: 'var(--text-muted)' }}>
                      {formatDate(task.planStartDate)} — {formatDate(task.planEndDate)}
                    </span>
                    <span style={{ color: 'var(--accent)', fontWeight: 600 }}>
                      ({duration} día{duration !== 1 ? 's' : ''})
                    </span>
                    {task.npdiModule && (
                      <span 
                        style={{ 
                          padding: '1px 6px', 
                          borderRadius: '4px', 
                          background: getModuleBadgeColor(task.npdiModule).bg,
                          color: getModuleBadgeColor(task.npdiModule).text,
                          fontSize: '9px',
                          fontWeight: '600'
                        }}
                      >
                        {task.npdiModule}
                      </span>
                    )}
                    {!isCritical && !task.isSkipped && task.status !== 'Completed' && task.slack > 0 && (
                      <span style={{ color: '#10b981' }}>• Holgura: {task.slack} d</span>
                    )}
                    <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--mono)', fontSize: '9px' }}>
                      ID: {task.id}
                    </span>
                  </div>
                </div>

                {task.isMilestone && <span className="task-milestone-badge" style={{ marginLeft: '12px' }}>Hito</span>}
              </div>

              <div className="task-actions-cell">
                {/* Responsible User Assignee display */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '120px' }}>
                  <div className="sidebar-user-avatar" style={{ width: '22px', height: '22px', fontSize: '9px', background: 'var(--bg-surface-2)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                    {task.assignedTo?.name ? task.assignedTo.name.substring(0, 2) : <User size={11} />}
                  </div>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{task.assignedTo?.name || 'Sin asignar'}</span>
                </div>

                {/* Status pills selector inline */}
                {!task.isSkipped ? (
                  <div className="status-toggle">
                    {['Open', 'Working', 'Pending Review', 'Completed', 'Overdue'].map((status) => (
                      <button 
                        key={status}
                        title={getStatusLabel(status, false)}
                        className={`status-btn ${task.status === status ? `active ${getStatusClass(status)}` : ''}`}
                        onClick={(e) => handleStatusChangeInternal(task.id, status, e)}
                      >
                        {getStatusLabel(status, true)}
                      </button>
                    ))}
                  </div>
                ) : (
                  <button 
                    className="btn btn-ghost" 
                    style={{ fontSize: '11px', padding: '4px 12px', border: '1px solid var(--border)', borderRadius: '4px', cursor: 'pointer', background: 'var(--bg-surface-2)' }}
                    onClick={(e) => { e.stopPropagation(); onSkipTask?.(task.id, false); }}
                  >
                    Restaurar Tarea
                  </button>
                )}
                
                <div style={{ display: 'flex', gap: '4px' }}>
                  {/* Inline Edit Node */}
                  {!task.isMilestone && (
                    <button 
                      className="btn-icon" 
                      onClick={(e) => handleEditTask(task, e)}
                      style={{ width: '26px', height: '26px', color: 'var(--text-muted)' }}
                      title="Editar tarea"
                    >
                      <Pencil size={12} />
                    </button>
                  )}

                  {/* Quick Add Sub-task */}
                  {!task.isMilestone && (
                    <button 
                      className="btn-icon" 
                      onClick={(e) => { 
                        e.stopPropagation(); 
                        const deps = task.dependencies
                          ? task.dependencies.map((d: any) => (d.dependentOnId || d.dependsOnId || d.id)?.toString()).filter(Boolean)
                          : [];
                        onAddQuickTask?.(task.stageName, task.id, {
                          dependencies: deps,
                          startDate: task.planStartDate,
                          npdiModule: task.npdiModule
                        }); 
                      }}
                      style={{ width: '26px', height: '26px' }}
                      title="Agregar sub-tarea"
                    >
                      <Plus size={12} />
                    </button>
                  )}
                  
                  {/* Delete ad-hoc / contextual task */}
                  {onDeleteQuickTask && (
                    <button 
                      className="btn-icon" 
                      onClick={(e) => handleDeleteTaskInternal(task.id, task.name, e)}
                      style={{ width: '26px', height: '26px', color: '#ef4444' }}
                      title="Eliminar tarea"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}

                  {/* Drag Handle Node for Visual Dependency Connection */}
                  {!task.isMilestone && (
                    <div
                      className={`template-task-drag-node ${dragState.sourceId === task.id ? 'active' : ''}`}
                      title="Arrastra hasta otra tarea para crear una dependencia"
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        const rect = e.currentTarget.getBoundingClientRect();
                        handleDragStart(task.id, e, { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
                      }}
                    >
                      <div className="inner-dot" />
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Nested child rendering */}
        {hasChildren && !isCollapsed && (
          <div className="nested-task-container">
            {children.map(child => renderTask(child, depth + 1, globalChildrenByParent[child.id] || []))}
          </div>
        )}
      </React.Fragment>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* Filtering and Toolbar Controls */}
      <div 
        style={{ 
          background: 'var(--bg-surface)', 
          borderRadius: '12px', 
          border: '1px solid var(--border)', 
          padding: '16px', 
          boxShadow: 'var(--shadow)',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px'
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
          
          {/* Search Box */}
          <div style={{ position: 'relative', flex: '1 1 240px' }}>
            <Search 
              size={16} 
              style={{ 
                position: 'absolute', 
                left: '12px', 
                top: '50%', 
                transform: 'translateY(-50%)', 
                color: 'var(--text-muted)' 
              }} 
            />
            <input 
              type="text" 
              placeholder="Buscar tarea por nombre o ID..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px 8px 36px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                background: 'var(--bg-surface-2)',
                color: 'var(--text-primary)',
                fontSize: '13px',
                outline: 'none',
                fontFamily: 'var(--sans)',
                boxSizing: 'border-box',
                transition: 'border-color 0.2s',
              }}
            />
          </div>

          {/* Stage Dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Filter size={14} style={{ color: 'var(--text-muted)' }} />
            <select
              value={selectedStage}
              onChange={(e) => setSelectedStage(e.target.value)}
              style={{
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                background: 'var(--bg-surface-2)',
                color: 'var(--text-primary)',
                fontSize: '13px',
                outline: 'none',
                cursor: 'pointer',
                fontFamily: 'var(--sans)',
              }}
            >
              <option value="All">Todas las Etapas</option>
              {stages.filter(s => s !== 'All').map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* Module Dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Activity size={14} style={{ color: 'var(--text-muted)' }} />
            <select
              value={selectedModule}
              onChange={(e) => setSelectedModule(e.target.value)}
              style={{
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                background: 'var(--bg-surface-2)',
                color: 'var(--text-primary)',
                fontSize: '13px',
                outline: 'none',
                cursor: 'pointer',
                fontFamily: 'var(--sans)',
              }}
            >
              <option value="All">Todos los Módulos</option>
              {modules.filter(m => m !== 'All').map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          {/* Status Dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              style={{
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                background: 'var(--bg-surface-2)',
                color: 'var(--text-primary)',
                fontSize: '13px',
                outline: 'none',
                cursor: 'pointer',
                fontFamily: 'var(--sans)',
              }}
            >
              <option value="All">Todos los Estatus</option>
              <option value="Open">Pendiente</option>
              <option value="Working">En curso</option>
              <option value="Pending Review">En revisión</option>
              <option value="Completed">Completado</option>
              <option value="Overdue">Vencido</option>
            </select>
          </div>

          {/* Critical Path Toggle Button */}
          <button
            onClick={() => setShowOnlyCritical(prev => !prev)}
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              border: showOnlyCritical ? '1px solid #ef4444' : '1px solid var(--border)',
              background: showOnlyCritical ? 'rgba(239, 68, 68, 0.1)' : 'var(--bg-surface-2)',
              color: showOnlyCritical ? '#ef4444' : 'var(--text-primary)',
              fontSize: '13px',
              fontWeight: '500',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.2s',
              fontFamily: 'var(--sans)',
            }}
          >
            <Flame size={14} style={{ fill: showOnlyCritical ? '#ef4444' : 'none' }} />
            Ruta Crítica
          </button>
        </div>
      </div>

      {/* Stage-Grouped Content */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {Object.entries(groupedTasks).length === 0 ? (
          <div 
            style={{ 
              padding: '40px', 
              textAlign: 'center', 
              color: 'var(--text-muted)', 
              background: 'var(--bg-surface)',
              borderRadius: '12px',
              border: '1px solid var(--border)'
            }}
          >
            No se encontraron tareas que coincidan con los filtros seleccionados.
          </div>
        ) : (
          Object.entries(groupedTasks).map(([stageName, stageTasks]: [string, any[]]) => {
            const completedCount = stageTasks.filter((t: any) => t.status === 'Completed').length;
            const totalCount = stageTasks.length;
            
            // Build tree structures only if filtering is not active
            const topLevelTasks = isFilteringActive 
              ? stageTasks 
              : stageTasks.filter((t: any) => !t.parentTaskId || !stageTasks.some(p => p.id === t.parentTaskId));

            const isCollapsed = collapsedStages.has(stageName);

            // Depth calculation helpers
            const stageHasParents = !isFilteringActive && stageTasks.some((t: any) => stageTasks.some((c: any) => c.parentTaskId === t.id));
            const maxDepth = stageHasParents ? getMaxDepth(stageTasks) : 0;
            const currentDepth = stageExpandDepths[stageName] ?? maxDepth;

            // Calculate overall date range and duration for the stage
            const validDates = stageTasks.filter(t => t.planStartDate && t.planEndDate);
            let dateLabel = '';
            let durationLabel = '';
            
            if (validDates.length > 0) {
              const startDates = validDates.map(t => parseLocalDate(t.planStartDate).getTime());
              const endDates = validDates.map(t => parseLocalDate(t.planEndDate).getTime());
              const minStart = new Date(Math.min(...startDates));
              const maxEnd = new Date(Math.max(...endDates));
              
              dateLabel = `${formatDate(toISODateString(minStart))} - ${formatDate(toISODateString(maxEnd))}`;
              
              const diff = Math.round((maxEnd.getTime() - minStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
              if (diff >= 30) {
                const mos = Math.round(diff / 30);
                durationLabel = `~${mos} mes${mos !== 1 ? 'es' : ''}`;
              } else if (diff >= 7) {
                const sems = Math.round(diff / 7);
                durationLabel = `~${sems} sem`;
              } else {
                durationLabel = `${diff} días`;
              }
            }

            return (
              <div key={stageName} className="stage-section">
                
                {/* Stage Header */}
                <div
                  className="stage-header"
                  onClick={() => handleToggleStage(stageName)}
                  style={{ cursor: 'pointer', userSelect: 'none' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <button
                      className="btn-icon"
                      onClick={(e) => { e.stopPropagation(); onAddQuickTask?.(stageName, null); }}
                      style={{ width: '24px', height: '24px' }}
                      title="Agregar tarea a esta etapa"
                    >
                      <Plus size={12} />
                    </button>
                    <ChevronDown size={16} style={{
                      transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                      transition: 'transform 0.2s',
                      color: 'var(--text-muted)'
                    }} />
                    <h3 style={{ fontSize: '15px', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>{stageName}</h3>
                    
                    {dateLabel && (
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <span className="template-duration-badge" style={{ fontSize: '10px' }}>
                          <Calendar size={10} style={{ display: 'inline', marginRight: '4px', verticalAlign: '-1px' }} />
                          {dateLabel}
                        </span>
                        <span className="template-duration-badge" style={{ fontSize: '10px' }}>
                          <Clock size={10} /> {durationLabel}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Expand/collapse depth sandwich badge & completion ratio */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }} onClick={e => e.stopPropagation()}>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      {completedCount} / {totalCount} Tareas
                    </span>

                    {stageHasParents && !isCollapsed && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                        <button
                          title={`Contraer un nivel (nivel ${currentDepth})`}
                          disabled={currentDepth <= 0}
                          onClick={() => handleExpandDepth(stageName, stageTasks, -1)}
                          style={{
                            background: 'var(--bg-surface-2)',
                            border: '1px solid var(--border)',
                            borderRadius: '4px 0 0 4px',
                            padding: '2px 8px',
                            cursor: currentDepth <= 0 ? 'not-allowed' : 'pointer',
                            opacity: currentDepth <= 0 ? 0.4 : 1,
                            fontSize: '9px',
                            fontWeight: 700,
                            color: 'var(--text-muted)'
                          }}
                        >
                          ▲
                        </button>
                        <div style={{
                          background: 'var(--accent)',
                          color: '#fff',
                          fontSize: '10px',
                          fontWeight: 800,
                          minWidth: '20px',
                          textAlign: 'center',
                          padding: '2px 4px',
                          borderTop: '1px solid var(--border)',
                          borderBottom: '1px solid var(--border)'
                        }}>
                          {currentDepth}
                        </div>
                        <button
                          title={`Expandir un nivel (nivel ${currentDepth + 1})`}
                          disabled={currentDepth >= maxDepth}
                          onClick={() => handleExpandDepth(stageName, stageTasks, 1)}
                          style={{
                            background: 'var(--bg-surface-2)',
                            border: '1px solid var(--border)',
                            borderRadius: '0 4px 4px 0',
                            padding: '2px 8px',
                            cursor: currentDepth >= maxDepth ? 'not-allowed' : 'pointer',
                            opacity: currentDepth >= maxDepth ? 0.4 : 1,
                            fontSize: '9px',
                            fontWeight: 700,
                            color: 'var(--text-muted)'
                          }}
                        >
                          ▼
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Stage Tasks list */}
                {!isCollapsed && (
                  <div className="task-list">
                    {topLevelTasks.map((task: any) => renderTask(task, 0, globalChildrenByParent[task.id] || []))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* SVG Overlay for Drag-to-Connect Visual Dependencies */}
      {dragState.sourceId && dragState.startCoords && dragState.currentCoords && (
        <svg
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            pointerEvents: 'none',
            zIndex: 9999,
          }}
        >
          <path
            d={`M ${dragState.startCoords.x} ${dragState.startCoords.y} C ${dragState.startCoords.x + 100} ${dragState.startCoords.y}, ${dragState.currentCoords.x - 100} ${dragState.currentCoords.y}, ${dragState.currentCoords.x} ${dragState.currentCoords.y}`}
            fill="none"
            stroke="var(--accent, #3b82f6)"
            strokeWidth="3"
            strokeDasharray="6 6"
            className="animate-dash"
          />
          <circle cx={dragState.startCoords.x} cy={dragState.startCoords.y} r="5" fill="var(--accent, #3b82f6)" />
          <circle cx={dragState.currentCoords.x} cy={dragState.currentCoords.y} r="5" fill={dragState.hoverTargetId ? '#22c55e' : 'var(--accent, #3b82f6)'} />
          {dragState.hoverTargetId && (
            <text
              x={dragState.currentCoords.x + 10}
              y={dragState.currentCoords.y - 10}
              fontSize="11"
              fontWeight="600"
              fill="var(--accent, #3b82f6)"
              fontFamily="system-ui, sans-serif"
            >
              Conectar dependencia
            </text>
          )}
        </svg>
      )}
    </div>
  );
}
