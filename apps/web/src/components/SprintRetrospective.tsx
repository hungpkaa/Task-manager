import { useEffect, useState, type FormEvent } from 'react';
import { ApiError, sprintApi, type RetrospectiveResult } from '../api';

const fields = { wentWell: 'Điều làm tốt', needsImprovement: 'Điều cần cải thiện', actionItems: 'Việc sẽ thực hiện' };
const emptyInput = { wentWell: '', needsImprovement: '', actionItems: '' };
export function SprintRetrospective({ projectId, sprintId, onExpired }: { projectId: string; sprintId: string; onExpired: () => void }) {
  const [data, setData] = useState<RetrospectiveResult | null>(null);
  const [input, setInput] = useState(emptyInput);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  function failure(value: unknown) {
    if (value instanceof ApiError && value.status === 401) onExpired();
    else setError(value instanceof Error ? value.message : 'Không thể tải Retrospective.');
  }
  useEffect(() => {
    let active = true; setLoading(true); setError(''); setNotice('');
    sprintApi.retrospective(projectId, sprintId).then((result) => {
      if (active) { setData(result); const record = result.retrospective; setInput(record ? { wentWell: record.wentWell, needsImprovement: record.needsImprovement, actionItems: record.actionItems } : emptyInput); }
    }).catch((value: unknown) => { if (active) failure(value); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [projectId, sprintId, revision]);
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!data) return;
    setSaving(true); setError(''); setNotice('');
    try {
      const record = await sprintApi.saveRetrospective(projectId, sprintId, { ...input, expectedUpdatedAt: data.retrospective?.updatedAt ?? null });
      setData({ ...data, retrospective: record });
      setInput({ wentWell: record.wentWell, needsImprovement: record.needsImprovement, actionItems: record.actionItems }); setNotice('Đã lưu Retrospective.');
    } catch (value) { failure(value); }
    finally { setSaving(false); }
  }
  const record = data?.retrospective;
  return <section aria-label="Sprint Retrospective" aria-busy={loading}>
    <div className="panel-heading"><h4>Sprint Retrospective</h4><button className="refresh-button" disabled={loading || saving} onClick={() => setRevision((value) => value + 1)}>Tải lại Retrospective</button></div>
    <p>Nhóm cùng ghi nhận cách làm việc và cải tiến cho Sprint sau. Tải lại sẽ thay nội dung đang nhập bằng bản đã lưu.</p>
    {error && <p role="alert" className="form-error">{error}</p>}{notice && <p role="status">{notice}</p>}{loading && <p role="status">Đang tải Retrospective…</p>}
    {data && <>
      {record ? <article className="daily-entry"><h5>Cập nhật bởi {record.author.displayName} · {new Date(record.updatedAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })} (Việt Nam)</h5>{(Object.keys(fields) as (keyof typeof fields)[]).map((key) => <p key={key}><strong>{fields[key]}:</strong> {record[key]}</p>)}</article> : <p>Chưa có Retrospective.</p>}
      {data.canEdit ? <form className="workspace-form daily-form" onSubmit={submit}><fieldset disabled={loading || saving}>
        {(Object.keys(fields) as (keyof typeof fields)[]).map((key) => <label key={key}>{fields[key]}<textarea aria-label={fields[key]} required maxLength={4000} value={input[key]} onChange={(event) => setInput({ ...input, [key]: event.target.value })} /></label>)}
        <button className="primary-button">{saving ? 'Đang lưu…' : 'Lưu Retrospective'}</button>
      </fieldset></form> : <p>Project đã đóng hoặc Sprint đã hoàn thành; Retrospective chỉ được xem.</p>}
    </>}
  </section>;
}
