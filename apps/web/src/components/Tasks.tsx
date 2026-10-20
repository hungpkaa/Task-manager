import { useEffect, useState, useMemo, type FormEvent } from 'react';
import { Comments } from './Comments';
import { Attachments } from './Attachments';
import { TaskSprintPicker } from './TaskSprintPicker';
import { TaskDependencies } from './TaskDependencies';
import { Icon } from './Icon';
import { ApiError, projectApi, taskApi, taskStatuses, taskPriorities, type Task, type TaskInput, type TaskPage, type TaskPriority, type TaskStatus, type ProjectMember } from '../api';

export const statusLabels: Record<TaskStatus, string> = { TODO: 'Cần làm', IN_PROGRESS: 'Đang làm', REVIEW: 'Chờ duyệt', DONE: 'Hoàn thành' };
const priorityLabels: Record<TaskPriority, string> = { LOW: 'Thấp', MEDIUM: 'Trung bình', HIGH: 'Cao', URGENT: 'Khẩn cấp' };
const statusRank: Record<TaskStatus, number> = { TODO: 1, IN_PROGRESS: 2, REVIEW: 3, DONE: 4 };
const priorityRank: Record<TaskPriority, number> = { LOW: 1, MEDIUM: 2, HIGH: 3, URGENT: 4 };
const empty: TaskInput = { title: '', description: '', priority: 'MEDIUM', startDate: null, dueDate: null, effort: null };
const defaultQuery = { q: '', status: '', priority: '', assigneeId: '', sort: 'updatedAt', direction: 'desc' };

function minDate(a: string | null | undefined, b: string | null | undefined) {
  if (a && b) return a < b ? a : b;
  return a ?? b ?? undefined;
}
function maxDate(a: string | null | undefined, b: string | null | undefined) {
  if (a && b) return a > b ? a : b;
  return a ?? b ?? undefined;
}

export function Tasks({ projectId, canCreate = false, initialId, projectDates, onExpired, onBack, onTaskChange, userId }: { projectId?: string; canCreate?: boolean; initialId?: string; projectDates?: { startDate: string | null; endDate: string | null }; onExpired: () => void; onBack?: () => void; onTaskChange?: (name: string | null) => void; userId?: string }) {
  const [selected, setSelected] = useState(initialId ?? '');
  const [creating, setCreating] = useState(false);
  const [pageData, setPageData] = useState<TaskPage>({ tasks: [], total: 0, page: 1, pageSize: 20 });
  const [task, setTask] = useState<Task | null>(null);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [input, setInput] = useState<TaskInput>(empty);
  const [editingTask, setEditingTask] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [sprintId, setSprintId] = useState('');
  const [query, setQuery] = useState(defaultQuery);
  const [filters, setFilters] = useState(query);
  const [page, setPage] = useState(1);
  const [view, setView] = useState<'list' | 'board'>('list');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [pending, setPending] = useState<'delete' | 'blocked' | null>(null);
  const effectiveProjectStart = projectDates?.startDate ?? (task?.project?.startDate ? task.project.startDate.slice(0, 10) : null);
  const effectiveProjectEnd = projectDates?.endDate ?? (task?.project?.endDate ? task.project.endDate.slice(0, 10) : null);
  const [sortKey, setSortKey] = useState<'status' | 'priority' | 'deadline' | 'effort' | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  function handleSort(key: 'status' | 'priority' | 'deadline' | 'effort') {
    if (sortKey === key) {
      setSortDir((current) => (current === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  const sortedTasks = useMemo(() => {
    if (!sortKey) return pageData.tasks;
    return [...pageData.tasks].sort((a, b) => {
      if (sortKey === 'status') {
        const rankA = statusRank[a.status] ?? 0;
        const rankB = statusRank[b.status] ?? 0;
        return sortDir === 'desc' ? rankA - rankB : rankB - rankA;
      }
      if (sortKey === 'priority') {
        const rankA = priorityRank[a.priority] ?? 0;
        const rankB = priorityRank[b.priority] ?? 0;
        return sortDir === 'desc' ? rankB - rankA : rankA - rankB;
      }
      if (sortKey === 'deadline') {
        const timeA = a.dueDate ? new Date(a.dueDate).getTime() : null;
        const timeB = b.dueDate ? new Date(b.dueDate).getTime() : null;
        if (timeA === null && timeB === null) return 0;
        if (timeA === null) return 1;
        if (timeB === null) return -1;
        return sortDir === 'desc' ? timeA - timeB : timeB - timeA;
      }
      if (sortKey === 'effort') {
        const effortA = a.effort;
        const effortB = b.effort;
        if (effortA == null && effortB == null) return 0;
        if (effortA == null) return 1;
        if (effortB == null) return -1;
        return sortDir === 'desc' ? effortB - effortA : effortA - effortB;
      }
      return 0;
    });
  }, [pageData.tasks, sortKey, sortDir]);

  function failed(failure: unknown) {
    if (failure instanceof ApiError && failure.status === 401) onExpired();
    else setError(failure instanceof Error ? failure.message : 'Không thể xử lý công việc.');
  }

  useEffect(() => {
    let active = true;
    setError('');
    setPending(null);
    if (!selected && !creating) {
      setTask(null);
      setEditingTask(false);
    }
    if (!task) setLoading(true);
    async function load() {
      if (selected) {
        const result = await taskApi.detail(selected);
        const membership = result.task.canEdit ? await projectApi.members(result.task.projectId) : { members: [] };
        if (active) {
          setTask(result.task);
          setMembers(membership.members);
          setInput({
            title: result.task.title,
            description: result.task.description,
            priority: result.task.priority,
            startDate: result.task.startDate?.slice(0, 10) ?? null,
            dueDate: result.task.dueDate?.slice(0, 10) ?? null,
            effort: result.task.effort,
          });
          const currentAssigneeIds = (result.task.assigneeIds && result.task.assigneeIds.length > 0)
            ? result.task.assigneeIds
            : (result.task.assignees && result.task.assignees.length > 0)
              ? result.task.assignees.map((a) => a.id)
              : (result.task.assigneeId ? [result.task.assigneeId] : []);
          setAssigneeIds(currentAssigneeIds);
          onTaskChange?.(result.task.title);
        }
      } else if (creating && projectId) {
        setLoading(true);
        const result = await projectApi.members(projectId);
        if (active) {
          setMembers(result.members);
          setInput(empty);
          setAssigneeIds([]);
          setSprintId('');
        }
      } else {
        setLoading(true);
        if (active) setPageData({ tasks: [], total: 0, page, pageSize: 20 });
        const params = new URLSearchParams({ page: String(page), pageSize: '20' });
        for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
        const result = projectId ? await taskApi.list(projectId, params) : await taskApi.mine(params);
        const membership = projectId ? await projectApi.members(projectId) : { members: [] };
        if (active) { setPageData(result); setMembers(membership.members); }
      }
    }
    void load().catch((failure: unknown) => { if (active) failed(failure); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [projectId, selected, creating, page, filters, attempt]);

  async function mutate(operation: () => Promise<void>) {
    setBusy(true); setError(''); setNotice('');
    try { await operation(); setPending(null); setAttempt((value) => value + 1); }
    catch (failure) { failed(failure); if (failure instanceof ApiError && failure.status === 403) { setTask(null); setMembers([]); setPending(null); } }
    finally { setBusy(false); }
  }

  function open(id: string) {
    setSelected(id);
    setTask(null);
    setCreating(false);
    setEditingTask(false);
    setNotice('');
  }

  function back() {
    if (onBack) { onBack(); return; }
    if (selected) onTaskChange?.(null);
    setSelected('');
    setTask(null);
    setCreating(false);
    setEditingTask(false);
    setNotice('');
  }

  function save(event: FormEvent) {
    event.preventDefault();
    void mutate(async () => {
      if (selected) {
        const result = await taskApi.update(selected, input);
        setTask(result.task);
        setInput({
          title: result.task.title,
          description: result.task.description,
          priority: result.task.priority,
          startDate: result.task.startDate?.slice(0, 10) ?? null,
          dueDate: result.task.dueDate?.slice(0, 10) ?? null,
          effort: result.task.effort,
        });
        setEditingTask(false);
        onTaskChange?.(result.task.title);
        setNotice('Đã lưu công việc.');
      } else if (projectId) {
        const result = await taskApi.create(projectId, { ...input, assigneeIds, sprintId: sprintId || null });
        setCreating(false);
        setSelected(result.task.id);
        setTask(result.task);
        onTaskChange?.(result.task.title);
        setNotice('Đã tạo công việc.');
      }
    });
  }

  const currentIndex = task ? taskStatuses.indexOf(task.status) : -1;
  const nextStatus = task && currentIndex < taskStatuses.length - 1 ? taskStatuses[currentIndex + 1] : undefined;
  const prevStatus = task && currentIndex > 0 ? taskStatuses[currentIndex - 1] : undefined;

  function advance(acknowledgeBlocked = false) {
    if (task && nextStatus) {
      const fromLabel = statusLabels[task.status];
      const toLabel = statusLabels[nextStatus];
      void mutate(async () => {
        const result = await taskApi.status(task.id, nextStatus, task.status, acknowledgeBlocked);
        setTask(result.task);
        const message = `Đã chuyển trạng thái từ “${fromLabel}” sang “${toLabel}”.`;
        setNotice(result.warning ? `${message} (${result.warning})` : message);
      });
    }
  }

  function revert() {
    if (task && prevStatus) {
      const fromLabel = statusLabels[task.status];
      const toLabel = statusLabels[prevStatus];
      void mutate(async () => {
        const result = await taskApi.status(task.id, prevStatus, task.status, false);
        setTask(result.task);
        const message = `Đã lùi trạng thái từ “${fromLabel}” về “${toLabel}”.`;
        setNotice(result.warning ? `${message} (${result.warning})` : message);
      });
    }
  }

  const hasActiveFilters = Boolean(
    filters.q || filters.status || filters.priority || filters.assigneeId || filters.sort !== 'updatedAt' || filters.direction !== 'desc'
  );

  return (
    <section className="tasks-panel" aria-busy={loading || busy}>
      <div className="panel-heading">
        <div>
          <span className="eyebrow">{projectId ? 'CÔNG VIỆC DỰ ÁN' : 'CÔNG VIỆC CỦA BẠN'}</span>
          <h2>{selected ? task?.title ?? 'Chi tiết Task' : creating ? 'Tạo công việc' : projectId ? 'Task' : 'My Tasks'}</h2>
        </div>
        <div className="member-actions">
          {selected && task?.canEdit && (
            <button
              type="button"
              className={editingTask ? 'refresh-button' : 'primary-button'}
              disabled={busy}
              onClick={() => setEditingTask(!editingTask)}
            >
              {editingTask ? 'Đóng chỉnh sửa' : 'Sửa công việc'}
            </button>
          )}
          {selected || creating ? (
            <button className="refresh-button" disabled={busy} onClick={back}>← Danh sách</button>
          ) : canCreate && (
            <button className="primary-button" disabled={busy} onClick={() => { setCreating(true); setNotice(''); }}>+ Tạo Task</button>
          )}
          <button className="refresh-button" disabled={busy || loading} onClick={() => setAttempt((value) => value + 1)}>Tải lại</button>
        </div>
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}
      {notice && <p className="form-success" role="status">{notice}</p>}

      {loading && !task ? (
        <p role="status">Đang tải công việc…</p>
      ) : (
        <>
          {!selected && !creating && (
            <>
              <div className="member-actions" style={{ marginBottom: '12px' }}>
                <button
                  type="button"
                  className={filtersOpen ? 'refresh-button' : 'primary-button'}
                  disabled={busy || loading}
                  onClick={() => setFiltersOpen(!filtersOpen)}
                >
                  {filtersOpen ? 'Ẩn tìm kiếm & lọc' : '🔍 Tìm kiếm & Lọc'}
                  {hasActiveFilters ? ' (Đang lọc)' : ''}
                </button>
              </div>

              {filtersOpen && (
                <form
                  className="task-filters"
                  onSubmit={(event) => {
                    event.preventDefault();
                    setFilters({ ...query });
                    setPage(1);
                  }}
                >
                  <label>
                    Tìm kiếm
                    <input
                      value={query.q}
                      maxLength={200}
                      placeholder="Tiêu đề hoặc mô tả"
                      onChange={(event) => setQuery({ ...query, q: event.target.value })}
                    />
                  </label>
                  <label>
                    Trạng thái
                    <select value={query.status} onChange={(event) => setQuery({ ...query, status: event.target.value })}>
                      <option value="">Tất cả</option>
                      {taskStatuses.map((status) => (
                        <option key={status} value={status}>
                          {statusLabels[status]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <details className="advanced-filters" open={advancedOpen} onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}>
                    <summary>Bộ lọc nâng cao</summary>
                    <div className="advanced-filter-fields">
                      <label>
                        Ưu tiên
                        <select aria-label="Ưu tiên" value={query.priority} onChange={(event) => setQuery({ ...query, priority: event.target.value })}>
                          <option value="">Tất cả</option>
                          {taskPriorities.map((priority) => (
                            <option key={priority} value={priority}>
                              {priorityLabels[priority]}
                            </option>
                          ))}
                        </select>
                      </label>
                      {projectId && (
                        <label>
                          Phân công
                          <select value={query.assigneeId} onChange={(event) => setQuery({ ...query, assigneeId: event.target.value })}>
                            <option value="">Tất cả</option>
                            <option value="unassigned">Chưa phân công</option>
                            {members.map((member) => (
                              <option key={member.userId} value={member.userId}>
                                {member.user.displayName}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                      <label>
                        Sắp xếp
                        <select value={query.sort} onChange={(event) => setQuery({ ...query, sort: event.target.value })}>
                          <option value="updatedAt">Cập nhật</option>
                          <option value="dueDate">Deadline</option>
                          <option value="priority">Ưu tiên</option>
                          <option value="title">Tiêu đề</option>
                        </select>
                      </label>
                      <label>
                        Thứ tự
                        <select value={query.direction} onChange={(event) => setQuery({ ...query, direction: event.target.value })}>
                          <option value="desc">Giảm dần</option>
                          <option value="asc">Tăng dần</option>
                        </select>
                      </label>
                    </div>
                  </details>
                  <button className="primary-button">Áp dụng</button>
                  <button
                    className="refresh-button"
                    type="button"
                    onClick={() => {
                      setQuery({ ...defaultQuery });
                      setFilters({ ...defaultQuery });
                      setPage(1);
                    }}
                  >
                    Xóa bộ lọc
                  </button>
                </form>
              )}

              <div className="task-view-tabs" role="group" aria-label="Cách xem công việc">
                <button className={view === 'list' ? 'primary-button' : 'refresh-button'} aria-pressed={view === 'list'} onClick={() => setView('list')}>
                  <Icon name="task" />Danh sách
                </button>
                <button className={view === 'board' ? 'primary-button' : 'refresh-button'} aria-pressed={view === 'board'} onClick={() => setView('board')}>
                  <Icon name="board" />Kanban
                </button>
              </div>

              <p>{pageData.total} công việc · Trang {page}/{Math.max(1, Math.ceil(pageData.total / 20))} · Tối đa 20 công việc mỗi trang, áp dụng cho cả Kanban.</p>
              {!pageData.tasks.length && !error && <p>{pageData.total ? 'Trang này không còn công việc. Quay lại trang trước.' : 'Chưa có công việc phù hợp.'}</p>}

              {view === 'board' ? (
                <div className="kanban-board">
                  {taskStatuses.map((status) => (
                    <div className={`kanban-column column-${status.toLowerCase()}`} key={status}>
                      <h3>{statusLabels[status]} <span>{sortedTasks.filter((item) => item.status === status).length}</span></h3>
                      {sortedTasks.filter((item) => item.status === status).map((item) => (
                        <TaskCard key={item.id} task={item} open={open} />
                      ))}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="task-table">
                  <div className="task-table-head">
                    <span>Công việc / Project</span>
                    <button
                      type="button"
                      className={`table-head-btn ${sortKey === 'status' ? 'active' : ''}`}
                      onClick={() => handleSort('status')}
                      title="Bấm để sắp xếp theo Trạng thái"
                    >
                      Trạng thái
                    </button>
                    <button
                      type="button"
                      className={`table-head-btn ${sortKey === 'priority' ? 'active' : ''}`}
                      onClick={() => handleSort('priority')}
                      title="Bấm để sắp xếp theo Ưu tiên"
                    >
                      Ưu tiên
                    </button>
                    <span>Người phụ trách</span>
                    <button
                      type="button"
                      className={`table-head-btn ${sortKey === 'deadline' ? 'active' : ''}`}
                      onClick={() => handleSort('deadline')}
                      title="Bấm để sắp xếp theo Deadline"
                    >
                      Deadline
                    </button>
                    <button
                      type="button"
                      className={`table-head-btn ${sortKey === 'effort' ? 'active' : ''}`}
                      onClick={() => handleSort('effort')}
                      title="Bấm để sắp xếp theo Effort"
                    >
                      Effort
                    </button>
                  </div>
                  <div className="task-list">
                    {sortedTasks.map((item) => (
                      <TaskCard key={item.id} task={item} open={open} row />
                    ))}
                  </div>
                </div>
              )}

              <div className="member-actions task-pagination">
                <button className="refresh-button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>
                  ← Trang trước
                </button>
                <button className="refresh-button" disabled={page * 20 >= pageData.total} onClick={() => setPage((value) => value + 1)}>
                  Trang sau →
                </button>
              </div>
            </>
          )}

          {creating && (
            <form className="account-form workspace-form" onSubmit={save}>
              <h3>Thông tin công việc</h3>
              <fieldset disabled={busy}>
                <div className="form-field">
                  <label htmlFor="task-title">Tiêu đề</label>
                  <input id="task-title" required maxLength={200} value={input.title} onChange={(event) => setInput({ ...input, title: event.target.value })} />
                </div>
                <div className="form-field">
                  <label htmlFor="task-description">Mô tả</label>
                  <textarea id="task-description" rows={4} maxLength={10000} value={input.description} onChange={(event) => setInput({ ...input, description: event.target.value })} />
                </div>
                <div className="project-dates">
                  <div className="form-field">
                    <label htmlFor="task-start">Ngày bắt đầu</label>
                    <input id="task-start" type="date" min={effectiveProjectStart ?? undefined} max={minDate(input.dueDate, effectiveProjectEnd)} value={input.startDate ?? ''} onChange={(event) => setInput({ ...input, startDate: event.target.value || null })} />
                  </div>
                  <div className="form-field">
                    <label htmlFor="task-due">Deadline</label>
                    <input id="task-due" type="date" min={maxDate(input.startDate, effectiveProjectStart)} max={effectiveProjectEnd ?? undefined} value={input.dueDate ?? ''} onChange={(event) => setInput({ ...input, dueDate: event.target.value || null })} />
                  </div>
                </div>
                {(effectiveProjectStart || effectiveProjectEnd) && (
                  <p className="field-help">Thời gian công việc phải nằm trong thời gian của Project ({effectiveProjectStart ?? 'Không giới hạn'} → {effectiveProjectEnd ?? 'Không giới hạn'}). Ngày ngoài khoảng này sẽ bị làm mờ và không thể chọn.</p>
                )}
                <div className="task-filters">
                  <label>
                    Ưu tiên
                    <select aria-label="Ưu tiên" value={input.priority} onChange={(event) => setInput({ ...input, priority: event.target.value as TaskPriority })}>
                      {taskPriorities.map((priority) => (
                        <option key={priority} value={priority}>
                          {priorityLabels[priority]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Effort
                    <select aria-label="Effort" value={input.effort ?? ''} onChange={(event) => setInput({ ...input, effort: event.target.value ? Number(event.target.value) : null })}>
                      <option value="">Chưa đặt</option>
                      {[1, 2, 3, 5, 8].map((effort) => (
                        <option key={effort}>{effort}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Người phụ trách
                    <select aria-label="Người phụ trách" value={assigneeIds[0] ?? ''} onChange={(event) => setAssigneeIds(event.target.value ? [event.target.value] : [])}>
                      <option value="">Chưa phân công</option>
                      {members.filter((member) => member.user.status === 'ACTIVE').map((member) => (
                        <option key={member.userId} value={member.userId}>
                          {member.user.displayName} · {member.user.email}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <AssigneePicker members={members} selectedIds={assigneeIds} onChange={setAssigneeIds} disabled={busy} />
                {projectId && <TaskSprintPicker key={projectId} projectId={projectId} value={sprintId} onChange={setSprintId} disabled={busy} onExpired={onExpired} />}
                <button className="primary-button">{busy ? 'Đang lưu…' : 'Tạo Task'}</button>
              </fieldset>
            </form>
          )}

          {selected && task && (
            <>
              <div className="task-detail">
                <p className="project-description">{task.description || 'Chưa có mô tả.'}</p>
                <dl>
                  <dt>Project</dt>
                  <dd>{task.project.name}</dd>
                  <dt>Trạng thái</dt>
                  <dd>{statusLabels[task.status]}</dd>
                  <dt>Ưu tiên</dt>
                  <dd>{priorityLabels[task.priority]}</dd>
                  <dt>Người phụ trách</dt>
                  <dd>{task.assignees && task.assignees.length > 0 ? task.assignees.map((a) => a.displayName).join(', ') : (task.assignee?.displayName ?? 'Chưa phân công')}</dd>
                  <dt>Thời gian</dt>
                  <dd>{task.startDate?.slice(0, 10) ?? 'Chưa đặt'} → {task.dueDate?.slice(0, 10) ?? 'Chưa đặt'}</dd>
                  <dt>Effort</dt>
                  <dd>{task.effort ?? 'Chưa đặt'}</dd>
                </dl>
                {task.blocked && (
                  <div className="form-notice">
                    <strong>BLOCKED: còn công việc phụ thuộc chưa hoàn thành.</strong>
                    <ul style={{ margin: '8px 0 0', paddingLeft: '18px' }}>
                      {task.blockingTasks.map((blocking) => (
                        <li key={blocking.id} style={{ margin: '4px 0' }}>
                          <button
                            type="button"
                            onClick={() => {
                              open(blocking.id);
                              window.scrollTo({ top: 0, behavior: 'smooth' });
                            }}
                            style={{
                              background: 'none',
                              border: 'none',
                              padding: 0,
                              font: 'inherit',
                              fontWeight: 700,
                              color: '#1b4d3e',
                              textDecoration: 'underline',
                              cursor: 'pointer',
                              display: 'inline',
                            }}
                            title={`Chuyển nhanh đến công việc "${blocking.title}"`}
                          >
                            {blocking.title}
                          </button>{' '}
                          · {statusLabels[blocking.status]}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {task.project.status === 'CLOSED' && <p className="form-notice">Project đã đóng, công việc chỉ được xem.</p>}
                {task.canChangeStatus && (nextStatus || prevStatus) && (
                  <div className="task-status-actions">
                    {nextStatus && <button className="primary-button" disabled={busy} onClick={() => task.blocked ? setPending('blocked') : advance()}>Chuyển sang {statusLabels[nextStatus]}</button>}
                    {prevStatus && <button className="refresh-button task-demote-button" title={`Lùi trạng thái về ${statusLabels[prevStatus]}`} disabled={busy} onClick={revert}>↩ Lùi về {statusLabels[prevStatus]}</button>}
                  </div>
                )}
              </div>

              {task.canEdit && editingTask && (
                <form className="account-form workspace-form" onSubmit={save}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <h3>Sửa công việc</h3>
                    <button type="button" className="refresh-button" onClick={() => setEditingTask(false)} style={{ padding: '3px 8px', fontSize: '11px' }}>
                      ✕ Đóng
                    </button>
                  </div>
                  <fieldset disabled={busy}>
                    <div className="form-field">
                      <label htmlFor="task-title">Tiêu đề</label>
                      <input id="task-title" required maxLength={200} value={input.title} onChange={(event) => setInput({ ...input, title: event.target.value })} />
                    </div>
                    <div className="form-field">
                      <label htmlFor="task-description">Mô tả</label>
                      <textarea id="task-description" rows={4} maxLength={10000} value={input.description} onChange={(event) => setInput({ ...input, description: event.target.value })} />
                    </div>
                    <div className="project-dates">
                      <div className="form-field">
                        <label htmlFor="task-start">Ngày bắt đầu</label>
                        <input id="task-start" type="date" min={effectiveProjectStart ?? undefined} max={minDate(input.dueDate, effectiveProjectEnd)} value={input.startDate ?? ''} onChange={(event) => setInput({ ...input, startDate: event.target.value || null })} />
                      </div>
                      <div className="form-field">
                        <label htmlFor="task-due">Deadline</label>
                        <input id="task-due" type="date" min={maxDate(input.startDate, effectiveProjectStart)} max={effectiveProjectEnd ?? undefined} value={input.dueDate ?? ''} onChange={(event) => setInput({ ...input, dueDate: event.target.value || null })} />
                      </div>
                    </div>
                    {(effectiveProjectStart || effectiveProjectEnd) && (
                      <p className="field-help">Thời gian công việc phải nằm trong thời gian của Project ({effectiveProjectStart ?? 'Không giới hạn'} → {effectiveProjectEnd ?? 'Không giới hạn'}). Ngày ngoài khoảng này sẽ bị làm mờ và không thể chọn.</p>
                    )}
                    <div className="task-filters">
                      <label>
                        Ưu tiên
                        <select aria-label="Ưu tiên" value={input.priority} onChange={(event) => setInput({ ...input, priority: event.target.value as TaskPriority })}>
                          {taskPriorities.map((priority) => (
                            <option key={priority} value={priority}>
                              {priorityLabels[priority]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Effort
                        <select aria-label="Effort" value={input.effort ?? ''} onChange={(event) => setInput({ ...input, effort: event.target.value ? Number(event.target.value) : null })}>
                          <option value="">Chưa đặt</option>
                          {[1, 2, 3, 5, 8].map((effort) => (
                            <option key={effort}>{effort}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <button className="primary-button">{busy ? 'Đang lưu…' : 'Lưu thay đổi'}</button>
                  </fieldset>
                </form>
              )}

              {task.canEdit && (
                <>
                  <form
                    className="workspace-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void mutate(async () => {
                        const result = await taskApi.assign(task.id, assigneeIds);
                        setTask(result.task);
                        setNotice('Đã cập nhật người phụ trách.');
                      });
                    }}
                  >
                    <h3>Phân công công việc</h3>
                    <AssigneePicker
                      members={members}
                      selectedIds={assigneeIds}
                      onChange={setAssigneeIds}
                      disabled={busy}
                      historicalAssignees={task.assignees ?? (task.assignee ? [task.assignee] : [])}
                    />
                    <button className="primary-button" disabled={busy}>Lưu phân công</button>
                  </form>
                  <button className="danger-button" disabled={busy} onClick={() => setPending('delete')}>
                    Xóa Task
                  </button>
                </>
              )}

              {pending && (
                <div className="confirm-panel" role="group" aria-label="Xác nhận thay đổi công việc">
                  <p>{pending === 'delete' ? `Xóa công việc “${task.title}”? Thao tác này xóa dữ liệu công việc.` : 'Còn dependency chưa DONE. Bạn đã xem cảnh báo và vẫn muốn chuyển trạng thái?'}</p>
                  <button
                    className="primary-button"
                    disabled={busy}
                    onClick={() => pending === 'blocked' ? advance(true) : void mutate(async () => {
                      await taskApi.remove(task.id);
                      setSelected('');
                      setTask(null);
                      setPage(1);
                      setNotice('Đã xóa công việc.');
                    })}
                  >
                    Xác nhận
                  </button>{' '}
                  <button className="refresh-button" disabled={busy} onClick={() => setPending(null)}>
                    Hủy
                  </button>
                </div>
              )}

              <Comments key={`comments-${task.id}`} taskId={task.id} projectId={task.projectId} onExpired={onExpired} currentUserId={userId} />
              <TaskDependencies
                key={`dependencies-${task.id}`}
                taskId={task.id}
                projectId={task.projectId}
                onExpired={onExpired}
                onChanged={() => { void taskApi.detail(task.id).then((result) => setTask(result.task)).catch(failed); }}
                onOpenTask={(id) => { open(id); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
              />
              <Attachments key={`attachments-${task.id}`} taskId={task.id} onExpired={onExpired} />
            </>
          )}
        </>
      )}
    </section>
  );
}

function TaskCard({ task, open, row = false }: { task: Task; open: (id: string) => void; row?: boolean }) {
  const assignee = task.assignees && task.assignees.length > 0
    ? task.assignees.map((a) => a.displayName).join(', ')
    : (task.assignee?.displayName ?? 'Chưa phân công');
  return (
    <button className={`task-card ${row ? 'task-row' : 'board-card'}`} onClick={() => open(task.id)}>
      <span className="task-title-cell"><strong>{task.title}</strong><small>{task.project.name}{task.blocked ? ' · BLOCKED' : ''}</small></span>
      <span className={`task-badge status-${task.status.toLowerCase()}`}>{statusLabels[task.status]}</span>
      <span className={`task-badge priority-${task.priority.toLowerCase()}`}>{priorityLabels[task.priority]}</span>
      <span className="task-assignee">
        <span className="avatar-initial" aria-hidden="true">{assignee !== 'Chưa phân công' ? assignee.trim().split(/\s+/).map((part) => Array.from(part)[0]).slice(0, 2).join('').toUpperCase() : '—'}</span>
        <span>{assignee}</span>
      </span>
      <span className="task-deadline"><Icon name="clock" />{task.dueDate ? `Hạn ${task.dueDate.slice(0, 10)}` : 'Chưa đặt deadline'}</span>
      <span className="task-badge effort-badge">Effort: {task.effort ?? 'Chưa đặt'}</span>
    </button>
  );
}

function AssigneePicker({
  members,
  selectedIds,
  onChange,
  disabled = false,
  label = 'Người phụ trách',
  historicalAssignees = [],
}: {
  members: ProjectMember[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  label?: string;
  historicalAssignees?: Array<{ id: string; displayName: string; email: string }>;
}) {
  const activeMembers = members.filter((member) => member.user.status === 'ACTIVE');
  const allActiveSelected = activeMembers.length > 0 && activeMembers.every((m) => selectedIds.includes(m.userId));

  function toggleAll() {
    if (disabled) return;
    if (allActiveSelected) {
      const activeUserIds = new Set(activeMembers.map((m) => m.userId));
      onChange(selectedIds.filter((id) => !activeUserIds.has(id)));
    } else {
      const combined = new Set([...selectedIds, ...activeMembers.map((m) => m.userId)]);
      onChange(Array.from(combined));
    }
  }

  function toggleOne(userId: string) {
    if (disabled) return;
    if (selectedIds.includes(userId)) {
      onChange(selectedIds.filter((id) => id !== userId));
    } else {
      onChange([...selectedIds, userId]);
    }
  }

  const missingMembers = historicalAssignees.filter((h) => !members.some((m) => m.userId === h.id));

  return (
    <div className="assignee-picker">
      <div className="assignee-picker-header">
        <span>{label} ({selectedIds.length} đã chọn)</span>
        {activeMembers.length > 0 && (
          <button
            type="button"
            className="refresh-button assignee-select-all-button"
            disabled={disabled}
            onClick={toggleAll}
          >
            {allActiveSelected ? 'Bỏ chọn tất cả' : `Chọn tất cả (${activeMembers.length})`}
          </button>
        )}
      </div>
      <div className="assignee-list">
        {members.map((member) => {
          const isSelected = selectedIds.includes(member.userId);
          const isMemberDisabled = disabled || member.user.status !== 'ACTIVE';
          return (
            <label
              key={member.userId}
              className={`assignee-checkbox-item ${isMemberDisabled ? 'disabled' : ''}`}
            >
              <input
                type="checkbox"
                disabled={isMemberDisabled}
                checked={isSelected}
                onChange={() => toggleOne(member.userId)}
              />
              <span>{member.user.displayName}</span>
              <small>
                {member.user.email}
                {member.user.status !== 'ACTIVE' ? ' (Đã khóa)' : ''}
              </small>
            </label>
          );
        })}
        {missingMembers.map((user) => {
          const isSelected = selectedIds.includes(user.id);
          return (
            <label key={user.id} className="assignee-checkbox-item disabled">
              <input
                type="checkbox"
                disabled={disabled}
                checked={isSelected}
                onChange={() => toggleOne(user.id)}
              />
              <span>{user.displayName}</span>
              <small>{user.email} (Không còn trong Project)</small>
            </label>
          );
        })}
        {members.length === 0 && missingMembers.length === 0 && (
          <p style={{ margin: 0, color: '#6b7d60', fontSize: '12px' }}>Chưa có thành viên nào trong Project.</p>
        )}
      </div>
    </div>
  );
}
