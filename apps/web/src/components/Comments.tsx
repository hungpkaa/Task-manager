import { useEffect, useState, type FormEvent } from 'react';
import { ApiError, accountApi, projectApi, taskApi, type Account, type CommentPage, type ProjectMember } from '../api';

export function Comments({
  taskId,
  projectId,
  onExpired,
  currentUserId,
  currentUserEmail,
}: {
  taskId: string;
  projectId: string;
  onExpired: () => void;
  currentUserId?: string;
  currentUserEmail?: string;
}) {
  const [data, setData] = useState<CommentPage | null>(null);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [currentUser, setCurrentUser] = useState<Account | null>(null);
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  function failed(failure: unknown) {
    if (failure instanceof ApiError && failure.status === 401) onExpired();
    else setError(failure instanceof Error ? failure.message : 'Không tải được bình luận.');
  }

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    setData(null);
    setMembers([]);
    void (async () => {
      const [result, accountRes] = await Promise.all([
        taskApi.comments(taskId, page),
        currentUser ? Promise.resolve(null) : accountApi.me().catch(() => null),
      ]);
      const membership = result.canPost ? await projectApi.members(projectId) : { members: [] };
      if (active) {
        if (accountRes) setCurrentUser(accountRes.user);
        setData(result);
        setMembers(membership.members);
      }
    })().catch((failure: unknown) => {
      if (active) failed(failure);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [taskId, projectId, page, attempt]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  async function submit(event?: FormEvent) {
    if (event) event.preventDefault();
    if (!body.trim() || busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await taskApi.addComment(taskId, body);
      setBody('');
      setPage(1);
      setAttempt((value) => value + 1);
      setNotice('Đã gửi bình luận thành công.');
    } catch (failure) {
      failed(failure);
      if (failure instanceof ApiError && failure.status === 403) {
        setData((value) => value ? { ...value, canPost: false } : value);
      }
    } finally {
      setBusy(false);
    }
  }

  const myId = currentUserId || currentUser?.id;
  const myEmail = currentUserEmail || currentUser?.email;


  function toggleMention(email: string) {
    if (myEmail && email.toLowerCase() === myEmail.toLowerCase()) {
      setNotice('Bạn không thể tự nhắc chính mình.');
      return;
    }
    const tag = `@{${email}}`;
    setBody((prev) => {
      if (prev.includes(tag)) {
        return prev.split(tag).join('').replace(/ {2,}/g, ' ').trim();
      }
      const currentMentions = activeMembers.filter((m) => prev.includes(`@{${m.user.email}}`)).length;
      if (currentMentions >= 20) {
        setNotice('Tối đa 20 người được nhắc trong một bình luận.');
        return prev;
      }
      const trimmed = prev.trimEnd();
      return `${trimmed}${trimmed ? ' ' : ''}${tag} `;
    });
  }

  const activeMembers = members.filter((member) => {
    if (member.user.status !== 'ACTIVE') return false;
    if (myId && member.userId === myId) return false;
    if (myEmail && member.user.email.toLowerCase() === myEmail.toLowerCase()) return false;
    return true;
  });
  const selectedMentionCount = activeMembers.filter((m) => body.includes(`@{${m.user.email}}`)).length;

  return (
    <section className="comments-panel" aria-label="Bình luận Task" aria-busy={loading || busy}>
      <div className="panel-heading">
        <h3>Bình luận</h3>
        <button
          type="button"
          className="refresh-button"
          disabled={loading || busy}
          onClick={() => setAttempt((value) => value + 1)}
        >
          Tải lại bình luận
        </button>
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}
      {notice && <p className="form-success" role="status">{notice}</p>}

      {loading ? (
        <p role="status">Đang tải bình luận…</p>
      ) : data && (
        <>
          {data.canPost ? (
            <form className="workspace-form" onSubmit={(event) => void submit(event)}>
              <fieldset disabled={busy}>
                <div className="comment-form-layout">
                  <div className="form-field comment-input-field">
                    <label htmlFor={`comment-${taskId}`}>Nội dung bình luận</label>
                    <textarea
                      id={`comment-${taskId}`}
                      rows={5}
                      required
                      maxLength={5000}
                      placeholder="Nhập nội dung bình luận... (Nhấn Ctrl+Enter để gửi nhanh)"
                      value={body}
                      onChange={(event) => setBody(event.target.value)}
                      onKeyDown={(event) => {
                        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                          event.preventDefault();
                          void submit();
                        }
                      }}
                    />
                  </div>

                  {activeMembers.length > 0 && (
                    <div className="form-field comment-mention-field">
                      <span className="comment-mention-header">
                        Nhắc thành viên ({selectedMentionCount} đã chọn):
                      </span>
                      <div className="comment-mention-list">
                        {activeMembers.map((member) => {
                          const isChecked = body.includes(`@{${member.user.email}}`);
                          return (
                            <label
                              key={member.userId}
                              className={`comment-mention-item ${isChecked ? 'selected' : ''}`}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                disabled={busy}
                                onChange={() => toggleMention(member.user.email)}
                              />
                              <span className="mention-name" title={member.user.displayName}>
                                {member.user.displayName}
                              </span>
                              <small className="mention-email" title={member.user.email}>
                                ({member.user.email})
                              </small>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                <p style={{ fontSize: '12px', color: '#637367', margin: '4px 0 12px' }}>
                  Mỗi bình luận tối đa 5.000 ký tự và tối đa 20 người được nhắc (@mention).
                </p>

                <button
                  type="submit"
                  className="primary-button"
                  disabled={!body.trim() || busy}
                >
                  {busy ? 'Đang gửi…' : 'Gửi bình luận'}
                </button>
              </fieldset>
            </form>
          ) : (
            <p>Chỉ thành viên của Project đang hoạt động được gửi bình luận.</p>
          )}

          <p>{data.total} bình luận · Mới nhất trước · Trang {page}/{Math.max(1, Math.ceil(data.total / 20))}</p>
          {!data.total && <p>Chưa có bình luận nào.</p>}

          <div className="comment-list">
            {data.items.map((comment) => (
              <article className="comment-card" key={comment.id}>
                <strong>{comment.author.displayName}</strong>
                <time dateTime={comment.createdAt}>{new Date(comment.createdAt).toLocaleString('vi-VN')}</time>
                <p>{comment.body}</p>
                {comment.mentions.length > 0 && (
                  <small>Đã nhắc: {comment.mentions.map((mention) => `@${mention.user.displayName}`).join(', ')}</small>
                )}
              </article>
            ))}
          </div>

          <div className="member-actions">
            <button
              type="button"
              className="refresh-button"
              disabled={busy || page <= 1}
              onClick={() => setPage((value) => value - 1)}
            >
              ← Bình luận trước
            </button>
            <button
              type="button"
              className="refresh-button"
              disabled={busy || page * 20 >= data.total}
              onClick={() => setPage((value) => value + 1)}
            >
              Bình luận sau →
            </button>
          </div>
        </>
      )}
    </section>
  );
}
