import { useEffect, useState } from 'react';
import { ApiError, projectApi, type RecommendationsPage } from '../api';
import { Tasks, statusLabels } from './Tasks';

function currentPeriod() {
  const today = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
  return {
    start: `${today.slice(0, 7)}-01`,
    end: new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0)).toISOString().slice(0, 10),
  };
}

export function FloatingRecommendations({
  projectId,
  isManager,
  onExpired,
  onSelectTask,
}: {
  projectId: string;
  isManager: boolean;
  onExpired: () => void;
  onSelectTask?: (taskId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<RecommendationsPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [taskId, setTaskId] = useState('');
  const [revision, setRevision] = useState(0);
  const [page, setPage] = useState(1);
  const period = currentPeriod();

  useEffect(() => {
    if (!isManager) return;
    let active = true;
    setLoading(true);
    setError('');
    projectApi
      .recommendations(projectId, period.start, period.end, page)
      .then((result) => {
        if (active) setData(result);
      })
      .catch((value: unknown) => {
        if (!active) return;
        if (value instanceof ApiError && value.status === 401) onExpired();
        else setError(value instanceof Error ? value.message : 'Không thể tải đề xuất.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [projectId, isManager, revision, page]);

  if (!isManager) return null;

  return (
    <>
      {/* Floating Action Button (Always stays on screen as you scroll) */}
      <div
        style={{
          position: 'fixed',
          right: '24px',
          bottom: '24px',
          zIndex: 1000,
        }}
      >
        <button
          type="button"
          onClick={() => {
            setOpen(!open);
            if (open) setTaskId('');
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '12px 20px',
            borderRadius: '50px',
            background: open ? '#2d4439' : '#172f29',
            color: '#ffffff',
            border: '2px solid #d7e8ad',
            boxShadow: '0 8px 24px rgba(23, 47, 41, 0.3)',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: '13px',
            transition: 'all 0.2s ease',
          }}
          aria-label={open ? 'Đóng đề xuất điều phối nổi' : 'Mở đề xuất điều phối nổi'}
        >
          <span style={{ fontSize: '18px', lineHeight: 1 }}>{open ? '✕' : '💡'}</span>
          <span>{open ? 'Đóng đề xuất' : 'Đề xuất điều phối'}</span>
          {data && data.total > 0 && !open && (
            <span
              style={{
                background: '#ef4444',
                color: '#ffffff',
                borderRadius: '10px',
                padding: '2px 8px',
                fontSize: '11px',
                fontWeight: 700,
                boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
              }}
            >
              {data.total}
            </span>
          )}
        </button>
      </div>

      {/* Slide-over Drawer Panel */}
      {open && (
        <>
          {/* Backdrop Overlay */}
          <div
            onClick={() => {
              setOpen(false);
              setTaskId('');
            }}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(23, 47, 41, 0.45)',
              backdropFilter: 'blur(2px)',
              zIndex: 1040,
            }}
          />

          {/* Drawer Container */}
          <aside
            aria-label="Ngăn kéo đề xuất điều phối"
            style={{
              position: 'fixed',
              top: 0,
              right: 0,
              width: 'min(540px, 92vw)',
              height: '100vh',
              background: '#ffffff',
              zIndex: 1050,
              boxShadow: '-8px 0 32px rgba(0, 0, 0, 0.22)',
              display: 'flex',
              flexDirection: 'column',
              boxSizing: 'border-box',
            }}
          >
            {/* Drawer Header */}
            <div
              style={{
                padding: '20px 24px',
                background: '#172f29',
                color: '#ffffff',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexShrink: 0,
                borderBottom: '1px solid #2d4439',
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', color: '#ffffff' }}>
                  <span>💡</span> Đề xuất điều phối công việc
                </h3>
                <span style={{ fontSize: '12px', color: '#cbd7bf', marginTop: '4px', display: 'block' }}>
                  Kỳ: {period.start} → {period.end} {data ? `· ${data.total} việc cần chú ý` : ''}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setTaskId('');
                }}
                style={{
                  background: 'rgba(255, 255, 255, 0.1)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  color: '#ffffff',
                  borderRadius: '50%',
                  width: '32px',
                  height: '32px',
                  display: 'grid',
                  placeItems: 'center',
                  cursor: 'pointer',
                  fontSize: '15px',
                }}
                aria-label="Đóng bảng đề xuất"
              >
                ✕
              </button>
            </div>

            {/* Drawer Content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
              {taskId ? (
                <div>
                  <button
                    className="refresh-button"
                    style={{ marginBottom: '16px', fontWeight: 600 }}
                    onClick={() => {
                      setTaskId('');
                      setRevision((v) => v + 1);
                    }}
                  >
                    ← Về danh sách đề xuất
                  </button>
                  <Tasks
                    key={taskId}
                    initialId={taskId}
                    onExpired={onExpired}
                    onBack={() => {
                      setTaskId('');
                      setRevision((v) => v + 1);
                    }}
                  />
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                    <p style={{ margin: 0, fontSize: '12px', color: '#687761' }}>
                      Gợi ý xử lý điểm nghẽn dựa trên tiến độ và tải công việc thực tế.
                    </p>
                    <button
                      className="refresh-button"
                      disabled={loading}
                      style={{ padding: '6px 12px', fontSize: '11px' }}
                      onClick={() => setRevision((v) => v + 1)}
                    >
                      {loading ? 'Đang tải…' : 'Tải lại'}
                    </button>
                  </div>

                  {error && <p className="form-error" role="alert">{error}</p>}
                  {loading && !data && <p role="status">Đang phân tích dữ liệu điều phối…</p>}

                  {data && (
                    <>
                      {/* Priority Advice */}
                      {data.advice.length > 0 && (
                        <div
                          style={{
                            background: '#f4f7ee',
                            border: '1px solid #d8e3ce',
                            borderRadius: '10px',
                            padding: '12px 16px',
                            marginBottom: '16px',
                          }}
                        >
                          <strong style={{ fontSize: '13px', color: '#263c35', display: 'block', marginBottom: '6px' }}>
                            🎯 Hướng xử lý ưu tiên:
                          </strong>
                          <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '12px', color: '#3d4d3b', lineHeight: 1.6 }}>
                            {data.advice.map((item) => (
                              <li key={item.code}>{item.message}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Task Cards */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                        {data.items.map((item) => (
                          <div
                            key={item.task.id}
                            style={{
                              background: '#ffffff',
                              border: item.blockingCount > 0 ? '1.5px solid #f59e0b' : '1px solid #d8e0d0',
                              borderRadius: '12px',
                              padding: '16px',
                              boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '10px',
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                              <strong style={{ fontSize: '14px', color: '#172f29', lineHeight: 1.4 }}>
                                {item.task.title}
                              </strong>
                              <span
                                style={{
                                  fontSize: '11px',
                                  fontWeight: 600,
                                  padding: '2px 7px',
                                  borderRadius: '5px',
                                  background: '#eaf0df',
                                  color: '#263c35',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {statusLabels[item.task.status]}
                              </span>
                            </div>

                            <p style={{ margin: 0, fontSize: '12px', color: '#687761' }}>
                              👤 Phụ trách: <strong>{item.task.assignee ?? 'Chưa phân công'}</strong>
                            </p>

                            {/* Blocking Warning */}
                            {item.blockingCount > 0 && (
                              <div
                                style={{
                                  background: '#fef3c7',
                                  border: '1px solid #fde68a',
                                  padding: '8px 12px',
                                  borderRadius: '7px',
                                  fontSize: '12px',
                                  color: '#92400e',
                                  lineHeight: 1.4,
                                }}
                              >
                                ⚠️ <strong>Đang chờ:</strong>{' '}
                                {item.blockingTasks.map((t) => t.title).join(', ')}
                                {item.blockingCount > 3 ? ` và ${item.blockingCount - 3} Task khác` : ''}.
                              </div>
                            )}

                            {/* Reasons */}
                            {item.reasons.length > 0 && (
                              <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '12px', color: '#4a5b48', lineHeight: 1.5 }}>
                                {item.reasons.map((r) => (
                                  <li key={r.code}>{r.message}</li>
                                ))}
                              </ul>
                            )}

                            {/* Candidate Suggestion */}
                            <div style={{ fontSize: '12px', borderTop: '1px dashed #e2e8dd', paddingTop: '8px' }}>
                              {item.candidates.length > 0 ? (
                                <div>
                                  <strong style={{ color: '#263c35', display: 'block', marginBottom: '4px' }}>
                                    👥 Gợi ý chuyển giao:
                                  </strong>
                                  <ul style={{ margin: 0, paddingLeft: '18px', lineHeight: 1.5 }}>
                                    {item.candidates.map((c) => (
                                      <li key={c.userId}>
                                        <strong>{c.displayName}</strong>: Tải {c.knownEffort}/{c.capacityPoints} Effort. Nếu nhận: {c.projectedPercent}%.
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              ) : (
                                <span style={{ color: '#788975', fontStyle: 'italic', fontSize: '11px' }}>
                                  Chưa có người gợi ý phù hợp (công việc đang bị chặn hoặc chưa cần chuyển giao).
                                </span>
                              )}
                            </div>

                            <button
                              type="button"
                              className="refresh-button"
                              style={{ alignSelf: 'flex-start', marginTop: '4px', fontSize: '11px', padding: '6px 12px', fontWeight: 600 }}
                              onClick={() => {
                                setOpen(false);
                                if (onSelectTask) {
                                  onSelectTask(item.task.id);
                                } else {
                                  setTaskId(item.task.id);
                                }
                              }}
                            >
                              Mở Task để xem xét
                            </button>
                          </div>
                        ))}
                      </div>

                      {!data.total && (
                        <div style={{ padding: '24px', background: '#f8faf6', borderRadius: '10px', textAlign: 'center', color: '#687761', fontSize: '13px' }}>
                          🎉 Không có điểm nghẽn nào cần điều phối trong kỳ này!
                        </div>
                      )}

                      {data.total > 20 && (
                        <div style={{ marginTop: '16px' }}>
                          <p style={{ fontSize: '11px', color: '#687761' }}>
                            Trang {page}/{Math.max(1, Math.ceil(data.total / data.pageSize))}
                          </p>
                          <div className="inline-fields">
                            <button disabled={loading || page <= 1} onClick={() => setPage(page - 1)}>Trước</button>
                            <button disabled={loading || page * data.pageSize >= data.total} onClick={() => setPage(page + 1)}>Sau</button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </>
              )}
            </div>
          </aside>
        </>
      )}
    </>
  );
}
