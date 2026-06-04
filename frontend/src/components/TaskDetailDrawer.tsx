import React, { useState, useEffect, useCallback, useRef } from 'react';
import './TaskDetailDrawer.css';
import {
  X,
  Flag,
  Clock,
  CheckCircle2,
  AlertCircle,
  Send,
  Trash2,
  Plus,
  Loader2,
  Calendar,
  ShieldCheck,
  Layers,
  ExternalLink,
} from 'lucide-react';

interface TaskDependency {
  id: string;
  name: string;
  status: string;
  stageName: string;
}

interface TaskAttachment {
  name: string;
  file_url: string;
  file_name: string;
}

interface TaskComment {
  id: string;
  content: string;
  author: { name: string };
  createdAt: string;
}

interface TaskDetail {
  id: string;
  name: string;
  status: string;
  planStartDate: string | null;
  planEndDate: string | null;
  durationDays: number | null;
  role: { name: string } | null;
  assignedTo: { name: string; email: string } | null;
  stageName: string;
  npdiModule: string;
  dependencies: TaskDependency[];
  blockedBy: TaskDependency[];
  comments: TaskComment[];
  attachments: TaskAttachment[];
  isMilestone: boolean;
  isCritical: boolean;
  slack: string | null;
  isFixed: boolean;
  manualStartDate: string | null;
  requiresAttachment: boolean;
  isSkipped: boolean;
}

interface TaskDetailDrawerProps {
  taskId: string | null;
  onClose: () => void;
  onRefresh: () => void;
}

const STATUS_MAP: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  Pending: { label: 'Pendiente', icon: Clock, color: 'var(--text-muted)' },
  'In Progress': { label: 'En curso', icon: Loader2, color: 'var(--accent)' },
  Completed: { label: 'Completado', icon: CheckCircle2, color: 'green' },
  Blocked: { label: 'Bloqueado', icon: AlertCircle, color: 'red' },
};

const TaskDetailDrawer: React.FC<TaskDetailDrawerProps> = ({ taskId, onClose, onRefresh }) => {
  const [taskDetail, setTaskDetail] = useState<TaskDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newComment, setNewComment] = useState('');
  const [statusUpdating, setStatusUpdating] = useState<string | null>(null);
  const [durationEdit, setDurationEdit] = useState<number | null>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  // Fetch task detail when taskId changes
  const fetchTaskDetail = useCallback(() => {
    if (!taskId) return;
    setLoading(true);
    setError(null);
    // @ts-ignore
    window.frappe.call({
      method: 'erpnext_npdi_suite.api.get_task_detail',
      args: { task_id: taskId },
      callback: (r: any) => {
        setLoading(false);
        if (r.message && r.message.success) {
          const data = r.message.data as TaskDetail;
          setTaskDetail(data);
          setDurationEdit(data.durationDays);
        } else {
          setError('Error al cargar la tarea');
        }
      },
    });
  }, [taskId]);

  useEffect(() => {
    fetchTaskDetail();
  }, [fetchTaskDetail]);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Change status
  const handleStatusChange = (newStatus: string) => {
    if (!taskId || statusUpdating) return;
    setStatusUpdating(newStatus);
    // @ts-ignore
    window.frappe.call({
      method: 'erpnext_npdi_suite.api.update_task_status',
      args: { task_id: taskId, status: newStatus },
      callback: (r: any) => {
        setStatusUpdating(null);
        if (r.message && r.message.success) {
          setTaskDetail((prev) => (prev ? { ...prev, status: newStatus } : null));
          onRefresh();
        } else {
          setError('Error al actualizar estado');
        }
      },
    });
  };

  // Remove dependency
  const handleRemoveDependency = (depId: string) => {
    if (!taskId) return;
    // @ts-ignore
    window.frappe.call({
      method: 'erpnext_npdi_suite.api.remove_task_dependency',
      args: { task_id: taskId, depends_on: depId },
      callback: (r: any) => {
        if (r.message && r.message.success) {
          setTaskDetail((prev) =>
            prev
              ? {
                  ...prev,
                  dependencies: prev.dependencies.filter((d) => d.id !== depId),
                }
              : null
          );
          onRefresh();
        } else {
          setError('Error al eliminar dependencia');
        }
      },
    });
  };

  // Add comment
  const handleAddComment = () => {
    if (!taskId || !newComment.trim()) return;
    const content = newComment.trim();
    // @ts-ignore
    window.frappe.call({
      method: 'erpnext_npdi_suite.api.add_task_comment',
      args: { task_id: taskId, content },
      callback: (r: any) => {
        if (r.message && r.message.success) {
          const newCommentObj = r.message.comment as TaskComment;
          setTaskDetail((prev) =>
            prev ? { ...prev, comments: [...prev.comments, newCommentObj] } : null
          );
          setNewComment('');
          onRefresh();
        } else {
          setError('Error al agregar comentario');
        }
      },
    });
  };

  // Delete comment
  const handleDeleteComment = (commentId: string) => {
    // @ts-ignore
    window.frappe.call({
      method: 'erpnext_npdi_suite.api.delete_task_comment',
      args: { comment_id: commentId },
      callback: (r: any) => {
        if (r.message && r.message.success) {
          setTaskDetail((prev) =>
            prev
              ? { ...prev, comments: prev.comments.filter((c) => c.id !== commentId) }
              : null
          );
          onRefresh();
        } else {
          setError('Error al eliminar comentario');
        }
      },
    });
  };

  // Update duration on blur
  const handleDurationBlur = () => {
    if (!taskId || durationEdit === null || durationEdit === taskDetail?.durationDays) return;
    // @ts-ignore
    window.frappe.call({
      method: 'erpnext_npdi_suite.api.update_task_duration',
      args: { task_id: taskId, duration_days: durationEdit },
      callback: (r: any) => {
        if (r.message && r.message.success) {
          setTaskDetail((prev) => (prev ? { ...prev, durationDays: durationEdit } : null));
          onRefresh();
        } else {
          setError('Error al actualizar duración');
          setDurationEdit(taskDetail?.durationDays ?? null);
        }
      },
    });
  };

  // Format date
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-ES', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  // Get initials for avatar
  const getInitials = (name: string) => name.slice(0, 2).toUpperCase();

  // Keyboard shortcut for comment send
  const handleCommentKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.ctrlKey && e.key === 'Enter') {
      e.preventDefault();
      handleAddComment();
    }
  };

  // Render loading spinner
  if (loading) {
    return (
      <>
        <div className="drawer-backdrop" onClick={onClose} />
        <div className="task-drawer" ref={drawerRef}>
          <div className="drawer-loading">
            <Loader2 className="animate-spin" size={32} />
          </div>
        </div>
      </>
    );
  }

  // Render error
  if (error || !taskDetail) {
    return (
      <>
        <div className="drawer-backdrop" onClick={onClose} />
        <div className="task-drawer" ref={drawerRef}>
          <div className="drawer-error">
            <X size={24} />
            <p>{error || 'No se pudo cargar la tarea'}</p>
            <button onClick={onClose}>Cerrar</button>
          </div>
        </div>
      </>
    );
  }

  const currentStatus = STATUS_MAP[taskDetail.status] || STATUS_MAP.Pending;
  const StatusIcon = currentStatus.icon;

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <div className="task-drawer" ref={drawerRef}>
        {/* Header */}
        <div className="drawer-header">
          <div className="drawer-badges">
            {taskDetail.isMilestone && (
              <span className="badge badge-milestone">
                <Flag size={14} /> Hito
              </span>
            )}
            <span className="badge badge-stage">
              <Layers size={14} /> {taskDetail.stageName}
            </span>
          </div>
          <h2 className="drawer-title">{taskDetail.name}</h2>
          <button className="drawer-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Status bar */}
        <div className="drawer-section drawer-status-bar">
          {Object.entries(STATUS_MAP).map(([key, { label, icon: Icon, color }]) => (
            <button
              key={key}
              className={`status-btn ${taskDetail.status === key ? 'active' : ''}`}
              style={{ '--status-color': color } as React.CSSProperties}
              onClick={() => handleStatusChange(key)}
              disabled={statusUpdating === key}
            >
              {statusUpdating === key ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Icon size={16} />
              )}
              <span>{label}</span>
            </button>
          ))}
        </div>

        {/* Info grid */}
        <div className="drawer-section">
          <div className="drawer-info-grid">
            <div className="info-item">
              <span className="info-label">
                <ShieldCheck size={14} /> Rol Responsable
              </span>
              <span className="info-value">{taskDetail.role?.name || '-'}</span>
            </div>
            <div className="info-item">
              <span className="info-label">
                <ShieldCheck size={14} /> Asignado a
              </span>
              <span className="info-value">
                {taskDetail.assignedTo?.name || 'Sin asignar'}
              </span>
            </div>
            <div className="info-item">
              <span className="info-label">
                <Layers size={14} /> Etapa
              </span>
              <span className="info-value">{taskDetail.stageName || '-'}</span>
            </div>
            <div className="info-item">
              <span className="info-label">
                <Calendar size={14} /> Fecha Plan
              </span>
              <span className="info-value">{formatDate(taskDetail.planEndDate)}</span>
            </div>
            <div className="info-item">
              <span className="info-label">
                <Clock size={14} /> Duración (días)
              </span>
              <input
                type="number"
                className="info-input"
                value={durationEdit ?? ''}
                onChange={(e) => setDurationEdit(Number(e.target.value))}
                onBlur={handleDurationBlur}
                min={0}
              />
            </div>
          </div>
        </div>

        {/* Dependencies section */}
        <div className="drawer-section drawer-dependencies">
          <h3 className="drawer-section-title">Depende de</h3>
          <div className="dependency-list">
            {taskDetail.dependencies.map((dep) => {
              const depStatus = STATUS_MAP[dep.status] || STATUS_MAP.Pending;
              const DepIcon = depStatus.icon;
              return (
                <div key={dep.id} className="dependency-item">
                  <DepIcon size={16} style={{ color: depStatus.color }} />
                  <span className="dependency-name">{dep.name}</span>
                  <span className="dependency-stage">{dep.stageName}</span>
                  <button
                    className="dependency-remove"
                    onClick={() => handleRemoveDependency(dep.id)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })}
            {taskDetail.dependencies.length === 0 && (
              <p className="empty-state">Sin dependencias</p>
            )}
          </div>

          <h3 className="drawer-section-title">Bloquea a</h3>
          <div className="dependency-list read-only">
            {taskDetail.blockedBy.map((blocked) => {
              const blockStatus = STATUS_MAP[blocked.status] || STATUS_MAP.Pending;
              const BlockIcon = blockStatus.icon;
              return (
                <div key={blocked.id} className="dependency-item">
                  <BlockIcon size={16} style={{ color: blockStatus.color }} />
                  <span className="dependency-name">{blocked.name}</span>
                  <span className="dependency-stage">{blocked.stageName}</span>
                </div>
              );
            })}
            {taskDetail.blockedBy.length === 0 && (
              <p className="empty-state">No bloquea a ninguna tarea</p>
            )}
          </div>
        </div>

        {/* Attachments section */}
        <div className="drawer-section drawer-attachments">
          <h3 className="drawer-section-title">Adjuntos</h3>
          <div className="attachment-list">
            {taskDetail.attachments.map((att, idx) => (
              <a
                key={idx}
                href={att.file_url}
                target="_blank"
                rel="noopener noreferrer"
                className="attachment-item"
              >
                <ExternalLink size={14} />
                <span>{att.file_name}</span>
              </a>
            ))}
            {taskDetail.attachments.length === 0 && (
              <p className="empty-state">Sin adjuntos</p>
            )}
          </div>
          {/* "Open in Frappe" link matching reference – but this is inside attachments? Actually reference says at bottom. We'll also have a bottom link. */}
        </div>

        {/* Comments section - flex-grow and scrollable */}
        <div className="drawer-section drawer-comments">
          <h3 className="drawer-section-title">Comentarios</h3>
          <div className="comments-list">
            {taskDetail.comments.map((comment) => (
              <div key={comment.id} className="comment-item">
                <div className="comment-avatar">{getInitials(comment.author.name)}</div>
                <div className="comment-body">
                  <div className="comment-meta">
                    <span className="comment-author">{comment.author.name}</span>
                    <span className="comment-time">
                      {new Date(comment.createdAt).toLocaleString('es-ES', {
                        hour: '2-digit',
                        minute: '2-digit',
                        day: 'numeric',
                        month: 'short',
                      })}
                    </span>
                  </div>
                  <p className="comment-content">{comment.content}</p>
                  <button
                    className="comment-delete"
                    onClick={() => handleDeleteComment(comment.id)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
            {taskDetail.comments.length === 0 && (
              <p className="empty-state">Sin comentarios</p>
            )}
          </div>
          <div className="comment-compose">
            <textarea
              className="comment-textarea"
              placeholder="Escribe un comentario..."
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              onKeyDown={handleCommentKeyDown}
              rows={2}
            />
            <button className="comment-send" onClick={handleAddComment} disabled={!newComment.trim()}>
              <Send size={16} />
            </button>
          </div>
        </div>

        {/* Bottom link */}
        <div className="drawer-footer">
          <a
            href={`/app/task/${taskId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="frappe-link"
            onClick={(e) => {
              e.preventDefault();
              window.open(`/app/task/${taskId}`, '_blank');
            }}
          >
            <ExternalLink size={16} />
            Abrir en Formulario Frappe
          </a>
        </div>
      </div>
    </>
  );
};

export default TaskDetailDrawer;
