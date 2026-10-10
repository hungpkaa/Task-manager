import { useEffect, useState, type FormEvent } from 'react';
import { ApiError, projectApi, taskApi, type CommentPage, type ProjectMember } from '../api';

export function Comments({ taskId, projectId, onExpired }: { taskId: string; projectId: string; onExpired: () => void }) {
  const [data, setData] = useState<CommentPage | null>(null);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  function failed(failure: unknown) { if (failure instanceof ApiError && failure.status === 401) onExpired(); else setError(failure instanceof Error ? failure.message : 'Không tải được bình luận.'); }
  useEffect(() => {
    let active = true; setLoading(true); setError(''); setData(null); setMembers([]);
    void (async () => {
      const result = await taskApi.comments(taskId, page);
      const membership = result.canPost ? await projectApi.members(projectId) : { members: [] };
      if (active) { setData(result); setMembers(membership.members); }
    })().catch((failure: unknown) => { if (active) failed(failure); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [taskId, projectId, page, attempt]);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try { await taskApi.addComment(taskId, body); setBody(''); setPage(1); setAttempt((value) => value + 1); setNotice('Đã gửi bình luận.'); }
    catch (failure) { failed(failure); if (failure instanceof ApiError && [403, 409].includes(failure.status)) setData((value) => value ? { ...value, canPost: false } : value); }
    finally { setBusy(false); }
  }
  return <section className="comments-panel" aria-label="Bình luận Task" aria-busy={loading || busy}>
    <div className="panel-heading"><h3>Bình luận</h3><button className="refresh-button" disabled={loading || busy} onClick={() => setAttempt((value) => value + 1)}>Tải lại bình luận</button></div>
    {error && <p className="form-error" role="alert">{error}</p>}{notice && <p className="form-success" role="status">{notice}</p>}
    {loading ? <p role="status">Đang tải bình luận…</p> : data && <>
      {data.canPost ? <form className="workspace-form" onSubmit={(event) => void submit(event)}><fieldset disabled={busy}>
        <div className="form-field"><label htmlFor={`comment-${taskId}`}>Nội dung bình luận</label><textarea id={`comment-${taskId}`} rows={4} required maxLength={5000} value={body} onChange={(event) => setBody(event.target.value)} /></div>
        <div className="form-field"><label htmlFor={`mention-${taskId}`}>Nhắc thành viên (@mention)</label><select id={`mention-${taskId}`} value="" onChange={(event) => { if (event.target.value) setBody((value) => `${value}${value && !value.endsWith(' ') ? ' ' : ''}@{${event.target.value}} `); }}><option value="">Chọn người để thêm vào bình luận</option>{members.filter((member) => member.user.status === 'ACTIVE').map((member) => <option key={member.userId} value={member.user.email}>{member.user.displayName} · {member.user.email}</option>)}</select></div>
        <p>Chọn thành viên để thêm mention. Mỗi bình luận tối đa 5000 ký tự và 20 người được nhắc.</p><button className="primary-button" disabled={!body.trim()}>{busy ? 'Đang gửi…' : 'Gửi bình luận'}</button>
      </fieldset></form> : <p>Chỉ thành viên của Project đang hoạt động được gửi bình luận.</p>}
      <p>{data.total} bình luận · Mới nhất trước · Trang {page}/{Math.max(1, Math.ceil(data.total / 20))}</p>
      {!data.total && <p>Chưa có bình luận.</p>}
      <div className="comment-list">{data.items.map((comment) => <article className="comment-card" key={comment.id}><strong>{comment.author.displayName}</strong><time dateTime={comment.createdAt}>{new Date(comment.createdAt).toLocaleString('vi-VN')}</time><p>{comment.body}</p>{comment.mentions.length > 0 && <small>Đã nhắc: {comment.mentions.map((mention) => `@${mention.user.displayName}`).join(', ')}</small>}</article>)}</div>
      <div className="member-actions"><button className="refresh-button" disabled={busy || page <= 1} onClick={() => setPage((value) => value - 1)}>← Bình luận trước</button><button className="refresh-button" disabled={busy || page * 20 >= data.total} onClick={() => setPage((value) => value + 1)}>Bình luận sau →</button></div>
    </>}
  </section>;
}
