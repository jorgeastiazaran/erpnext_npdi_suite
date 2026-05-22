'use client';

import React, { useMemo, useState } from 'react';
// import { useRouter } from 'next/navigation';
// import { updateTaskDates, addTaskDependency } from '@/app/actions/taskActions';

import { Gantt, ViewMode } from 'gantt-task-react';
import type { Task } from 'gantt-task-react';
import "gantt-task-react/dist/index.css";

// Polyfill Next.js router
const useRouter = () => ({ refresh: () => window.location.reload() });
const updateTaskDates = async () => ({ success: false, error: 'API no implementada' });

import { Check, AlertCircle, ChevronDown, Maximize2, Minimize2, Target, Plus, Trash2, Maximize, Minimize } from 'lucide-react';
import { parseLocalDate } from './dateUtils';

interface GanttViewProps {
  tasks: any[]; // The tasks from our scheduler/Prisma
  onTaskClick?: (taskId: string) => void;
  onDateChange?: (taskId: string, start: Date, end: Date) => Promise<any>;
  onStatusChange?: (taskId: string, status: string) => Promise<any>;
  selectedTaskId?: string | null;
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
  projectMeta?: { name: string; npdi_baseline_locked: number } | null;
  onCaptureBaseline?: () => Promise<any>;
}

export default function GanttView({ 
  tasks, onTaskClick, onDateChange, onStatusChange, selectedTaskId,
  onAddQuickTask, onDeleteQuickTask, projectMeta, onCaptureBaseline 
}: GanttViewProps) {
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.Week);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [showBaseline, setShowBaseline] = useState<boolean>(false);
  // Track depth level for expand/collapse (0 = fully collapsed, maxDepth = fully expanded)
  const [ganttExpandDepth, setGanttExpandDepth] = useState<number>(99); // default = all expanded

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [windowHeight, setWindowHeight] = useState(800);

  React.useEffect(() => {
    setWindowHeight(window.innerHeight);
    const handleResize = () => setWindowHeight(window.innerHeight);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const computedGanttHeight = isFullscreen ? Math.max(400, windowHeight - 120) : Math.max(500, windowHeight - 400);

  const [ganttKey, setGanttKey] = useState(0);
  const router = useMemo(() => ({
    refresh: () => setGanttKey(prev => prev + 1)
  }), []);

  // Auto-scroll to selected task
  React.useEffect(() => {
    if (selectedTaskId) {
      const rowElement = document.getElementById(`gantt-row-${selectedTaskId}`);
      if (rowElement) {
        rowElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      
      // Also try to scroll the horizontal chart if we can find the bar
      const barElement = document.querySelector(`[data-task-id="${selectedTaskId}"]`);
      if (barElement) {
        barElement.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }
  }, [selectedTaskId]);

  const handleExpanderClick = (task: Task) => {
    setCollapsedIds(prev => {
      const next = new Set(prev);
      if (next.has(task.id)) {
        next.delete(task.id);
      } else {
        next.add(task.id);
      }
      return next;
    });
  };

  const handleCenterTask = (ganttTask: Task) => {
    // 1. Scroll the list (Vertical)
    const row = document.getElementById(`gantt-row-${ganttTask.id}`);
    if (row) {
      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    
    // 2. Scroll the chart (Horizontal)
    let targetBar: Element | null = null;
    const textElements = document.querySelectorAll('.gantt-container svg text');
    for (const text of Array.from(textElements)) {
      if (text.textContent?.trim() === ganttTask.name.trim()) {
        targetBar = text.closest('g');
        break;
      }
    }

    if (targetBar) {
      targetBar.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  };

  // INEF-04: Pre-calcular un Map para lookups O(1) en lugar de .find() O(n) por fila
  const taskById = useMemo(
    () => new Map(tasks.map((t) => [t.id.toString(), t])),
    [tasks]
  );

  // Calculate status counts per parent/stage for summaries
  const statusSummaries = useMemo(() => {
    const summaries: Record<string, Record<string, number>> = {};
    
    tasks.forEach(t => {
      const s = t.status || 'Open';
      const stageId = `stage-${(t.stageName || 'General').toLowerCase().replace(/\s+/g, '-')}`;
      
      const updateCount = (id: string) => {
        if (!summaries[id]) {
          summaries[id] = { 
            'Open': 0, 'Working': 0, 'Pending Review': 0, 'Completed': 0, 'Overdue': 0, 'Cancelled': 0,
            'Pending': 0, 'In Progress': 0, 'Awaiting Approval': 0, 'Blocked': 0 
          };
        }
        summaries[id][s] = (summaries[id][s] || 0) + 1;
      };

      updateCount(stageId);
      if (t.parentTaskId) updateCount(t.parentTaskId.toString());
    });
    return summaries;
  }, [tasks]);

  // Map our tasks to gantt-task-react format
  const ganttTasks: Task[] = useMemo(() => {
    // Recursive children helper
    const getRecursiveChildren = (parentId: string | number): any[] => {
      let result: any[] = [];
      const directChildren = tasks.filter(child => child.parentTaskId === parentId);
      for (const child of directChildren) {
        result.push(child);
        const childHasChildren = tasks.some(c => c.parentTaskId === child.id);
        if (childHasChildren) {
          result = result.concat(getRecursiveChildren(child.id));
        }
      }
      return result;
    };

    const grouped = tasks.reduce((acc, t) => {
      const stage = t.stageName || 'General';
      if (!acc[stage]) acc[stage] = [];
      acc[stage].push(t);
      return acc;
    }, {} as Record<string, any[]>);

    const finalTasks: Task[] = [];
    let currentDisplayOrder = 1;

    Object.entries(grouped).forEach(([stageName, stageTasks]) => {
      const stageId = `stage-${stageName.toLowerCase().replace(/\s+/g, '-')}`;
      const sortedStageTasks = [...stageTasks].sort((a, b) => a.id - b.id);

      if (sortedStageTasks.length === 0) return;

      const stageStart = new Date(Math.min(...sortedStageTasks.map(t => parseLocalDate(t.planStartDate).getTime())));
      const stageEnd = new Date(Math.max(...sortedStageTasks.map(t => parseLocalDate(t.planEndDate).getTime())));

      // Calculate stage status colors dynamically based on child tasks
      const hasStageAnyStarted = sortedStageTasks.some(t => {
        const s = t.status?.toLowerCase();
        return s === 'completed' || s === 'working' || s === 'in progress' || s === 'blocked' || s === 'awaiting approval' || s === 'pending review' || s === 'overdue' || s === 'cancelled';
      });
      const isStageCompleted = sortedStageTasks.every(t => t.status === 'Completed');
      
      let stageStatusColor = '#9ca3af'; // gray
      let stageProgress = 0;
      if (isStageCompleted) {
        stageStatusColor = '#22c55e'; // green
        stageProgress = 100;
      } else if (hasStageAnyStarted) {
        stageStatusColor = 'var(--accent)'; // blue
        stageProgress = 50;
      }

      finalTasks.push({
        id: stageId,
        name: stageName.toUpperCase(),
        start: stageStart,
        end: stageEnd,
        progress: stageProgress,
        type: 'project',
        hideChildren: collapsedIds.has(stageId),
        displayOrder: currentDisplayOrder++,
        styles: {
          backgroundColor: stageStatusColor,
          backgroundSelectedColor: stageStatusColor,
          progressColor: stageStatusColor,
          progressSelectedColor: stageStatusColor,
        }
      });

      sortedStageTasks.forEach((t) => {
        const isCritical = t.slack === 0;
        const realParentId = t.parentTaskId || t.parentId;
        const parentId = realParentId ? realParentId.toString() : stageId;
        const hasChildren = tasks.some(child => child.parentTaskId === t.id);
        const isGroup = hasChildren || t.isGroup;
        const childItems = isGroup ? getRecursiveChildren(t.id) : [];

        // Determine start/end for group/project tasks
        let taskStart: Date;
        let taskEnd: Date;

        if (isGroup) {
          // Filter children with valid start dates
          const validStarts = childItems
            .map(c => parseLocalDate(c.planStartDate))
            .filter(d => d && !isNaN(d.getTime()));
          // Filter children with valid end dates
          const validEnds = childItems
            .map(c => parseLocalDate(c.planEndDate))
            .filter(d => d && !isNaN(d.getTime()));

          // Fallback to parent's own dates if no valid children dates
          taskStart = validStarts.length > 0
            ? new Date(Math.min(...validStarts.map(d => d.getTime())))
            : parseLocalDate(t.planStartDate);
          taskEnd = validEnds.length > 0
            ? new Date(Math.max(...validEnds.map(d => d.getTime())))
            : parseLocalDate(t.planEndDate);
        } else {
          taskStart = parseLocalDate(t.planStartDate);
          taskEnd = parseLocalDate(t.planEndDate);
        }

        const rawDeps = t.dependencies || t.dependsOn || [];
        const dependencyIds = rawDeps.map((d: any) => (d.dependentOnId || d.dependsOnId || d.id)?.toString()).filter(Boolean);

        let barColor = 'var(--accent)';
        const status = t.status?.toLowerCase();
        
        if (status === 'completed') barColor = '#22c55e'; // Green
        else if (status === 'overdue' || status === 'blocked' || status === 'cancelled') barColor = 'var(--status-blocked-text)'; // Red
        else if (status === 'pending review' || status === 'awaiting approval') barColor = 'var(--status-concept-text)'; // Amber
        else if (status === 'working' || status === 'in progress') barColor = 'var(--accent)'; // Blue
        else if (isCritical) barColor = 'var(--status-blocked-text)'; // Critical = Red
        else {
          const stage = (t.stageName || '').toLowerCase();
          if (stage.includes('idea')) barColor = 'var(--status-idea-text)';
          else if (stage.includes('concepto')) barColor = 'var(--status-concept-text)';
          else if (stage.includes('desarrollo')) barColor = 'var(--status-dev-text)';
          else if (stage.includes('lanzamiento')) barColor = 'var(--status-launch-text)';
          else if (stage.includes('post')) barColor = 'var(--status-post-text)';
        }

        let taskProgress = 0;
        let finalBarColor = barColor;
        let finalBgColor = 'rgba(0,0,0,0.05)';
        
        if (isGroup) {
          const isAllCompleted = childItems.length > 0 && childItems.every(c => c.status?.toLowerCase() === 'completed');
          const isAnyStarted = childItems.some(c => {
            const s = c.status?.toLowerCase();
            return s === 'completed' || s === 'working' || s === 'in progress' || s === 'blocked' || s === 'awaiting approval' || s === 'pending review' || s === 'overdue' || s === 'cancelled';
          });
          
          if (isAllCompleted) {
            finalBarColor = '#22c55e'; // Green
            taskProgress = 100;
          } else if (isAnyStarted) {
            finalBarColor = 'var(--accent)'; // Blue
            taskProgress = 50;
          } else {
            finalBarColor = '#9ca3af'; // Gray
            taskProgress = 0;
          }
          finalBgColor = finalBarColor;
        } else {
          taskProgress = status === 'completed' ? 100 : (status === 'working' || status === 'in progress' ? 50 : 0);
          finalBarColor = barColor;
          finalBgColor = (status === 'overdue' || status === 'blocked' || status === 'cancelled') ? 'rgba(239, 68, 68, 0.1)' : 'rgba(0,0,0,0.05)';
        }

        finalTasks.push({
          id: t.id.toString(),
          name: isCritical && status !== 'completed' ? `🔥 ${t.name}` : t.name,
          start: taskStart,
          end: taskEnd,
          progress: taskProgress,
          type: t.isMilestone ? 'milestone' : (isGroup ? 'project' : 'task'),
          project: parentId,
          hideChildren: collapsedIds.has(t.id.toString()),
          dependencies: isGroup ? [] : dependencyIds,
          styles: {
            progressColor: finalBarColor,
            progressSelectedColor: finalBarColor,
            backgroundColor: finalBgColor,
            backgroundSelectedColor: finalBgColor,
          },
          displayOrder: currentDisplayOrder++,
          isDisabled: t.isSkipped,
          fontSize: '11px',
          // Custom properties for sub-task inheritance
          npdiModule: t.npdiModule,
          rawDependencies: dependencyIds,
          rawStartDate: t.planStartDate,
          stageName: t.stageName,
        } as any);

        // Phase 6G: Add ghost task for Baseline if toggled on
        if (showBaseline && !t.isSkipped && t.baselineStartDate && t.baselineEndDate) {
          finalTasks.push({
            id: `baseline-${t.id}`,
            name: `[Base] ${t.name}`,
            start: parseLocalDate(t.baselineStartDate),
            end: parseLocalDate(t.baselineEndDate),
            progress: 100,
            type: 'task',
            project: parentId,
            hideChildren: collapsedIds.has(t.id.toString()),
            dependencies: [],
            styles: {
              progressColor: 'transparent',
              progressSelectedColor: 'transparent',
              backgroundColor: 'rgba(156, 163, 175, 0.25)',
              backgroundSelectedColor: 'rgba(156, 163, 175, 0.35)',
            },
            displayOrder: currentDisplayOrder++,
            isDisabled: true,
            fontSize: '9px',
          });
        }
      });
    });
    // Filter out tasks whose ancestors are collapsed
    const visibleTasks = finalTasks.filter(t => {
      if (!t.project) return true;
      let currParentId: string | undefined = t.project;
      while (currParentId) {
        if (collapsedIds.has(currParentId)) {
          return false;
        }
        const parentTask = finalTasks.find(x => x.id === currParentId);
        currParentId = parentTask?.project;
      }
      return true;
    });

    // Re-assign displayOrder sequentially to avoid gaps
    const visibleWithOrder = visibleTasks.map((t, index) => ({
      ...t,
      displayOrder: index + 1
    }));

    return visibleWithOrder.filter(t => !isNaN(t.start.getTime()) && !isNaN(t.end.getTime()));
  }, [tasks, collapsedIds, showBaseline]);

  const handleTaskChange = async (task: Task) => {
    if (task.id && !task.id.startsWith('stage-')) {
      const originalTask = tasks.find(t => t.id.toString() === task.id);
      
      if (originalTask) {
        // Normalize dates to mid-night for safe comparison to avoid timezone shift issues during drag
        const originalStart = parseLocalDate(originalTask.planStartDate);
        originalStart.setHours(0, 0, 0, 0);
        const newStart = parseLocalDate(task.start);
        newStart.setHours(0, 0, 0, 0);

        if (originalStart.getTime() !== newStart.getTime() && !originalTask.isFixed) {
          alert("⚠️ No puedes mover la fecha de inicio de esta tarea porque no está fijada.\n\nPara moverla manualmente, haz clic en ella y activa la opción 'Fijar Fecha de Inicio' (📌) en el panel de detalles.\n\nNota: Sí puedes ajustar su duración arrastrando el borde derecho.");
          // We call refresh to reset the Gantt chart to the server state (undo the local drag)
          router.refresh();
          return;
        }
      }

      const fn = onDateChange || updateTaskDates;
      const res = await fn(task.id, task.start, task.end);
      if (res.success) router.refresh();
      else {
        alert(res.error || 'Error al actualizar las fechas');
        router.refresh();
      }
    }
  };

  // ── Depth-based expand/collapse for Gantt ─────────────────────────────
  /**
   * Computes a Map of task ID -> depth for all gantt tasks.
   * Stages are depth 0, their direct children are depth 1, grandchildren depth 2, etc.
   */
  const depthMap = useMemo(() => {
    const map = new Map<string, number>();
    ganttTasks.forEach(t => {
      if (t.type === 'project' && (t.id as string).startsWith('stage-')) {
        map.set(t.id as string, 0);
      } else if (!t.project || (t.project as string).startsWith('stage-')) {
        map.set(t.id as string, 1);
      } else {
        // Walk up to find depth
        let depth = 1;
        let parentId: string | undefined = t.project as string;
        const visited = new Set<string>();
        while (parentId && !visited.has(parentId) && !(parentId as string).startsWith('stage-')) {
          visited.add(parentId);
          depth++;
          parentId = ganttTasks.find(pt => pt.id === parentId)?.project as string | undefined;
        }
        map.set(t.id as string, depth);
      }
    });
    return map;
  }, [ganttTasks]);

  const ganttMaxDepth = useMemo(() => {
    let max = 0;
    depthMap.forEach(d => { if (d > max) max = d; });
    return max;
  }, [depthMap]);

  const applyGanttDepth = React.useCallback((depth: number) => {
    const toCollapse = new Set<string>();
    ganttTasks.forEach(t => {
      const hasChildren = ganttTasks.some(child => child.project === t.id);
      if (!hasChildren) return;
      const taskDepth = depthMap.get(t.id as string) ?? 0;
      // Collapse rows whose depth >= the expand depth limit
      if (taskDepth >= depth) toCollapse.add(t.id as string);
    });
    setCollapsedIds(toCollapse);
  }, [ganttTasks, depthMap]);

  const handleGanttDepthChange = React.useCallback((direction: 1 | -1) => {
    setGanttExpandDepth(prev => {
      const next = Math.min(ganttMaxDepth, Math.max(0, prev + direction));
      applyGanttDepth(next);
      return next;
    });
  }, [ganttMaxDepth, applyGanttDepth]);

  const handleCollapseAll = () => {
    setGanttExpandDepth(0);
    applyGanttDepth(0);
  };

  const handleExpandAll = () => {
    setGanttExpandDepth(ganttMaxDepth);
    setCollapsedIds(new Set());
  };

  if (ganttTasks.length === 0) {
    return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>No hay tareas para mostrar en el cronograma.</div>;
  }

  return (
    <div 
      className="gantt-container" 
      style={{ 
        background: 'var(--bg-surface)', 
        borderRadius: isFullscreen ? '0' : '12px', 
        border: isFullscreen ? 'none' : '1px solid var(--border)', 
        overflow: 'hidden',
        ...(isFullscreen ? {
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 99999,
          display: 'flex',
          flexDirection: 'column'
        } : {})
      }}
    >
      <div className="gantt-toolbar" style={{ padding: '12px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', background: 'var(--bg-surface-2)', alignItems: 'center' }}>
        
        {/* Left side controls */}
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '4px', borderRight: '1px solid var(--border)', paddingRight: '12px' }}>
            {['Day', 'Week', 'Month'].map((mode) => (
              <button 
                key={mode}
                className={`btn ${(viewMode as any) === (ViewMode as any)[mode] ? 'btn-primary' : 'btn-ghost'}`} 
                onClick={() => setViewMode((ViewMode as any)[mode])}
                style={{ fontSize: '11px', padding: '4px 12px' }}
              >
                {mode === 'Day' ? 'Día' : mode === 'Week' ? 'Semana' : 'Mes'}
              </button>
            ))}
          </div>
          
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {/* Depth-level expand/collapse controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0px' }}>
              <button
                className="btn btn-ghost"
                onClick={handleExpandAll}
                title="Expandir todo"
                style={{ fontSize: '11px', padding: '4px 8px', display: 'flex', alignItems: 'center', gap: '4px', borderRadius: '6px 0 0 6px', borderRight: 'none' }}
              >
                <Maximize2 size={12} />
              </button>
              <button
                className="btn btn-ghost"
                disabled={ganttExpandDepth >= ganttMaxDepth}
                onClick={() => handleGanttDepthChange(1)}
                title={`Expandir un nivel (nivel ${Math.min(ganttExpandDepth + 1, ganttMaxDepth)})`}
                style={{
                  fontSize: '11px', padding: '3px 7px', fontWeight: 700,
                  borderRadius: '0', border: '1px solid var(--border)', borderLeft: 'none', borderRight: 'none',
                  opacity: ganttExpandDepth >= ganttMaxDepth ? 0.4 : 1,
                  cursor: ganttExpandDepth >= ganttMaxDepth ? 'not-allowed' : 'pointer',
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
                {ganttExpandDepth === 99 ? ganttMaxDepth : ganttExpandDepth}
              </div>
              <button
                className="btn btn-ghost"
                disabled={ganttExpandDepth <= 0}
                onClick={() => handleGanttDepthChange(-1)}
                title={`Contraer un nivel (nivel ${Math.max(ganttExpandDepth - 1, 0)})`}
                style={{
                  fontSize: '11px', padding: '3px 7px', fontWeight: 700,
                  borderRadius: '0', border: '1px solid var(--border)', borderLeft: 'none', borderRight: 'none',
                  opacity: ganttExpandDepth <= 0 ? 0.4 : 1,
                  cursor: ganttExpandDepth <= 0 ? 'not-allowed' : 'pointer',
                  color: 'var(--text-secondary)'
                }}
              >
                ▲
              </button>
              <button
                className="btn btn-ghost"
                onClick={handleCollapseAll}
                title="Colapsar todo"
                style={{ fontSize: '11px', padding: '4px 8px', display: 'flex', alignItems: 'center', gap: '4px', borderRadius: '0 6px 6px 0' }}
              >
                <Minimize2 size={12} />
              </button>
            </div>
            
            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
              <button 
                className={`btn ${showBaseline ? 'btn-primary' : 'btn-ghost'}`}
                style={{ fontSize: '11px', padding: '4px 8px' }}
                onClick={() => setShowBaseline(!showBaseline)}
              >
                Baseline
              </button>
              {projectMeta && (
                projectMeta.npdi_baseline_locked === 1 ? (
                  <span style={{ fontSize: '11px', padding: '4px 8px', background: 'var(--bg-surface-2)', border: '1px solid var(--border)', borderRadius: '4px', display: 'inline-flex', alignItems: 'center', gap: '4px', color: 'var(--text-muted)' }}>
                    <Check size={12} style={{ color: '#22c55e' }} /> Línea Base Congelada
                  </span>
                ) : (
                  <button 
                    className="btn btn-ghost"
                    style={{ fontSize: '11px', padding: '4px 8px', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
                    onClick={onCaptureBaseline}
                  >
                    Capturar Línea Base
                  </button>
                )
              )}
            </div>
          </div>
        </div>

        {/* Right side controls */}
        <div>
          <button
            className="btn btn-ghost"
            onClick={() => setIsFullscreen(!isFullscreen)}
            title={isFullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
            style={{ fontSize: '11px', padding: '4px 8px', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            {isFullscreen ? <Minimize size={14} /> : <Maximize size={14} />}
            {isFullscreen ? "Salir" : "Pantalla Completa"}
          </button>
        </div>
      </div>
      
      <div style={{ padding: '1px', flex: isFullscreen ? 1 : 'none', overflowY: isFullscreen ? 'auto' : 'visible' }}>
        <Gantt
          key={`${ganttKey}-${collapsedIds.size}`}
          tasks={ganttTasks}
          viewMode={viewMode}
          onDateChange={handleTaskChange}
          onProgressChange={() => {}}
          onDoubleClick={(t) => onTaskClick?.(t.id)}
          onExpanderClick={handleExpanderClick}
          listCellWidth="260px"
          columnWidth={viewMode === ViewMode.Day ? 60 : (viewMode === ViewMode.Week ? 150 : 250)}
          rowHeight={40}
          ganttHeight={computedGanttHeight}
          fontSize="11px"
          fontFamily="system-ui, sans-serif"
          headerHeight={50}
          arrowColor="#9ca3af"
          locale="es"
          todayColor="rgba(239, 68, 68, 0.08)"
          TaskListHeader={({ headerHeight }) => (
            <div style={{ height: headerHeight, display: 'flex', alignItems: 'center', background: 'var(--bg-surface-2)', borderBottom: '1px solid var(--border)', padding: '0 12px', fontSize: '11px', fontWeight: 'bold', color: 'var(--text-muted)' }}>
              <div style={{ flex: 1 }}>NOMBRE</div>
              <div style={{ width: '60px', textAlign: 'center' }}>INICIO</div>
              <div style={{ width: '60px', textAlign: 'center' }}>FIN</div>
            </div>
          )}
          TaskListTable={({ rowHeight, tasks: ganttRowTasks, onExpanderClick }) => {
            const f = (d: Date) => {
              const day = d.getDate().toString().padStart(2, '0');
              const month = d.toLocaleDateString('es-ES', { month: 'short' }).replace('.', '').toLowerCase();
              const year = d.getFullYear().toString().substring(2);
              return `${day}-${month}-${year}`;
            };

            return (
              <div style={{ background: 'var(--bg-surface)' }}>
                {ganttRowTasks.map((t) => {
                  const isProject = t.type === 'project';
                  const isMilestone = t.type === 'milestone';
                  const isStage = isProject && t.id.startsWith('stage');
                  // INEF-04: usar Map en lugar de .find() O(n)
                  const originalTask = !isStage ? taskById.get(t.id) : undefined;
                  const isParentTask = !isStage && tasks.some(ot => ot.parentTaskId?.toString() === t.id);
                  const isChild = !isProject && !isStage && !!originalTask?.parentTaskId;
                  
                  return (
                    <div id={`gantt-row-${t.id}`} key={t.id} 
                      onClick={() => !isStage && onTaskClick?.(t.id)}
                      style={{ 
                        height: rowHeight, display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--border)', padding: '0 12px',
                        paddingLeft: isChild ? '32px' : (isStage ? '12px' : '20px'),
                        fontSize: isStage ? '11px' : '10.5px',
                        background: isStage ? 'var(--bg-surface-2)' : (isParentTask ? 'rgba(0,0,0,0.02)' : (selectedTaskId === t.id ? 'rgba(79, 140, 255, 0.08)' : 'transparent')),
                        fontWeight: isStage || isParentTask ? '600' : 'normal',
                        color: isStage ? 'var(--text-primary)' : 'var(--text-secondary)',
                        cursor: isStage ? 'default' : 'pointer', transition: 'background 0.2s',
                        borderLeft: selectedTaskId === t.id ? '3px solid var(--accent)' : 'none',
                      }}>
                      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
                        {(isStage || isParentTask) && (
                          <button onClick={(e) => { e.stopPropagation(); handleExpanderClick(t); }} style={{ background: 'none', border: 'none', padding: '2px', cursor: 'pointer', color: isStage ? 'var(--accent)' : 'var(--text-muted)', display: 'flex', alignItems: 'center', transform: t.hideChildren ? 'rotate(-90deg)' : 'none', transition: 'transform 0.2s', marginRight: '2px' }}>
                            <ChevronDown size={12} />
                          </button>
                        )}
                        {!isStage && !isMilestone && !isParentTask && isChild && <div style={{ width: '8px', height: '1px', background: 'var(--border)', marginRight: '4px' }} />}
                        
                        {/* Status Dots */}
                        {!isMilestone && !isStage && (() => {
                          // INEF-04: lookup O(1) con Map pre-calculado
                          const task = taskById.get(t.id);
                          if (!task) return null;
                          const currentStatus = task.status?.toLowerCase() || 'open';
                          const counts = statusSummaries[t.id] || {};
                          
                          const getGroupCount = (val: string) => {
                            if (val === 'Open') return (counts['Open'] || 0) + (counts['Pending'] || 0);
                            if (val === 'Working') return (counts['Working'] || 0) + (counts['In Progress'] || 0);
                            if (val === 'Pending Review') return (counts['Pending Review'] || 0) + (counts['Awaiting Approval'] || 0);
                            if (val === 'Completed') return (counts['Completed'] || 0);
                            if (val === 'Overdue') return (counts['Overdue'] || 0) + (counts['Blocked'] || 0) + (counts['Cancelled'] || 0);
                            return 0;
                          };

                          const isDotActive = (val: string) => {
                            if (val === 'Open') return currentStatus === 'open' || currentStatus === 'pending';
                            if (val === 'Working') return currentStatus === 'working' || currentStatus === 'in-progress' || currentStatus === 'in progress';
                            if (val === 'Pending Review') return currentStatus === 'pending review' || currentStatus === 'awaiting approval' || currentStatus === 'awaiting-approval';
                            if (val === 'Completed') return currentStatus === 'completed';
                            if (val === 'Overdue') return currentStatus === 'overdue' || currentStatus === 'blocked' || currentStatus === 'cancelled';
                            return false;
                          };

                          const statusList = [
                            { val: 'Open', label: 'P', color: 'var(--border)' },
                            { val: 'Working', label: 'E', color: '#3b82f6' },
                            { val: 'Pending Review', label: 'R', color: '#f59e0b' },
                            { val: 'Completed', label: 'C', color: '#22c55e' },
                            { val: 'Overdue', label: 'V', color: '#ef4444' }
                          ];
                          return (
                            <div style={{ display: 'flex', gap: '3px', marginRight: '6px', opacity: isParentTask ? 0.8 : 1 }}>
                              {statusList.map(s => {
                                const count = getGroupCount(s.val);
                                if (isParentTask && count === 0) return null;
                                return (
                                  <div key={s.val} style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                                    <div 
                                      title={`${s.label}${isParentTask ? `: ${count}` : ''}`}
                                      onClick={async (e) => { if (isParentTask || !onStatusChange) return; e.stopPropagation(); await onStatusChange(task.id, s.val); }}
                                      style={{ width: '8px', height: '8px', borderRadius: '50%', border: `1.2px solid ${s.color}`, background: isParentTask ? (count > 0 ? s.color : 'transparent') : (isDotActive(s.val) ? s.color : 'transparent'), cursor: isParentTask ? 'default' : 'pointer' }}
                                    />
                                    {isParentTask && count > 0 && <span style={{ fontSize: '9px', color: 'var(--text-muted)', fontWeight: 'bold' }}>{count}</span>}
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })()}

                        {/* Stage Summary */}
                        {isStage && (() => {
                          const counts = statusSummaries[t.id] || {};
                          const getGroupCount = (val: string) => {
                            if (val === 'Open') return (counts['Open'] || 0) + (counts['Pending'] || 0);
                            if (val === 'Working') return (counts['Working'] || 0) + (counts['In Progress'] || 0);
                            if (val === 'Pending Review') return (counts['Pending Review'] || 0) + (counts['Awaiting Approval'] || 0);
                            if (val === 'Completed') return (counts['Completed'] || 0);
                            if (val === 'Overdue') return (counts['Overdue'] || 0) + (counts['Blocked'] || 0) + (counts['Cancelled'] || 0);
                            return 0;
                          };
                          const statusList = [
                            { val: 'Open', color: 'var(--border)' },
                            { val: 'Working', color: '#3b82f6' },
                            { val: 'Pending Review', color: '#f59e0b' },
                            { val: 'Completed', color: '#22c55e' },
                            { val: 'Overdue', color: '#ef4444' }
                          ];
                          return (
                            <div style={{ display: 'flex', gap: '8px', marginRight: '10px' }}>
                              {statusList.map(s => {
                                const count = getGroupCount(s.val);
                                if (count === 0) return null;
                                return (
                                  <div key={s.val} style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                                    <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: s.color }} />
                                    <span style={{ fontSize: '9px', fontWeight: 'bold', color: 'var(--text-secondary)' }}>{count}</span>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })()}

                        {isStage && (
                          <button
                            title="Agregar tarea a esta etapa"
                            onClick={(e) => { e.stopPropagation(); onAddQuickTask?.(t.name, null); }}
                            style={{ background: 'none', border: 'none', padding: '4px', cursor: 'pointer', color: 'var(--accent)' }}
                          >
                            <Plus size={12} />
                          </button>
                        )}

                        <span title={t.name} style={{ 
                          whiteSpace: 'nowrap', 
                          overflow: 'hidden', 
                          textOverflow: 'ellipsis',
                          flex: 1,
                          minWidth: 0,
                          maxWidth: isChild ? '100px' : '140px',
                          fontSize: '10px'
                        }}>{t.name}</span>
                        
                        {!isStage && (() => {
                          // INEF-04: lookup O(1) con Map pre-calculado
                          const task = taskById.get(t.id);
                          return (
                            <div style={{ display: 'flex', gap: '2px', opacity: 0.6, transition: 'opacity 0.2s', flexShrink: 0 }}>
                              <button
                                title="Centrar en gráfica"
                                onClick={(e) => { e.stopPropagation(); handleCenterTask(t); }}
                                style={{ background: 'none', border: 'none', padding: '4px', cursor: 'pointer', color: 'var(--accent)', display: 'flex', alignItems: 'center' }}
                              >
                                <Target size={12} />
                              </button>
                              
                              <button
                                title="Agregar sub-tarea"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const deps = task?.dependencies
                                    ? task.dependencies.map((d: any) => (d.dependentOnId || d.dependsOnId || d.id)?.toString()).filter(Boolean)
                                    : [];
                                  onAddQuickTask?.(
                                    t.stageName || (t as any).stageName || task?.stageName || '',
                                    t.id,
                                    {
                                      dependencies: deps,
                                      startDate: task?.planStartDate,
                                      npdiModule: task?.npdiModule
                                    }
                                  );
                                }}
                                style={{ background: 'none', border: 'none', padding: '4px', cursor: 'pointer', color: 'var(--text-muted)' }}
                              >
                                <Plus size={10} />
                              </button>

                              {task?.isContextual && (
                                <button
                                  title="Eliminar tarea"
                                  onClick={(e) => { e.stopPropagation(); onDeleteQuickTask?.(t.id); }}
                                  style={{ background: 'none', border: 'none', padding: '4px', cursor: 'pointer', color: '#ef4444' }}
                                >
                                  <Trash2 size={10} />
                                </button>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                      <div style={{ width: '60px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '9px' }}>{f(t.start)}</div>
                      <div style={{ width: '60px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '9px' }}>{f(t.end)}</div>
                    </div>
                  );
                })}
              </div>
            );
          }}
        />
      </div>
    </div>
  );
}
