import { useEffect, useState, type FormEvent } from 'react';
import { ApiError, sprintApi, type DailyResult } from '../api';

export function DailyUpdates({ projectId, sprintId, onExpired }: { projectId: string; sprintId: string; onExpired: () => void }) {
  const [data, setData] = useState<DailyResult | null>(null);
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [input, setInput] = useState({ progress: '', nextPlan: '', blockers: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  function failure(value: unknown) {
    if (value instanceof ApiError && value.status === 401) onExpired();
    else setError(value instanceof Error ? value.message : 'Không thể tải Daily Update.');
  }
  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    sprintApi.daily(projectId, sprintId, page).then((result) => { if (active) setData(result); }).catch((value: unknown) => { if (active) failure(value); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [projectId, sprintId, page, revision]);
  async function submit(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError(''); setNotice('');
    try {
      await sprintApi.addDaily(projectId, sprintId, input);
      setInput({ progress: '', nextPlan: '', blockers: '' }); setPage(1); setRevision((value) => value + 1); setNotice('Đã lưu Daily Update.');
    } catch (value) { failure(value); }
    finally { setSaving(false); }
  }
  return <section aria-label="Daily Update" aria-busy={loading}>
    <div className="panel-heading"><h4>Daily Update</h4><button className="refresh-button" disabled={loading || saving} onClick={() => setRevision((value) => value + 1)}>Tải lại Daily Update</button></div>
    <p>Mỗi lần gửi được lưu riêng theo thời gian. Daily Update không thay đổi trạng thái Task.</p>
    {error && <p role="alert" className="form-error">{error}</p>}{notice && <p role="status">{notice}</p>}
    {data?.canCreate && <form className="workspace-form daily-form" onSubmit={submit}>
      <fieldset disabled={saving || loading}>
        <label>Tiến độ đã thực hiện<textarea required maxLength={2000} value={input.progress} onChange={(event) => setInput({ ...input, progress: event.target.value })} /></label>
        <label>Kế hoạch tiếp theo<textarea required maxLength={2000} value={input.nextPlan} onChange={(event) => setInput({ ...input, nextPlan: event.target.value })} /></label>
        <label>Blocker<textarea maxLength={2000} value={input.blockers} onChange={(event) => setInput({ ...input, blockers: event.target.value })} /></label>
        <button className="primary-button">{saving ? 'Đang lưu…' : 'Gửi Daily Update'}</button>
      </fieldset>
    </form>}
    {loading && <p role="status">Đang tải Daily Update…</p>}
    {!loading && data && <>
      {!data.canCreate && <p>Sprint hiện chỉ cho xem lịch sử Daily Update.</p>}
      {!data.items.length && <p>Chưa có Daily Update.</p>}
      {data.items.map((item) => <article key={item.id} className="daily-entry"><h5>{item.author.displayName} · {new Date(item.createdAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })} (Việt Nam)</h5><p><strong>Tiến độ:</strong> {item.progress}</p><p><strong>Kế hoạch:</strong> {item.nextPlan}</p><p><strong>Blocker:</strong> {item.blockers || 'Không có'}</p></article>)}
      <p>{data.total} cập nhật · Trang {page}/{Math.max(1, Math.ceil(data.total / data.pageSize))}</p>
      <div className="inline-fields"><button disabled={saving || page <= 1} onClick={() => setPage(page - 1)}>Daily trước</button><button disabled={saving || page * data.pageSize >= data.total} onClick={() => setPage(page + 1)}>Daily sau</button></div>
    </>}
  </section>;
}
