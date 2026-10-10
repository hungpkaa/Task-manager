import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ApiError, taskApi, type AttachmentPage, type TaskAttachment } from '../api';

const accept = '.pdf,.png,.jpg,.jpeg,.txt,.csv,.md,.zip,.docx,.xlsx,.pptx';
export function Attachments({ taskId, onExpired }: { taskId: string; onExpired: () => void }) {
  const [data, setData] = useState<AttachmentPage | null>(null);
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState<TaskAttachment | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const input = useRef<HTMLInputElement>(null);
  function failed(failure: unknown) { if (failure instanceof ApiError && failure.status === 401) onExpired(); else setError(failure instanceof Error ? failure.message : 'Không xử lý được tệp.'); }
  useEffect(() => {
    let active = true; setLoading(true); setData(null); setError(''); setPending(null);
    void taskApi.attachments(taskId, page).then((result) => { if (active) setData(result); }).catch((failure: unknown) => { if (active) failed(failure); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [taskId, page, attempt]);
  async function mutate(operation: () => Promise<void>) {
    setBusy(true); setError(''); setNotice('');
    try { await operation(); setPending(null); setPage(1); setAttempt((value) => value + 1); }
    catch (failure) { failed(failure); }
    finally { setBusy(false); }
  }
  function upload(event: FormEvent) {
    event.preventDefault();
    if (!file) return;
    if (!file.size || file.size > 10 * 1024 * 1024) { setError('Chọn tệp có nội dung, tối đa 10 MB.'); return; }
    void mutate(async () => { await taskApi.upload(taskId, file); setFile(null); if (input.current) input.current.value = ''; setNotice('Đã đính kèm tệp.'); });
  }
  async function download(attachment: TaskAttachment) {
    setBusy(true); setError('');
    try {
      const blob = await taskApi.download(taskId, attachment.id);
      const url = URL.createObjectURL(blob); const link = document.createElement('a');
      link.href = url; link.download = attachment.filename; document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (failure) { failed(failure); }
    finally { setBusy(false); }
  }
  return <section className="attachments-panel" aria-label="Tệp đính kèm Task" aria-busy={loading || busy}>
    <div className="panel-heading"><h3>Tệp đính kèm</h3><button className="refresh-button" disabled={loading || busy} onClick={() => setAttempt((value) => value + 1)}>Tải lại tệp</button></div>
    {error && <p className="form-error" role="alert">{error}</p>}{notice && <p className="form-success" role="status">{notice}</p>}
    {loading ? <p role="status">Đang tải danh sách tệp…</p> : data && <>
      {data.canUpload ? <form className="workspace-form" onSubmit={upload}><div className="form-field"><label htmlFor={`attachment-${taskId}`}>Chọn tệp đính kèm</label><input ref={input} id={`attachment-${taskId}`} type="file" accept={accept} disabled={busy} onChange={(event) => { setFile(event.target.files?.[0] ?? null); setError(''); }} /></div><p>Mỗi tệp tối đa 10 MB. Hỗ trợ PDF, ảnh PNG/JPG, TXT, CSV, Markdown, ZIP và tài liệu DOCX/XLSX/PPTX.</p><button className="primary-button" disabled={busy || !file}>{busy ? 'Đang xử lý…' : 'Đính kèm tệp'}</button></form> : <p>Chỉ thành viên của Project đang hoạt động được tải lên tệp.</p>}
      <p>{data.total} tệp · Trang {page}/{Math.max(1, Math.ceil(data.total / 20))}</p>
      {!data.total && <p>Chưa có tệp đính kèm.</p>}
      <div className="attachment-list">{data.items.map((attachment) => <article className="attachment-card" key={attachment.id}><strong>{attachment.filename}</strong><p>{(attachment.sizeBytes / 1024).toFixed(1)} KB · {attachment.uploader.displayName} · {new Date(attachment.createdAt).toLocaleString('vi-VN')}</p><div className="member-actions"><button className="refresh-button" disabled={busy} onClick={() => void download(attachment)}>Tải xuống</button>{attachment.canDelete && <button className="danger-button" disabled={busy} onClick={() => setPending(attachment)}>Xóa tệp</button>}</div></article>)}</div>
      <div className="member-actions"><button className="refresh-button" disabled={busy || page <= 1} onClick={() => setPage((value) => value - 1)}>← Tệp trước</button><button className="refresh-button" disabled={busy || page * 20 >= data.total} onClick={() => setPage((value) => value + 1)}>Tệp sau →</button></div>
      {pending && <div className="confirm-panel" role="group" aria-label="Xác nhận xóa tệp"><p>Xóa tệp “{pending.filename}”?</p><button className="primary-button" disabled={busy} onClick={() => void mutate(async () => { await taskApi.removeAttachment(taskId, pending.id); setNotice('Đã xóa tệp.'); })}>Xác nhận xóa</button> <button className="refresh-button" disabled={busy} onClick={() => setPending(null)}>Hủy</button></div>}
    </>}
  </section>;
}
