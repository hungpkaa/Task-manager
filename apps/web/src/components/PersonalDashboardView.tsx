import type { CSSProperties } from 'react';
import { taskStatuses, type DashboardResult } from '../api';
import { statusLabels } from './Tasks';
import { Icon } from './Icon';

export function PersonalDashboardView({ data, onTask, onWorkspace }: { data: DashboardResult; onTask: (id: string) => void; onWorkspace?: () => void }) {
  const colors = ['#c8d3cd', '#6498be', '#e5bc55', '#327b57'];
  let offset = 0;
  const stops = taskStatuses.map((status, index) => { const start = offset; offset += data.total ? data.counts[status] / data.total * 100 : 0; return `${colors[index]} ${start}% ${offset}%`; }).join(', ');
  return <>
    <div className="overview-metrics">{[
      { label: 'Tổng Task', value: data.total, icon: 'task' as const, caption: 'Công việc được giao', tone: 'neutral' },
      { label: 'Đang làm', value: data.counts.IN_PROGRESS, icon: 'clock' as const, caption: 'Đang triển khai', tone: 'blue' },
      { label: 'Task quá hạn', value: data.overdueCount, icon: 'notification' as const, caption: 'Cần ưu tiên xử lý', tone: 'gold' },
      { label: 'Hoàn thành', value: data.counts.DONE, icon: 'check' as const, caption: 'Công việc đã DONE', tone: 'green' },
    ].map((metric) => <article className={`overview-metric metric-${metric.tone}`} key={metric.label}><div><span>{metric.label}</span><span className="metric-icon"><Icon name={metric.icon} /></span></div><strong>{metric.value}</strong><small>{metric.caption}</small></article>)}</div>
    <div className="overview-columns">
      <section className="attention-panel"><div className="panel-heading"><div><span className="eyebrow">ƯU TIÊN HÔM NAY</span><h3>Task cần chú ý</h3></div><span className="count-pill">{data.attention.length} mục</span></div><p className="panel-description">Công việc bị chặn hoặc đến hạn trong 7 ngày tới, gồm quá hạn. Tối đa 10 mục, ưu tiên hạn sớm.</p>
        <div className="attention-list">{data.attention.map((task) => <button className="attention-card" key={task.id} onClick={() => onTask(task.id)}><span className={`attention-marker status-${task.status.toLowerCase()}`}><Icon name={task.status === 'DONE' ? 'check' : 'task'} /></span><span className="attention-content"><strong>{task.title}</strong><small>{task.project.name}</small><span className="task-badges"><span className={`task-badge status-${task.status.toLowerCase()}`}>{statusLabels[task.status]}</span>{task.dependencies.length > 0 && <span className="task-badge priority-urgent">BLOCKED</span>}{task.dueDate && task.dueDate.slice(0, 10) < data.today && <span className="task-badge priority-high">Quá hạn</span>}</span></span><span className="attention-due"><Icon name="clock" />{task.dueDate?.slice(0, 10) ?? 'Chưa đặt hạn'}<Icon name="arrow" /></span></button>)}</div>
        {!data.attention.length && <div className="dashboard-empty"><span className="empty-icon"><Icon name="check" /></span><h4>{data.total ? 'Bạn đang theo sát công việc' : 'Bắt đầu cùng nhóm của bạn'}</h4><p>{data.total ? 'Không có Task cần chú ý theo các tiêu chí này.' : 'Chưa có Task được giao. Mở Workspace để tham gia dự án và bắt đầu công việc.'}</p>{!data.total && onWorkspace && <button className="primary-button" onClick={onWorkspace}>Mở Workspace</button>}</div>}
      </section>
      <section className="distribution-panel"><span className="eyebrow">NHỊP ĐỘ CÔNG VIỆC</span><h3>Phân bố trạng thái</h3>
        {data.total ? <div className="status-donut" role="img" aria-label={`Tiến độ hoàn thành ${data.progressPercent}%. ${taskStatuses.map((status) => `${statusLabels[status]}: ${data.counts[status]}`).join(', ')}`} style={{ '--donut-fill': `conic-gradient(${stops})` } as CSSProperties}><div><strong>{data.progressPercent}%</strong><span>Hoàn thành</span></div></div> : <div className="chart-empty"><Icon name="board" /><p>Chưa có dữ liệu tiến độ</p></div>}
        <ul className="distribution-legend">{taskStatuses.map((status, index) => <li key={status}><span className="legend-dot" style={{ background: colors[index] }} /><span>{statusLabels[status]}</span><strong>{data.counts[status]}</strong></li>)}</ul>
        <div className="distribution-footer"><strong>{data.dueSoonCount}</strong> đến hạn trong 7 ngày tới <span>·</span> <strong>{data.blockedCount}</strong> BLOCKED</div>
      </section>
    </div>
    <details className="dashboard-details"><summary>Chi tiết số liệu</summary><p>Ngày đánh giá: {data.today} (Việt Nam). Chỉ tổng hợp Task giao cho bạn trong các Project bạn còn là thành viên, kể cả Project đã đóng.</p><p>Tiến độ = số Task DONE / tổng Task; không tính theo Effort. Chưa DONE: {data.activeCount} Task · {data.activeKnownEffort} Effort đã biết.</p><p>{data.missingEffortCount} Task chưa DONE thiếu Effort · {data.missingDeadlineCount} thiếu hạn · {data.unassignedCount} chưa phân công. BLOCKED và quá hạn có thể cùng một Task.</p></details>
  </>;
}
