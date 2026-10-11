import { useEffect, useState, type FormEvent } from 'react';
import { ApiError, sprintApi, type ReviewResult } from '../api';

export function SprintReview({ projectId, sprintId, onExpired }: { projectId: string; sprintId: string; onExpired: () => void }) {
  const [data, setData] = useState<ReviewResult | null>(null);
  const [input, setInput] = useState({ summary: '', feedback: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  function failure(value: unknown) {
    if (value instanceof ApiError && value.status === 401) onExpired();
    else setError(value instanceof Error ? value.message : 'Không thể tải Sprint Review.');
  }
  useEffect(() => {
    let active = true; setLoading(true); setError('');
    sprintApi.review(projectId, sprintId).then((result) => {
      if (active) { setData(result); setInput({ summary: result.review?.summary ?? '', feedback: result.review?.feedback ?? '' }); }
    }).catch((value: unknown) => { if (active) failure(value); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [projectId, sprintId, revision]);
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!data) return;
    setSaving(true); setError(''); setNotice('');
    try {
      const review = await sprintApi.saveReview(projectId, sprintId, { ...input, expectedUpdatedAt: data.review?.updatedAt ?? null });
      setData({ ...data, review, current: { doneCount: review.doneCount, incompleteCount: review.incompleteCount } });
      setInput({ summary: review.summary, feedback: review.feedback }); setNotice('Đã lưu Sprint Review.');
    } catch (value) { failure(value); }
    finally { setSaving(false); }
  }
  return <section aria-label="Sprint Review" aria-busy={loading}>
    <div className="panel-heading"><h4>Sprint Review</h4><button className="refresh-button" disabled={loading || saving} onClick={() => setRevision((value) => value + 1)}>Tải lại Sprint Review</button></div>
    <p>Ghi nhận kết quả và phản hồi về sản phẩm/công việc. Tải lại Review sẽ lấy nội dung đã lưu.</p>
    {error && <p role="alert" className="form-error">{error}</p>}{notice && <p role="status">{notice}</p>}{loading && <p role="status">Đang tải Sprint Review…</p>}
    {data && <>
      <p>Task hiện tại: DONE {data.current.doneCount} · Chưa DONE {data.current.incompleteCount}</p>
      {data.review ? <article className="daily-entry"><h5>Cập nhật bởi {data.review.author.displayName} · {new Date(data.review.updatedAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })} (Việt Nam)</h5><p><strong>Tổng kết:</strong> {data.review.summary}</p><p><strong>Phản hồi:</strong> {data.review.feedback}</p><p>Tại lần lưu: DONE {data.review.doneCount} · Chưa DONE {data.review.incompleteCount}</p></article> : <p>Chưa có Sprint Review.</p>}
      {data.canEdit ? <form className="workspace-form daily-form" onSubmit={submit}><fieldset disabled={loading || saving}>
        <label>Tổng kết Sprint<textarea aria-label="Tổng kết Sprint" required maxLength={4000} value={input.summary} onChange={(event) => setInput({ ...input, summary: event.target.value })} /></label>
        <label>Phản hồi Sprint<textarea aria-label="Phản hồi Sprint" required maxLength={4000} value={input.feedback} onChange={(event) => setInput({ ...input, feedback: event.target.value })} /></label>
        <button className="primary-button">{saving ? 'Đang lưu…' : 'Lưu Sprint Review'}</button>
      </fieldset></form> : <p>Chỉ PM hiện tại được sửa Review trước khi Sprint hoàn thành.</p>}
    </>}
  </section>;
}
