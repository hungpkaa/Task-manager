import { useEffect, useState, type FormEvent } from 'react';
import { ApiError, projectApi, taskStatuses, type DashboardResult } from '../api';
import { Tasks, statusLabels } from './Tasks';
import { ProjectRisk } from './ProjectRisk';
import { PersonalDashboardView } from './PersonalDashboardView';

function currentPeriod() {
  const start = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 7) + '-01';
  const end = new Date(`${start}T00:00:00Z`);
  end.setUTCMonth(end.getUTCMonth() + 1, 0);
  return { start, end: end.toISOString().slice(0, 10) };
}

export function Dashboard({ projectId, onExpired, onWorkspace }: { projectId?: string; onExpired: () => void; onWorkspace?: () => void }) {
  const [open, setOpen] = useState(!projectId);
  const [period, setPeriod] = useState(currentPeriod);
  const [draft, setDraft] = useState(period);
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState<DashboardResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [taskId, setTaskId] = useState('');
  const title = projectId ? 'Dashboard Project' : 'Dashboard cá nhân';

  useEffect(() => {
    if (!open || taskId) return;
    let active = true;
    setLoading(true);
    setError('');
    setData(null);
    (projectId ? projectApi.dashboard(projectId, period.start, period.end) : projectApi.personalDashboard())
      .then((result) => {
        if (active) setData(result);
      })
      .catch((value: unknown) => {
        if (!active) return;
        if (value instanceof ApiError && value.status === 401) onExpired();
        else setError(value instanceof Error ? value.message : 'Không thể tải Dashboard.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [projectId, period.start, period.end, revision, open, taskId]);

  function back() {
    setTaskId('');
    setRevision((value) => value + 1);
  }

  function apply(event: FormEvent) {
    event.preventDefault();
    setPeriod(draft);
    setRevision((value) => value + 1);
  }

  if (taskId) {
    return (
      <section aria-label={title}>
        <button className="refresh-button" onClick={back}>
          ← Về {title}
        </button>
        <Tasks key={taskId} initialId={taskId} onExpired={onExpired} onBack={back} />
      </section>
    );
  }

  const todoPct = data && data.total > 0 ? ((data.counts.TODO ?? 0) / data.total) * 100 : 0;
  const inProgressPct = data && data.total > 0 ? ((data.counts.IN_PROGRESS ?? 0) / data.total) * 100 : 0;
  const reviewPct = data && data.total > 0 ? ((data.counts.REVIEW ?? 0) / data.total) * 100 : 0;
  const donePct = data && data.total > 0 ? ((data.counts.DONE ?? 0) / data.total) * 100 : 0;

  return (
    <section className={`sprints-panel ${projectId ? '' : 'personal-dashboard'}`} aria-label={title} aria-busy={loading}>
      <div className="panel-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
        <div>
          <h3 style={{ margin: 0 }}>{title}</h3>
          {projectId && (
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>
              Chỉ số tiến độ tính toàn Project; kỳ dưới đây áp dụng cho Workload và Risk.
            </p>
          )}
        </div>
        <div className="member-actions" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button className="refresh-button" disabled={loading} onClick={() => setRevision((value) => value + 1)}>
            Tải lại Dashboard
          </button>
          {projectId && (
            <button className="refresh-button" onClick={() => setOpen(!open)}>
              {open ? 'Thu gọn Dashboard' : 'Mở Dashboard Project'}
            </button>
          )}
        </div>
      </div>

      {open && (
        <>
          {projectId && (
            <form className="workspace-form dashboard-period-bar" onSubmit={apply} style={{ margin: '14px 0', padding: '12px 16px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
              <fieldset disabled={loading} style={{ border: 'none', padding: 0, margin: 0, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>📅 Kỳ Workload & Risk:</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <label style={{ margin: 0, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>Từ ngày</span>
                    <input
                      aria-label="Kỳ Dashboard bắt đầu"
                      type="date"
                      required
                      value={draft.start}
                      onChange={(event) => setDraft({ ...draft, start: event.target.value })}
                      style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                    />
                  </label>
                  <label style={{ margin: 0, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>Đến ngày</span>
                    <input
                      aria-label="Kỳ Dashboard kết thúc"
                      type="date"
                      required
                      min={draft.start}
                      value={draft.end}
                      onChange={(event) => setDraft({ ...draft, end: event.target.value })}
                      style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                    />
                  </label>
                </div>
                <button className="primary-button" style={{ fontSize: '12px', padding: '6px 14px' }}>
                  Xem Dashboard theo kỳ
                </button>
                {data && (
                  <span style={{ fontSize: '12px', color: '#64748b', marginLeft: 'auto' }}>
                    Ngày đánh giá: <strong>{data.today}</strong> (Việt Nam)
                  </span>
                )}
              </fieldset>
            </form>
          )}

          {error && <p className="form-error" role="alert">{error}</p>}
          {loading && <p role="status">Đang tải Dashboard…</p>}

          {data && !projectId ? (
            <PersonalDashboardView data={data} onTask={setTaskId} onWorkspace={onWorkspace} />
          ) : data && (
            <>
              {data.projectStatus === 'CLOSED' && (
                <p className="form-notice" style={{ margin: '8px 0' }}>
                  Project đã đóng; chỉ xem dữ liệu.
                </p>
              )}

              {/* 5 KPI Metric Cards */}
              <div
                className="dashboard-metrics"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: '12px',
                  margin: '16px 0',
                }}
              >
                {/* 1. Tổng Task */}
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Tổng Task
                  </div>
                  <strong style={{ fontSize: '28px', fontWeight: 700, color: '#0f172a', display: 'block', margin: '4px 0' }}>
                    {data.total}
                  </strong>
                  <span style={{ fontSize: '12px', color: '#64748b' }}>
                    Chưa DONE: {data.activeCount} Task ({data.activeKnownEffort} effort)
                  </span>
                </div>

                {/* 2. Tiến độ */}
                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: '#166534', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Tiến độ · {data.counts.DONE} Task DONE
                  </div>
                  <strong style={{ fontSize: '28px', fontWeight: 700, color: '#15803d', display: 'block', margin: '4px 0' }}>
                    {data.progressPercent === null ? 'Chưa có dữ liệu' : `${data.progressPercent}%`}
                  </strong>
                  <span style={{ fontSize: '12px', color: '#166534' }}>
                    {data.counts.DONE}/{data.total} hoàn thành
                  </span>
                </div>

                {/* 3. Task BLOCKED */}
                <div
                  style={{
                    background: data.blockedCount > 0 ? '#fffbeb' : '#f8fafc',
                    border: `1px solid ${data.blockedCount > 0 ? '#fde68a' : '#e2e8f0'}`,
                    borderRadius: '10px',
                    padding: '14px 16px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                  }}
                >
                  <div style={{ fontSize: '12px', fontWeight: 600, color: data.blockedCount > 0 ? '#b45309' : '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Task BLOCKED
                  </div>
                  <strong style={{ fontSize: '28px', fontWeight: 700, color: data.blockedCount > 0 ? '#b45309' : '#0f172a', display: 'block', margin: '4px 0' }}>
                    {data.blockedCount}
                  </strong>
                  <span style={{ fontSize: '12px', color: data.blockedCount > 0 ? '#b45309' : '#64748b' }}>
                    {data.blockedCount > 0 ? 'Bị nghẽn bởi dependency' : 'Không có việc bị chặn'}
                  </span>
                </div>

                {/* 4. Task quá hạn */}
                <div
                  style={{
                    background: data.overdueCount > 0 ? '#fef2f2' : '#f8fafc',
                    border: `1px solid ${data.overdueCount > 0 ? '#fecaca' : '#e2e8f0'}`,
                    borderRadius: '10px',
                    padding: '14px 16px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                  }}
                >
                  <div style={{ fontSize: '12px', fontWeight: 600, color: data.overdueCount > 0 ? '#dc2626' : '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Task quá hạn
                  </div>
                  <strong style={{ fontSize: '28px', fontWeight: 700, color: data.overdueCount > 0 ? '#dc2626' : '#0f172a', display: 'block', margin: '4px 0' }}>
                    {data.overdueCount}
                  </strong>
                  <span style={{ fontSize: '12px', color: data.overdueCount > 0 ? '#dc2626' : '#64748b' }}>
                    {data.overdueCount > 0 ? 'Cần cập nhật deadline' : 'Đúng tiến độ'}
                  </span>
                </div>

                {/* 5. Đến hạn 7 ngày */}
                <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '10px', padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: '#0369a1', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Đến hạn hôm nay → 7 ngày tới
                  </div>
                  <strong style={{ fontSize: '28px', fontWeight: 700, color: '#0284c7', display: 'block', margin: '4px 0' }}>
                    {data.dueSoonCount}
                  </strong>
                  <span style={{ fontSize: '12px', color: '#0369a1' }}>
                    Cần ưu tiên xử lý
                  </span>
                </div>
              </div>

              {/* Status Breakdown Stacked Bar */}
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '16px', margin: '16px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <strong style={{ fontSize: '14px', color: '#1e293b' }}>Phân bổ trạng thái công việc</strong>
                  <span style={{ fontSize: '13px', color: '#64748b' }}>
                    Tiến độ = số Task DONE / tổng Task; không tính theo Effort. Chưa DONE: <strong>{data.activeCount} Task</strong> · {data.activeKnownEffort} Effort đã biết.
                  </span>
                </div>

                {/* Multi-segment visual bar */}
                <div style={{ height: '14px', display: 'flex', width: '100%', borderRadius: '9999px', overflow: 'hidden', background: '#e2e8f0' }}>
                  {donePct > 0 && <div style={{ width: `${donePct}%`, background: '#10b981', transition: 'width 0.3s' }} title={`Hoàn thành: ${data.counts.DONE}`} />}
                  {inProgressPct > 0 && <div style={{ width: `${inProgressPct}%`, background: '#3b82f6', transition: 'width 0.3s' }} title={`Đang làm: ${data.counts.IN_PROGRESS}`} />}
                  {reviewPct > 0 && <div style={{ width: `${reviewPct}%`, background: '#8b5cf6', transition: 'width 0.3s' }} title={`Chờ duyệt: ${data.counts.REVIEW}`} />}
                  {todoPct > 0 && <div style={{ width: `${todoPct}%`, background: '#94a3b8', transition: 'width 0.3s' }} title={`Cần làm: ${data.counts.TODO}`} />}
                </div>

                {/* Legend list */}
                <ul className="dashboard-statuses" style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', listStyle: 'none', padding: 0, margin: '12px 0 0', fontSize: '13px' }}>
                  {taskStatuses.map((status) => (
                    <li key={status} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      <span
                        style={{
                          width: '10px',
                          height: '10px',
                          borderRadius: '50%',
                          background:
                            status === 'DONE' ? '#10b981' : status === 'IN_PROGRESS' ? '#3b82f6' : status === 'REVIEW' ? '#8b5cf6' : '#94a3b8',
                        }}
                      />
                      {statusLabels[status]}: <strong>{data.counts[status]}</strong>
                    </li>
                  ))}
                </ul>

                <p style={{ margin: '10px 0 0', fontSize: '12px', color: '#64748b' }}>
                  {data.missingEffortCount} Task chưa DONE thiếu Effort · {data.missingDeadlineCount} thiếu hạn · {data.unassignedCount} chưa phân công. BLOCKED và quá hạn có thể cùng một Task.
                </p>
              </div>

              {/* 2-Column Grid: Sprint info & Workload in period */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px', margin: '16px 0' }}>
                {/* Sprint info card */}
                {data.sprintCounts && (
                  <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <h4 style={{ margin: 0, fontSize: '14px' }}>🏃 Sprint trong Project</h4>
                      {data.activeSprint && (
                        <span style={{ fontSize: '11px', background: '#dcfce7', color: '#166534', padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>
                          ĐANG CHẠY
                        </span>
                      )}
                    </div>
                    <p style={{ margin: '0 0 8px', fontSize: '13px', color: '#64748b' }}>
                      {data.memberCount} thành viên Project · Sprint: {data.sprintCounts.PLANNED} dự kiến, {data.sprintCounts.ACTIVE} đang chạy, {data.sprintCounts.COMPLETED} hoàn thành.
                    </p>
                    {data.activeSprint ? (
                      <div style={{ background: '#f8fafc', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                        <p style={{ margin: '0 0 4px', fontWeight: 600, color: '#0f172a', fontSize: '13px' }}>
                          Sprint đang chạy: <strong>{data.activeSprint.name}</strong>
                        </p>
                        <p style={{ margin: '0 0 6px', fontSize: '12px', color: '#64748b' }}>
                          📅 {data.activeSprint.startDate.slice(0, 10)} → {data.activeSprint.endDate.slice(0, 10)}
                        </p>
                        <p style={{ margin: 0, fontSize: '12px', color: '#334155' }}>
                          <strong>Mục tiêu:</strong> {data.activeSprint.goal || 'Chưa đặt mục tiêu'}
                        </p>
                      </div>
                    ) : (
                      <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>Chưa có Sprint đang chạy.</p>
                    )}
                  </div>
                )}

                {/* Workload Card */}
                {data.workload && (
                  <div className="sprint-workload" style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <h4 style={{ margin: 0, fontSize: '14px' }}>Workload trong kỳ {period.start} → {period.end}</h4>
                      {data.workload.overloadedCount > 0 ? (
                        <span style={{ fontSize: '11px', background: '#fee2e2', color: '#b91c1c', padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>
                          {data.workload.overloadedCount} QUÁ TẢI
                        </span>
                      ) : (
                        <span style={{ fontSize: '11px', background: '#dcfce7', color: '#166534', padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>
                          CÂN BẰNG
                        </span>
                      )}
                    </div>
                    <p style={{ margin: '0 0 6px', fontSize: '13px', color: '#334155' }}>
                      <strong>{data.workload.taskCount}</strong> Task chưa DONE giao kỳ · <strong>{data.workload.knownEffort}</strong> Effort đã biết · <strong>{data.workload.overloadedCount}</strong> người quá tải.
                    </p>
                    <p style={{ margin: '0 0 8px', fontSize: '12px', color: '#64748b' }}>
                      {data.workload.missingEffortCount} Task thiếu Effort · {data.workload.missingCapacityCount} người thiếu Capacity · {data.workload.unassignedCount} Task chưa phân công · {data.workload.unavailableAssigneeCount} người phụ trách không khả dụng.
                    </p>
                    <p style={{ margin: 0, fontSize: '12px', color: '#0369a1' }}>
                      Mở Capacity & Workload để xem tải từng người hoặc thiết lập Capacity khớp kỳ.
                    </p>
                  </div>
                )}
              </div>

              {/* Project Risk Section */}
              {data.risk && (
                <details open style={{ margin: '16px 0', border: '1px solid #e2e8f0', borderRadius: '10px', background: '#fff', padding: '14px 16px' }}>
                  <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: '14px', userSelect: 'none' }}>
                    🛡️ Đánh giá Rủi ro dự án (Project Risk)
                  </summary>
                  <div style={{ marginTop: '12px' }}>
                    <ProjectRisk data={data.risk} />
                  </div>
                </details>
              )}

              {/* Task cần chú ý (Action items) */}
              <div style={{ marginTop: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <h4 style={{ margin: 0 }}>Task cần chú ý ({data.attention.length})</h4>
                  <span style={{ fontSize: '12px', color: '#64748b' }}>Ưu tiên hạn sớm, tối đa 10 Task</span>
                </div>
                <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 12px' }}>
                  Tối đa 10 Task chưa DONE bị chặn hoặc đến hạn trong 7 ngày tới, gồm quá hạn; ưu tiên hạn sớm, không thay thế danh sách Task đầy đủ.
                </p>

                <div className="task-list" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '10px' }}>
                  {data.attention.map((task) => {
                    const isOverdue = Boolean(task.dueDate && task.dueDate.slice(0, 10) < data.today);
                    const isBlocked = task.dependencies.length > 0;
                    return (
                      <button
                        className="task-card"
                        key={task.id}
                        onClick={() => setTaskId(task.id)}
                        style={{
                          textAlign: 'left',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '6px',
                          borderLeft: isBlocked ? '4px solid #ef4444' : isOverdue ? '4px solid #f59e0b' : '4px solid #3b82f6',
                        }}
                      >
                        <strong style={{ fontSize: '14px', color: '#0f172a' }}>{task.title}</strong>
                        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#64748b' }}>
                          <span>{task.project.name}</span>
                          <span>·</span>
                          <span style={{ fontWeight: 600, color: '#334155' }}>{statusLabels[task.status]}</span>
                          <span>·</span>
                          <span>Hạn: {task.dueDate?.slice(0, 10) ?? 'Chưa đặt'}</span>
                        </div>
                        <div style={{ display: 'flex', gap: '6px', marginTop: '2px' }}>
                          {isBlocked && (
                            <small style={{ background: '#fee2e2', color: '#b91c1c', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', fontSize: '11px' }}>
                              BLOCKED
                            </small>
                          )}
                          {isOverdue && (
                            <small style={{ background: '#fef2f2', color: '#dc2626', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', fontSize: '11px' }}>
                              Quá hạn
                            </small>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
                {!data.attention.length && <p className="field-help">Không có Task cần chú ý theo các tiêu chí này.</p>}
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}
