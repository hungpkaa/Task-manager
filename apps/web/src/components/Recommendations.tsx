import { useEffect, useState } from 'react';
import { ApiError, projectApi, type RecommendationsPage } from '../api';
import { Tasks, statusLabels } from './Tasks';

export function Recommendations({ projectId, periodStart, periodEnd, refreshKey, onExpired }: { projectId: string; periodStart: string; periodEnd: string; refreshKey: number; onExpired: () => void }) {
  const [open, setOpen] = useState(false); const [page, setPage] = useState(1); const [revision, setRevision] = useState(0);
  const [data, setData] = useState<RecommendationsPage | null>(null); const [loading, setLoading] = useState(false); const [error, setError] = useState(''); const [taskId, setTaskId] = useState('');
  useEffect(() => {
    if (!open || taskId) return;
    let active = true; setLoading(true); setError(''); setData(null);
    projectApi.recommendations(projectId, periodStart, periodEnd, page).then((result) => { if (active) setData(result); }).catch((value: unknown) => {
      if (!active) return; if (value instanceof ApiError && value.status === 401) onExpired(); else setError(value instanceof Error ? value.message : 'Không thể tải đề xuất.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [projectId, periodStart, periodEnd, refreshKey, open, page, revision, taskId]);
  function back() { setTaskId(''); setRevision((value) => value + 1); }
  if (taskId) return <div><button className="refresh-button" onClick={back}>← Về đề xuất điều phối</button><Tasks key={taskId} initialId={taskId} onExpired={onExpired} onBack={back} /></div>;
  return <section className="sprint-workload" aria-label="Đề xuất điều phối" aria-busy={loading}>
    <div className="panel-heading"><h4>Đề xuất điều phối</h4><button className="refresh-button" onClick={() => setOpen(!open)}>{open ? 'Thu gọn đề xuất' : 'Mở đề xuất điều phối'}</button></div>
    {open && <>
      <p>PM xem xét và tự thao tác trong Task. Đề xuất không tự đổi phân công hay gửi thông báo.</p>
      <p>Người gợi ý chỉ được so sánh theo Capacity đúng kỳ và Effort đã biết, chưa xét kỹ năng. Mỗi Task được tính riêng; các đề xuất không phải kế hoạch phân công đồng thời.</p>
      <button className="refresh-button" disabled={loading} onClick={() => setRevision((value) => value + 1)}>Tải lại đề xuất</button>
      {loading && <p role="status">Đang tải đề xuất…</p>}{error && <p className="form-error" role="alert">{error}</p>}
      {data && <>
        <p>Kỳ: {data.periodStart} → {data.periodEnd} · Ngày đánh giá: {data.today} (Việt Nam).</p>
        {data.projectStatus === 'CLOSED' && <p>Project đã đóng; chỉ xem dữ liệu.</p>}
        <ul>{data.advice.map((item) => <li key={item.code}>{item.message}</li>)}</ul>
        <ul className="member-list workload-list">{data.items.map((item) => <li key={item.task.id}><div>
          <strong>{item.task.title}</strong><p>{statusLabels[item.task.status]} · {item.task.assignee ?? 'Chưa phân công'}</p>
          <ul>{item.reasons.map((reason) => <li key={reason.code}>{reason.message}</li>)}</ul>
          {item.blockingCount > 0 && <p>Dependency chưa DONE: {item.blockingTasks.map((task) => task.title).join(', ')}{item.blockingCount > 3 ? ` và ${item.blockingCount - 3} Task khác` : ''}.</p>}
          {item.candidates.length > 0 ? <><p>Người có thể cân nhắc:</p><ul>{item.candidates.map((candidate) => <li key={candidate.userId}>{candidate.displayName}: {candidate.knownEffort}/{candidate.capacityPoints} Effort hiện tại; nếu nhận Task: {candidate.projectedEffort}/{candidate.capacityPoints} ({candidate.projectedPercent}%).</li>)}</ul></> : <p>Chưa có người gợi ý phù hợp. Gợi ý cần Task TODO trong kỳ, có Effort, không bị chặn và người nhận còn Capacity với dữ liệu Effort đầy đủ.</p>}
          <button className="refresh-button" onClick={() => setTaskId(item.task.id)}>Mở Task để xem xét</button>
        </div></li>)}</ul>
        {!data.total && <p>Không có Task cần đề xuất xử lý theo các tín hiệu hiện tại.</p>}
        <p>{data.total} Task · Trang {page}/{Math.max(1, Math.ceil(data.total / data.pageSize))}</p>
        <div className="inline-fields"><button disabled={loading || page <= 1} onClick={() => setPage(page - 1)}>Đề xuất trước</button><button disabled={loading || page * data.pageSize >= data.total} onClick={() => setPage(page + 1)}>Đề xuất sau</button></div>
      </>}
    </>}
  </section>;
}
