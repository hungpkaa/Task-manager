import { useEffect, useState, type FormEvent } from 'react';
import { ApiError, sprintApi, type BacklogTask, type PlanningAssessment, type Sprint, type SprintInput, type SprintStart } from '../api';
import { SprintMonitor } from './SprintMonitor';
import { SprintFinish } from './SprintFinish';
import { SprintWorkload } from './SprintWorkload';
import { ProjectRisk } from './ProjectRisk';
const empty: SprintInput = { name: '', goal: '', startDate: '', endDate: '' };
export function Sprints({ projectId, canPlan, onExpired }: { projectId: string; canPlan: boolean; onExpired: () => void }) {
  const [open, setOpen] = useState(false);
  return <div className="sprints-panel"><button className="refresh-button" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'Ẩn Sprint & Backlog' : 'Mở Sprint & Backlog'}</button>{open && <SprintPlanning projectId={projectId} canPlan={canPlan} onExpired={onExpired} />}</div>;
}
function SprintPlanning({ projectId, canPlan, onExpired }: { projectId: string; canPlan: boolean; onExpired: () => void }) {
  const [input, setInput] = useState(empty);
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [sprintPage, setSprintPage] = useState(1);
  const [sprintTotal, setSprintTotal] = useState(0);
  const [targetId, setTargetId] = useState('');
  const [scope, setScope] = useState<'product' | 'sprint'>('product');
  const [page, setPage] = useState(1);
  const [tasks, setTasks] = useState<BacklogTask[]>([]);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<BacklogTask[]>([]);
  const [assessment, setAssessment] = useState<PlanningAssessment | null>(null);
  const [pendingStart, setPendingStart] = useState<SprintStart | null>(null);
  const [monitoring, setMonitoring] = useState(false);
  const [canMonitor, setCanMonitor] = useState(false);
  const [pendingReturn, setPendingReturn] = useState<BacklogTask | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const target = sprints.find((sprint) => sprint.id === targetId);
  function failed(failure: unknown) { if (failure instanceof ApiError && failure.status === 401) onExpired(); else setError(failure instanceof Error ? failure.message : 'Không thể xử lý Sprint.'); }
  useEffect(() => {
    let active = true; setLoading(true); setSelected([]); setAssessment(null); setPendingStart(null); setPendingReturn(null); setError('');
    Promise.all([sprintApi.list(projectId, sprintPage), scope === 'sprint' && !targetId ? Promise.resolve({ items: [], total: 0, pageSize: 20 }) : sprintApi.backlog(projectId, page, scope === 'sprint' ? targetId : '')]).then(([list, backlog]) => {
      if (active) { setSprints(list.items); setSprintTotal(list.total); setCanMonitor(list.canMonitor); setTasks(backlog.items); setTotal(backlog.total); }
    }).catch((failure: unknown) => { if (active) failed(failure); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [projectId, sprintPage, scope, targetId, page, revision]);
  async function mutate(operation: () => Promise<void>, refresh = true) {
    setBusy(true); setError(''); setNotice('');
    try { await operation(); if (refresh) setRevision((value) => value + 1); }
    catch (failure) { failed(failure); setAssessment(null); setPendingStart(null); setPendingReturn(null); }
    finally { setBusy(false); }
  }
  function create(event: FormEvent) { event.preventDefault(); void mutate(async () => { const result = await sprintApi.create(projectId, input); setInput(empty); setSprintPage(1); setTargetId(result.sprint.id); setNotice('Đã tạo Sprint PLANNED. Chọn Task từ Product Backlog để lập kế hoạch.'); }); }
  return <section aria-label="Lập kế hoạch Sprint" aria-busy={loading || busy}>
    <h3>Sprint & Backlog</h3><p>Product Backlog chứa Task chưa thuộc Sprint. Mỗi Task chỉ thuộc một Sprint trong cùng Project.</p>
    {error && <p className="form-error" role="alert">{error}</p>}{notice && <p className="form-success" role="status">{notice}</p>}
    <button className="refresh-button" disabled={busy || loading} onClick={() => setRevision((value) => value + 1)}>Tải lại Sprint & Backlog</button>
    {canPlan && <form className="account-form workspace-form" onSubmit={create}><h4>Tạo Sprint</h4><fieldset disabled={busy || loading}>
      <div className="form-field"><label htmlFor="sprint-name">Tên Sprint</label><input id="sprint-name" required maxLength={100} value={input.name} onChange={(event) => setInput({ ...input, name: event.target.value })} /></div>
      <div className="form-field"><label htmlFor="sprint-goal">Sprint Goal</label><textarea id="sprint-goal" required maxLength={2000} value={input.goal} onChange={(event) => setInput({ ...input, goal: event.target.value })} /></div>
      <div className="project-dates"><div className="form-field"><label htmlFor="sprint-start">Ngày bắt đầu Sprint</label><input id="sprint-start" type="date" required value={input.startDate} onChange={(event) => setInput({ ...input, startDate: event.target.value })} /></div><div className="form-field"><label htmlFor="sprint-end">Ngày kết thúc Sprint</label><input id="sprint-end" type="date" required min={input.startDate || undefined} value={input.endDate} onChange={(event) => setInput({ ...input, endDate: event.target.value })} /></div></div>
      <button className="primary-button">Tạo Sprint PLANNED</button>
    </fieldset></form>}
    <div className="form-field"><label htmlFor="sprint-target">Sprint đang xem / nhận Task</label><select id="sprint-target" disabled={busy || loading || Boolean(assessment)} value={targetId} onChange={(event) => { setTargetId(event.target.value); setPage(1); }}><option value="">Chọn Sprint</option>{sprints.map((sprint) => <option key={sprint.id} value={sprint.id}>{sprint.name} · {sprint.status}</option>)}</select></div>
    {target && <div className="form-notice"><strong>{target.name} · {target.status}</strong><p>{target.goal}</p><p>{target.startDate.slice(0, 10)} → {target.endDate.slice(0, 10)} · {target._count?.tasks ?? 0} Task</p></div>}
    {target && canPlan && target.status === 'PLANNED' && <button className="primary-button" disabled={busy || loading || Boolean(assessment) || Boolean(pendingStart)} onClick={() => void mutate(async () => { setPendingStart(await sprintApi.start(projectId, target, false)); }, false)}>Bắt đầu Sprint</button>}
    {pendingStart && <div className="confirm-panel" role="group" aria-label="Xác nhận bắt đầu Sprint"><h4>Bắt đầu “{pendingStart.sprint.name}”?</h4><p>{pendingStart.taskCount} Task. Sprint sẽ chuyển sang ACTIVE.</p><SprintWorkload key={pendingStart.snapshot} data={pendingStart.workload} /><ProjectRisk data={pendingStart.risk} /><ul>{pendingStart.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul><button className="primary-button" disabled={busy} onClick={() => void mutate(async () => { await sprintApi.start(projectId, pendingStart.sprint, true, pendingStart.snapshot); setMonitoring(true); setNotice('Đã bắt đầu Sprint.'); })}>Xác nhận bắt đầu Sprint</button> <button className="refresh-button" disabled={busy} onClick={() => setPendingStart(null)}>Hủy bắt đầu Sprint</button></div>}
    {target && canPlan && target.status === 'ACTIVE' && !loading && <SprintFinish key={`finish-${target.id}-${revision}`} projectId={projectId} sprint={target} sprints={sprints} onExpired={onExpired} onFinished={() => { setNotice('Đã kết thúc Sprint.'); setRevision((value) => value + 1); }} />}
    {target && canMonitor && <button className="refresh-button" aria-expanded={monitoring} disabled={busy || loading} onClick={() => setMonitoring(!monitoring)}>{monitoring ? 'Ẩn theo dõi Sprint' : 'Theo dõi Sprint'}</button>}
    {target && monitoring && canMonitor && <SprintMonitor key={`${target.id}-${revision}`} projectId={projectId} sprintId={target.id} onExpired={onExpired} />}
    <div className="inline-fields"><button className="refresh-button" disabled={busy || Boolean(assessment) || sprintPage <= 1} onClick={() => { setSprintPage(sprintPage - 1); setTargetId(''); setPage(1); }}>Sprint trước</button><span>Trang Sprint {sprintPage} / {Math.max(1, Math.ceil(sprintTotal / 20))}</span><button className="refresh-button" disabled={busy || Boolean(assessment) || sprintPage * 20 >= sprintTotal} onClick={() => { setSprintPage(sprintPage + 1); setTargetId(''); setPage(1); }}>Sprint sau</button></div>
    <div className="inline-fields"><button className="refresh-button" disabled={busy || Boolean(assessment)} aria-pressed={scope === 'product'} onClick={() => { setScope('product'); setPage(1); }}>Product Backlog</button><button className="refresh-button" disabled={busy || Boolean(assessment) || !target} aria-pressed={scope === 'sprint'} onClick={() => { setScope('sprint'); setPage(1); }}>Sprint Backlog</button></div>
    <h4>{scope === 'product' ? 'Product Backlog' : 'Sprint Backlog'} ({total})</h4>
    {loading ? <p role="status">Đang tải Backlog…</p> : <ul className="backlog-list">{tasks.map((task) => <li key={task.id}><div>{canPlan && scope === 'product' && target?.status !== 'COMPLETED' && <label><input type="checkbox" disabled={busy || Boolean(assessment)} checked={selected.some((item) => item.id === task.id)} onChange={(event) => setSelected(event.target.checked ? [...selected, task] : selected.filter((item) => item.id !== task.id))} /> Chọn {task.title}</label>}<strong>{task.title}</strong><p>{task.status} · {task.priority} · Effort: {task.effort ?? 'Chưa ước lượng'} · {task.assignee?.displayName ?? 'Chưa phân công'}</p></div>{canPlan && scope === 'sprint' && target?.status === 'PLANNED' && <button className="refresh-button" disabled={busy} onClick={() => setPendingReturn(task)}>Đưa về Product Backlog</button>}</li>)}</ul>}
    {!loading && !tasks.length && <p>Backlog chưa có Task.</p>}
    <div className="inline-fields"><button className="refresh-button" disabled={busy || loading || Boolean(assessment) || page <= 1} onClick={() => setPage(page - 1)}>Task trước</button><span>Trang Task {page} / {Math.max(1, Math.ceil(total / 20))}</span><button className="refresh-button" disabled={busy || loading || Boolean(assessment) || page * 20 >= total} onClick={() => setPage(page + 1)}>Task sau</button></div>
    {canPlan && scope === 'product' && <button className="primary-button" disabled={busy || loading || !selected.length || !target || target.status === 'COMPLETED' || Boolean(assessment)} onClick={() => void mutate(async () => { setAssessment(await sprintApi.plan(projectId, targetId, selected.map(({ id, updatedAt }) => ({ id, updatedAt })), false)); }, false)}>Kiểm tra kế hoạch ({selected.length} Task)</button>}
    {assessment && <div className="confirm-panel" role="group" aria-label="Xác nhận kế hoạch Sprint"><h4>Kiểm tra trước khi đưa Task vào Sprint</h4><p>{assessment.taskCount} Task · Tổng Effort đã biết: {assessment.totalEffort} · Chưa ước lượng: {assessment.missingEffort}</p><SprintWorkload key={assessment.snapshot} data={assessment.workload} /><ProjectRisk data={assessment.risk} /><ul>{assessment.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul><button className="primary-button" disabled={busy} onClick={() => void mutate(async () => { await sprintApi.plan(projectId, targetId, selected.map(({ id, updatedAt }) => ({ id, updatedAt })), true, assessment.snapshot); setScope('sprint'); setPage(1); setNotice('Đã lập Sprint Backlog.'); })}>Xác nhận đưa vào Sprint</button> <button className="refresh-button" disabled={busy} onClick={() => setAssessment(null)}>Hủy kế hoạch</button></div>}
    {pendingReturn && <div className="confirm-panel" role="group" aria-label="Xác nhận đưa Task về Backlog"><p>Đưa “{pendingReturn.title}” về Product Backlog?</p><button className="primary-button" disabled={busy} onClick={() => void mutate(async () => { await sprintApi.returnTask(projectId, targetId, pendingReturn); setNotice('Đã đưa Task về Product Backlog.'); })}>Xác nhận đưa về Backlog</button> <button className="refresh-button" disabled={busy} onClick={() => setPendingReturn(null)}>Hủy</button></div>}
  </section>;
}
