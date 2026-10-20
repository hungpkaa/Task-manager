import { useEffect, useState, type FormEvent } from 'react';
import { ApiError, sprintApi, type DailyResult, type SprintMonitorResult } from '../api';

export function DailyUpdates({
  projectId,
  sprintId,
  onExpired,
  userId,
  tasks = [],
}: {
  projectId: string;
  sprintId: string;
  onExpired: () => void;
  userId?: string;
  tasks?: SprintMonitorResult['items'];
}) {
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
    setLoading(true);
    setError('');
    sprintApi
      .daily(projectId, sprintId, page)
      .then((result) => {
        if (active) setData(result);
      })
      .catch((value: unknown) => {
        if (active) failure(value);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [projectId, sprintId, page, revision]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await sprintApi.addDaily(projectId, sprintId, input);
      setInput({ progress: '', nextPlan: '', blockers: '' });
      setPage(1);
      setRevision((value) => value + 1);
      setNotice('Đã lưu Daily Update.');
    } catch (value) {
      failure(value);
    } finally {
      setSaving(false);
    }
  }

  function handleAutoFill() {
    // Priority: tasks explicitly assigned to the user
    let userTasks = userId ? tasks.filter((t) => t.assigneeId === userId) : [];
    // Fallback: if no tasks match assigneeId, use all tasks in current sprint
    if (userTasks.length === 0 && tasks.length > 0) {
      userTasks = tasks;
    }

    const doneTasks = userTasks.filter((t) => t.status === 'DONE');
    const inProgressTasks = userTasks.filter((t) => t.status === 'IN_PROGRESS');
    const todoTasks = userTasks.filter((t) => t.status === 'TODO');
    const blockedTasks = userTasks.filter((t) => t.blocked);

    // Build progress
    const progressLines: string[] = [];
    doneTasks.forEach((t) => {
      progressLines.push(`• [Hoàn thành] ${t.title}${t.effort ? ` (${t.effort} effort)` : ''}`);
    });
    inProgressTasks.forEach((t) => {
      progressLines.push(`• [Đang làm] ${t.title}${t.effort ? ` (${t.effort} effort)` : ''}`);
    });
    const progressText = progressLines.length > 0
      ? progressLines.join('\n')
      : '• Đã hoàn thành các công việc theo kế hoạch trong ngày.';

    // Build next plan
    const nextLines: string[] = [];
    inProgressTasks.forEach((t) => {
      nextLines.push(`• Tiếp tục: ${t.title}`);
    });
    todoTasks.forEach((t) => {
      nextLines.push(`• Bắt đầu: ${t.title}${t.effort ? ` (${t.effort} effort)` : ''}`);
    });
    const nextPlanText = nextLines.length > 0
      ? nextLines.join('\n')
      : '• Tiếp tục thực hiện các công việc tiếp theo trong Sprint backlog.';

    // Build blockers
    const blockerLines: string[] = [];
    blockedTasks.forEach((t) => {
      const blockersDesc = t.blockingTasks && t.blockingTasks.length > 0
        ? t.blockingTasks.map((b) => `"${b.title}"`).join(', ')
        : 'công việc phụ thuộc';
      blockerLines.push(`• Task "${t.title}" bị chặn do chờ: ${blockersDesc}`);
    });
    const blockersText = blockerLines.length > 0
      ? blockerLines.join('\n')
      : 'Không có khó khăn hay điểm nghẽn.';

    setInput({
      progress: progressText,
      nextPlan: nextPlanText,
      blockers: blockersText,
    });
    setNotice('⚡ Đã tự động tổng hợp nội dung Daily Update từ công việc của bạn.');
  }

  return (
    <section aria-label="Daily Update" aria-busy={loading} style={{ marginTop: '24px' }}>
      <div className="panel-heading" style={{ flexWrap: 'wrap', gap: '8px' }}>
        <div>
          <h4>Daily Update</h4>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-muted, #64748b)' }}>
            Mỗi lần gửi được lưu riêng theo thời gian. Daily Update không thay đổi trạng thái Task.
          </p>
        </div>
        <div className="member-actions">
          <button
            className="refresh-button"
            disabled={loading || saving}
            onClick={() => setRevision((value) => value + 1)}
          >
            Tải lại Daily Update
          </button>
        </div>
      </div>

      {error && <p role="alert" className="form-error">{error}</p>}
      {notice && <p role="status" className="form-success">{notice}</p>}

      {data?.canCreate && (
        <details open className="daily-form-details" style={{ marginBottom: '20px', border: '1px solid #d8e0d0', borderRadius: '10px', background: 'white', padding: '16px' }}>
          <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: '14px', marginBottom: '12px', userSelect: 'none' }}>
            📝 Nhập nội dung Daily Update (nhấn để thu gọn / mở rộng)
          </summary>
          <form className="workspace-form daily-form" onSubmit={submit} style={{ margin: 0, padding: 0, border: 'none' }}>
            <fieldset disabled={saving || loading}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
                <span style={{ fontSize: '13px', color: '#4b5563' }}>Điền nhanh nội dung từ các công việc của bạn hôm nay:</span>
                <button
                  type="button"
                  className="primary-button"
                  style={{ fontSize: '12px', padding: '5px 12px' }}
                  onClick={handleAutoFill}
                  title="Tự động quét các Task của bạn trong ngày để điền nhanh"
                >
                  ⚡ Tự động tổng hợp từ Task của tôi
                </button>
              </div>
              <label>
                Tiến độ đã thực hiện
                <textarea
                  required
                  maxLength={2000}
                  rows={3}
                  value={input.progress}
                  onChange={(event) => setInput({ ...input, progress: event.target.value })}
                  placeholder="Những việc đã hoàn thành hoặc đang thực hiện hôm nay..."
                />
              </label>
              <label>
                Kế hoạch tiếp theo
                <textarea
                  required
                  maxLength={2000}
                  rows={3}
                  value={input.nextPlan}
                  onChange={(event) => setInput({ ...input, nextPlan: event.target.value })}
                  placeholder="Dự định làm gì tiếp theo trong ngày mai..."
                />
              </label>
              <label>
                Blocker
                <textarea
                  maxLength={2000}
                  rows={2}
                  value={input.blockers}
                  onChange={(event) => setInput({ ...input, blockers: event.target.value })}
                  placeholder="Khó khăn, điểm nghẽn hoặc việc đang bị chặn (nếu có)..."
                />
              </label>
              <button className="primary-button">{saving ? 'Đang lưu…' : 'Gửi Daily Update'}</button>
            </fieldset>
          </form>
        </details>
      )}

      {loading && <p role="status">Đang tải Daily Update…</p>}

      {!loading && data && (
        <>
          {!data.canCreate && <p>Sprint hiện chỉ cho xem lịch sử Daily Update.</p>}
          {!data.items.length && <p>Chưa có Daily Update nào được gửi trong Sprint này.</p>}
          {data.items.map((item) => (
            <article key={item.id} className="daily-entry">
              <h5>
                {item.author.displayName} · {new Date(item.createdAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })} (Việt Nam)
              </h5>
              <p><strong>Tiến độ:</strong> {item.progress}</p>
              <p><strong>Kế hoạch:</strong> {item.nextPlan}</p>
              <p><strong>Blocker:</strong> {item.blockers || 'Không có'}</p>
            </article>
          ))}
          <p>
            {data.total} cập nhật · Trang {page}/{Math.max(1, Math.ceil(data.total / data.pageSize))}
          </p>
          <div className="inline-fields">
            <button disabled={saving || page <= 1} onClick={() => setPage(page - 1)}>
              Daily trước
            </button>
            <button disabled={saving || page * data.pageSize >= data.total} onClick={() => setPage(page + 1)}>
              Daily sau
            </button>
          </div>
        </>
      )}
    </section>
  );
}
