import { useEffect, useState, type FormEvent } from 'react';
import { ApiError, projectApi, type CapacityPage, type WorkloadPage } from '../api';
import { ProjectRisk } from './ProjectRisk';
import { Recommendations } from './Recommendations';
import { DatePicker } from './DatePicker';

function currentPeriod() {
  const today = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
  return { start: `${today.slice(0, 7)}-01`, end: new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0)).toISOString().slice(0, 10) };
}
export function Workload({ projectId, onExpired }: { projectId: string; onExpired: () => void }) {
  const open = true;
  const [period, setPeriod] = useState(currentPeriod); const [draft, setDraft] = useState(period);
  const [page, setPage] = useState(1); const [historyPage, setHistoryPage] = useState(1); const [revision, setRevision] = useState(0);
  const [data, setData] = useState<WorkloadPage | null>(null); const [history, setHistory] = useState<CapacityPage | null>(null);
  const [loading, setLoading] = useState(false); const [busy, setBusy] = useState(false);
  const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState<{ userId: string; name: string; points: string; expectedUpdatedAt: string | null } | null>(null);
  function fail(value: unknown) { if (value instanceof ApiError && value.status === 401) onExpired(); else setError(value instanceof Error ? value.message : 'Không thể tải điều phối.'); }
  useEffect(() => {
    if (!open) return;
    let active = true; setLoading(true); setError(''); setEditing(null); setData(null); setHistory(null);
    Promise.all([projectApi.workload(projectId, period.start, period.end, page), projectApi.capacities(projectId, historyPage)])
      .then(([result, records]) => { if (active) { setData(result); setHistory(records); } })
      .catch((value: unknown) => { if (active) fail(value); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [projectId, open, period.start, period.end, page, historyPage, revision]);
  function selectPeriod(start: string, end: string) { setPeriod({ start, end }); setDraft({ start, end }); setPage(1); setNotice(''); setRevision((value) => value + 1); }
  async function save(event: FormEvent) {
    event.preventDefault(); if (!editing) return; setBusy(true); setError(''); setNotice('');
    try { await projectApi.saveCapacity(projectId, { userId: editing.userId, periodStart: period.start, periodEnd: period.end, capacityPoints: Number(editing.points), expectedUpdatedAt: editing.expectedUpdatedAt }); setNotice('Đã lưu Capacity và tính lại Workload.'); setHistoryPage(1); setRevision((value) => value + 1); }
    catch (value) { fail(value); } finally { setBusy(false); }
  }
  return <section className="sprints-panel capacity-workload-panel" aria-label="Capacity và Workload" aria-busy={loading || busy}>
    <div className="panel-heading"><h3>Capacity và Workload</h3></div>
    {open && <>
      <details className="workload-method"><summary>Cách tính Workload</summary><p>Workload = Effort Task chưa hoàn thành trong kỳ / Capacity × 100%. Capacity phải khớp kỳ đang xem; Task thiếu Effort có thể làm số liệu thấp hơn thực tế.</p></details>
      <form className="workspace-form workload-period-form" onSubmit={(event) => { event.preventDefault(); selectPeriod(draft.start, draft.end); }}><fieldset disabled={busy || loading}><div className="project-dates workload-period-fields"><DatePicker id="workload-start" label="Từ ngày" value={draft.start} disabled={busy || loading} onChange={(start) => setDraft({ ...draft, start })} /><DatePicker id="workload-end" label="Đến ngày" value={draft.end} min={draft.start} disabled={busy || loading} onChange={(end) => setDraft({ ...draft, end })} /></div><button className="primary-button">Xem Workload</button></fieldset></form>
      <button className="refresh-button" disabled={busy || loading} onClick={() => setRevision((value) => value + 1)}>Tải lại Workload</button>
      {error && <p className="form-error" role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}{loading && <p role="status">Đang tải Workload…</p>}
      {data && <>
        <ProjectRisk data={data.risk} />
        <Recommendations key={`${period.start}:${period.end}`} projectId={projectId} periodStart={period.start} periodEnd={period.end} refreshKey={revision} onExpired={onExpired} />
        <div className="workload-period-summary"><div><span className="eyebrow">KỲ ĐANG XEM</span><strong>{data.periodStart} <span>→</span> {data.periodEnd}</strong></div><div className="workload-period-counts"><span><strong>{data.summary.taskCount}</strong> Task đang mở</span><span><strong>{data.summary.knownEffort}</strong> Effort đã biết</span></div></div>
        {(data.summary.missingEffortCount > 0 || data.summary.unassignedCount > 0) && <p className="workload-data-note">{data.summary.missingEffortCount > 0 && <span>{data.summary.missingEffortCount} thiếu Effort</span>}{data.summary.missingEffortCount > 0 && data.summary.unassignedCount > 0 && <i>·</i>}{data.summary.unassignedCount > 0 && <span>{data.summary.unassignedCount} chưa phân công ({data.summary.unassignedEffort} Effort)</span>}</p>}
        {!data.canEdit && <p>Project đã đóng; chỉ xem dữ liệu.</p>}
        <ul className="member-list workload-list">{data.items.map((item) => <li key={item.user.id}><div className="workload-member-content"><div className="workload-member-identity"><strong>{item.user.displayName}</strong><span>{item.user.email}{item.user.status === 'LOCKED' ? ' · Tài khoản khóa' : ''}</span></div><div className="workload-member-metrics"><span><strong>{item.taskCount}</strong> Task</span><span><strong>{item.knownEffort}</strong> Effort</span><span><strong>{item.capacity?.capacityPoints ?? '—'}</strong> Capacity</span><span className={item.overloaded ? 'is-overloaded' : item.percent === null ? 'is-unknown' : 'is-ok'}><strong>{item.percent === null ? '—' : `${item.percent}%`}</strong> Workload</span></div>{(item.missingEffortCount > 0 || !item.complete) && <p className="workload-member-note">{item.missingEffortCount > 0 ? `${item.missingEffortCount} Task thiếu Effort` : 'Dữ liệu chưa đầy đủ'}</p>}</div>{data.canEdit && item.user.status === 'ACTIVE' && <button className="refresh-button" disabled={busy} onClick={() => { setEditing({ userId: item.user.id, name: item.user.displayName, points: String(item.capacity?.capacityPoints ?? ''), expectedUpdatedAt: item.capacity?.updatedAt ?? null }); setNotice(''); }}>Thiết lập Capacity</button>}</li>)}</ul>
        <div className="workload-pagination"><span>{data.total} thành viên · Trang {page}/{Math.max(1, Math.ceil(data.total / 20))}</span><div className="inline-fields"><button className="refresh-button" disabled={busy || loading || page <= 1} onClick={() => setPage(page - 1)}>Trước</button><button className="refresh-button" disabled={busy || loading || page * 20 >= data.total} onClick={() => setPage(page + 1)}>Sau</button></div></div>
        {editing && data.canEdit && <form className="workspace-form capacity-edit-form" aria-label="Thiết lập Capacity" onSubmit={(event) => void save(event)}>
          <div className="capacity-edit-heading"><div><span className="eyebrow">THIẾT LẬP NGUỒN LỰC</span><h4>Capacity: {editing.name}</h4></div><span className="capacity-period">{period.start} <span>→</span> {period.end}</span></div>
          <div className="capacity-edit-controls"><label className="form-field">Capacity (điểm)<input aria-label="Capacity (điểm)" type="number" required min={1} max={1000000} step={1} disabled={busy} value={editing.points} onChange={(event) => setEditing({ ...editing, points: event.target.value })} /></label>
            <div className="capacity-edit-actions"><button className="primary-button" disabled={busy}>{busy ? 'Đang lưu…' : 'Lưu Capacity'}</button><button type="button" className="refresh-button" disabled={busy} onClick={() => setEditing(null)}>Hủy</button></div>
          </div>
        </form>}
      </>}
      {history && <section className="capacity-history"><div className="capacity-history-heading"><h4>Capacity đã lưu</h4><span>{history.total} bản ghi</span></div><details className="capacity-history-help"><summary>Quy tắc kỳ Capacity</summary><p>Các kỳ của cùng thành viên không được chồng nhau. Lịch sử vẫn được giữ khi thành viên rời Project.</p></details><ul className="dependency-list">{history.items.map((item) => <li key={item.id}><div><strong>{item.user.displayName}</strong><span>{item.periodStart.slice(0, 10)} → {item.periodEnd.slice(0, 10)}</span><b>{item.capacityPoints} điểm</b></div><button className="refresh-button" disabled={busy || loading} onClick={() => selectPeriod(item.periodStart.slice(0, 10), item.periodEnd.slice(0, 10))}>Xem kỳ</button></li>)}</ul>{!history.items.length && <p className="capacity-history-empty">Chưa có Capacity được lưu.</p>}<div className="workload-pagination"><span>Trang {historyPage}/{Math.max(1, Math.ceil(history.total / 20))}</span><div className="inline-fields"><button className="refresh-button" disabled={busy || loading || historyPage <= 1} onClick={() => setHistoryPage(historyPage - 1)}>Trước</button><button className="refresh-button" disabled={busy || loading || historyPage * 20 >= history.total} onClick={() => setHistoryPage(historyPage + 1)}>Sau</button></div></div></section>}
    </>}
  </section>;
}
