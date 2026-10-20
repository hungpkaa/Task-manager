import { useEffect, useState } from 'react';
import { ApiError, projectApi, type RecommendationsPage } from '../api';
import { Tasks, statusLabels } from './Tasks';

export function Recommendations({
  projectId,
  periodStart,
  periodEnd,
  refreshKey,
  onExpired,
}: {
  projectId: string;
  periodStart: string;
  periodEnd: string;
  refreshKey: number;
  onExpired: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState<RecommendationsPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [taskId, setTaskId] = useState('');

  useEffect(() => {
    if (!open || taskId) return;
    let active = true;
    setLoading(true);
    setError('');
    setData(null);
    projectApi
      .recommendations(projectId, periodStart, periodEnd, page)
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
  }, [projectId, periodStart, periodEnd, refreshKey, open, page, revision, taskId]);

  function back() {
    setTaskId('');
    setRevision((value) => value + 1);
  }

  if (taskId) {
    return (
      <div style={{ marginTop: '16px' }}>
        <button className="refresh-button" style={{ marginBottom: '16px' }} onClick={back}>
          ← Về đề xuất điều phối
        </button>
        <Tasks key={taskId} initialId={taskId} onExpired={onExpired} onBack={back} />
      </div>
    );
  }

  return (
    <section className="sprint-workload" aria-label="Đề xuất điều phối" aria-busy={loading} style={{ marginTop: '20px' }}>
      <div className="panel-heading">
        <div>
          <h4 style={{ margin: 0, fontSize: '15px' }}>Đề xuất điều phối</h4>
          <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#687761' }}>
            Gợi ý tháo gỡ điểm nghẽn và san sẻ công việc giữa các thành viên.
          </p>
        </div>
        <button className="refresh-button" onClick={() => setOpen(!open)}>
          {open ? 'Thu gọn đề xuất' : 'Mở đề xuất điều phối'}
        </button>
      </div>

      {open && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', margin: '12px 0' }}>
            <span style={{ fontSize: '12px', color: '#526250', background: '#eef2e7', padding: '6px 12px', borderRadius: '6px' }}>
              📅 Kỳ: <strong>{data?.periodStart ?? periodStart}</strong> → <strong>{data?.periodEnd ?? periodEnd}</strong>
            </span>
            <button className="refresh-button" disabled={loading} onClick={() => setRevision((value) => value + 1)}>
              Tải lại đề xuất
            </button>
          </div>

          {loading && <p role="status">Đang tải đề xuất…</p>}
          {error && <p className="form-error" role="alert">{error}</p>}

          {data && (
            <>
              {data.projectStatus === 'CLOSED' && <p>Project đã đóng; chỉ xem dữ liệu.</p>}

              {/* Action Advice Box */}
              {data.advice.length > 0 && (
                <div
                  style={{
                    background: '#f4f7ee',
                    border: '1px solid #d8e3ce',
                    borderRadius: '10px',
                    padding: '14px 18px',
                    margin: '14px 0',
                  }}
                >
                  <strong style={{ fontSize: '13px', color: '#263c35', display: 'block', marginBottom: '8px' }}>
                    💡 Hướng xử lý ưu tiên:
                  </strong>
                  <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '12px', color: '#3d4d3b', lineHeight: 1.7 }}>
                    {data.advice.map((item) => (
                      <li key={item.code}>{item.message}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Task Items Grid / Cards */}
              <ul
                className="member-list workload-list"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                  gap: '16px',
                  listStyle: 'none',
                  padding: 0,
                  margin: '18px 0',
                }}
              >
                {data.items.map((item) => (
                  <li
                    key={item.task.id}
                    style={{
                      background: '#ffffff',
                      border: item.blockingCount > 0 ? '1.5px solid #f59e0b' : '1px solid #d8e0d0',
                      borderRadius: '12px',
                      padding: '18px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                    }}
                  >
                    {/* Task Title & Assignee */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                        <strong style={{ fontSize: '14px', color: '#172f29', lineHeight: 1.4 }}>
                          {item.task.title}
                        </strong>
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 600,
                            padding: '3px 8px',
                            borderRadius: '6px',
                            background: '#eaf0df',
                            color: '#263c35',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {statusLabels[item.task.status]}
                        </span>
                      </div>
                      <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#687761' }}>
                        👤 Phụ trách: <strong>{item.task.assignee ?? 'Chưa phân công'}</strong>
                      </p>
                    </div>

                    {/* Reasons / Issues */}
                    {item.reasons.length > 0 && (
                      <ul
                        style={{
                          margin: 0,
                          paddingLeft: '18px',
                          fontSize: '12px',
                          color: '#4a5b48',
                          lineHeight: 1.6,
                        }}
                      >
                        {item.reasons.map((reason) => (
                          <li key={reason.code}>{reason.message}</li>
                        ))}
                      </ul>
                    )}

                    {/* Blocking Dependencies Alert */}
                    {item.blockingCount > 0 && (
                      <div
                        style={{
                          background: '#fef3c7',
                          border: '1px solid #fde68a',
                          padding: '10px 12px',
                          borderRadius: '8px',
                          fontSize: '12px',
                          color: '#92400e',
                        }}
                      >
                        ⚠️ <strong>Đang chờ việc:</strong>{' '}
                        {item.blockingTasks.map((task) => task.title).join(', ')}
                        {item.blockingCount > 3 ? ` và ${item.blockingCount - 3} Task khác` : ''}.
                      </div>
                    )}

                    {/* Candidate Recommendations */}
                    <div style={{ fontSize: '12px', marginTop: 'auto', paddingTop: '8px', borderTop: '1px dashed #e2e8dd' }}>
                      {item.candidates.length > 0 ? (
                        <div>
                          <strong style={{ color: '#263c35', display: 'block', marginBottom: '6px' }}>
                            👥 Người có thể cân nhắc chuyển giao:
                          </strong>
                          <ul style={{ margin: 0, paddingLeft: '18px', lineHeight: 1.6 }}>
                            {item.candidates.map((candidate) => (
                              <li key={candidate.userId}>
                                <strong>{candidate.displayName}</strong>: hiện tại {candidate.knownEffort}/{candidate.capacityPoints} Effort. Nếu nhận: {candidate.projectedEffort}/{candidate.capacityPoints} ({candidate.projectedPercent}%).
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : (
                        <p style={{ margin: 0, color: '#788975', fontStyle: 'italic' }}>
                          Chưa có người gợi ý phù hợp (công việc đang bị chặn hoặc người nhận chưa có Capacity đầy đủ).
                        </p>
                      )}
                    </div>

                    {/* Action Button */}
                    <button
                      className="refresh-button"
                      style={{ alignSelf: 'flex-start', marginTop: '6px', fontSize: '11px', padding: '7px 12px' }}
                      onClick={() => setTaskId(item.task.id)}
                    >
                      Mở Task để xem xét
                    </button>
                  </li>
                ))}
              </ul>

              {!data.total && (
                <div style={{ padding: '20px', background: '#f8faf6', borderRadius: '10px', textAlign: 'center', color: '#687761' }}>
                  🎉 Không có Task nào cần điều phối hoặc tháo gỡ điểm nghẽn trong kỳ này.
                </div>
              )}

              {data.total > 20 && (
                <div>
                  <p style={{ fontSize: '12px', color: '#687761' }}>
                    {data.total} Task · Trang {page}/{Math.max(1, Math.ceil(data.total / data.pageSize))}
                  </p>
                  <div className="inline-fields">
                    <button disabled={loading || page <= 1} onClick={() => setPage(page - 1)}>
                      Đề xuất trước
                    </button>
                    <button disabled={loading || page * data.pageSize >= data.total} onClick={() => setPage(page + 1)}>
                      Đề xuất sau
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
