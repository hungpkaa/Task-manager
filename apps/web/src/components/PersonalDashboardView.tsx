import { useEffect, useState } from 'react';
import { taskApi, taskStatuses, type DashboardResult, type Task, type TaskPriority, type TaskStatus } from '../api';
import { statusLabels } from './Tasks';
import { Icon } from './Icon';

type AttentionTask = DashboardResult['attention'][number];
type TaskFilter = { status?: TaskStatus; sort?: 'updatedAt' | 'dueDate'; direction?: 'asc' | 'desc' };
const statusColors: Record<TaskStatus, string> = { TODO: '#8996a8', IN_PROGRESS: '#2f78d5', REVIEW: '#d08a31', DONE: '#25845a' };
const priorityLabels: Record<TaskPriority, string> = { LOW: 'Thấp', MEDIUM: 'Trung bình', HIGH: 'Cao', URGENT: 'Khẩn cấp' };

function formatDate(value: string) {
  const [year, month, day] = value.slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
}
function dateDelta(dueDate: string, today: string) {
  const due = Date.parse(`${dueDate.slice(0, 10)}T00:00:00Z`);
  const base = Date.parse(`${today.slice(0, 10)}T00:00:00Z`);
  return Math.round((due - base) / 86_400_000);
}
function dueLabel(dueDate: string | null, today: string) {
  if (!dueDate) return { text: 'Chưa đặt hạn', tone: 'is-muted' };
  const delta = dateDelta(dueDate, today);
  if (delta === 0) return { text: 'Hôm nay', tone: 'is-today' };
  if (delta < 0) return { text: `Quá hạn ${Math.abs(delta)} ngày`, tone: 'is-overdue' };
  return { text: `Còn ${delta} ngày`, tone: delta <= 3 ? 'is-soon' : 'is-upcoming' };
}

function StatCard({ label, value, note, icon, tone, onClick }: { label: string; value: number; note: string; icon: 'task' | 'clock' | 'notification' | 'check'; tone: string; onClick: () => void }) {
  return <button type="button" className={`overview-metric metric-${tone}`} aria-label={`${label}: ${value}. ${note}`} onClick={onClick}>
    <span className="stat-card-label">{label}<span className="metric-icon"><Icon name={icon} /></span></span>
    <strong>{value}</strong><small>{note}</small>
  </button>;
}

function StatusBadge({ status }: { status: TaskStatus }) {
  return <span className={`task-badge status-${status.toLowerCase()}`}><i aria-hidden="true" />{statusLabels[status]}</span>;
}
function PriorityBadge({ priority }: { priority: TaskPriority }) {
  return <span className={`task-badge priority-${priority.toLowerCase()}`}>{priorityLabels[priority]}</span>;
}

function TaskItem({ item, detail, today, onClick }: { item: AttentionTask; detail?: Task; today: string; onClick: () => void }) {
  const due = dueLabel(item.dueDate, today);
  const blocked = item.dependencies.length > 0 || Boolean(detail?.blocked);
  return <button type="button" className="attention-card" onClick={onClick}>
    <span className={`attention-marker status-${item.status.toLowerCase()}`}><Icon name={item.status === 'DONE' ? 'check' : 'task'} /></span>
    <span className="attention-content"><strong>{item.title}</strong><small className="attention-description">{detail?.description?.trim() || 'Chưa có mô tả.'}</small>
      <span className="attention-meta"><span className="attention-project">{item.project.name}</span><span className="task-badges"><StatusBadge status={item.status} />{detail && <PriorityBadge priority={detail.priority} />}{blocked && <span className="task-badge priority-urgent">Bị chặn</span>}</span></span>
    </span>
    <span className={`attention-due ${due.tone}`}><span>{item.dueDate ? formatDate(item.dueDate) : '—'}</span><strong>{due.text}</strong><Icon name="arrow" /></span>
  </button>;
}

function DonutChart({ data }: { data: DashboardResult }) {
  const circumference = 2 * Math.PI * 51;
  let offset = 0;
  const labels = taskStatuses.map((status) => {
    const count = data.counts[status];
    const percent = data.total ? count / data.total * 100 : 0;
    const length = data.total ? circumference * percent / 100 : circumference / taskStatuses.length;
    const result = { status, count, percent, length, offset, color: statusColors[status] };
    offset += length;
    return result;
  });
  const description = labels.map(({ status, count, percent }) => `${statusLabels[status]}: ${count} (${Math.round(percent)}%)`).join(', ');
  return <div className="status-donut-wrap">
    <svg className="status-donut" viewBox="0 0 128 128" role="img" aria-label={`Phân bố trạng thái công việc. ${description}. ${data.total ? `Quá hạn: ${data.overdueCount}` : 'Chưa có công việc.'}`}>
      <circle className="donut-track" cx="64" cy="64" r="51" />
      {labels.map(({ status, count, percent, length, offset: segmentOffset, color }) => <circle key={status} className="donut-segment" cx="64" cy="64" r="51" stroke={color} strokeDasharray={`${Math.max(0, length - 2)} ${circumference - Math.max(0, length - 2)}`} strokeDashoffset={-segmentOffset}>
        <title>{`${statusLabels[status]}: ${count} (${Math.round(percent)}%)`}</title>
      </circle>)}
      <text className="donut-center-value" x="64" y="61" textAnchor="middle">{data.total ? `${data.progressPercent ?? 0}%` : '0'}</text>
      <text className="donut-center-label" x="64" y="78" textAnchor="middle">{data.total ? 'Hoàn thành' : 'Task'}</text>
    </svg>
    {data.total > 0 && <span className="donut-overdue-note">{data.overdueCount} Task quá hạn</span>}
  </div>;
}

function EmptyState({ hasTasks, onCreateTask }: { hasTasks: boolean; onCreateTask?: () => void }) {
  return <div className="dashboard-empty"><span className="empty-icon"><Icon name="check" /></span><h4>{hasTasks ? 'Tuyệt vời! Không có Task nào cần chú ý' : 'Chưa có công việc được giao'}</h4><p>{hasTasks ? 'Các công việc của bạn đang trong tầm kiểm soát.' : 'Chọn một Workspace và Project để bắt đầu công việc.'}</p>{onCreateTask && <button className="primary-button" onClick={onCreateTask}>{hasTasks ? 'Tạo Task mới' : 'Mở Workspace'}</button>}</div>;
}

export function PersonalDashboardView({ data, onTask, onWorkspace, onTasksFilter }: { data: DashboardResult; onTask: (id: string) => void; onWorkspace?: () => void; onTasksFilter?: (filter: TaskFilter) => void }) {
  const [details, setDetails] = useState<Record<string, Task>>({});
  useEffect(() => {
    let active = true;
    setDetails({});
    Promise.all(data.attention.map(async (task) => {
      try { return [task.id, (await taskApi.detail(task.id)).task] as const; }
      catch { return null; }
    })).then((results) => { if (active) setDetails(Object.fromEntries(results.filter((result): result is NonNullable<typeof result> => result !== null))); });
    return () => { active = false; };
  }, [data.attention]);

  return <>
    <div className="overview-metrics" aria-label="Tóm tắt công việc">
      <StatCard label="Tổng Task" value={data.total} icon="task" note="Công việc được giao" tone="neutral" onClick={() => onTasksFilter?.({})} />
      <StatCard label="Đang làm" value={data.counts.IN_PROGRESS} icon="clock" note="Đang triển khai" tone="blue" onClick={() => onTasksFilter?.({ status: 'IN_PROGRESS' })} />
      <StatCard label="Task quá hạn" value={data.overdueCount} icon="notification" note="Cần ưu tiên xử lý" tone={data.overdueCount ? 'red' : 'gold'} onClick={() => onTasksFilter?.({ sort: 'dueDate', direction: 'asc' })} />
      <StatCard label="Hoàn thành" value={data.counts.DONE} icon="check" note="Công việc đã hoàn tất" tone="green" onClick={() => onTasksFilter?.({ status: 'DONE' })} />
    </div>
    <div className="overview-columns">
      <section className="attention-panel"><div className="panel-heading"><div><span className="eyebrow">ƯU TIÊN HÔM NAY</span><h3>Task cần chú ý</h3></div><span className="count-pill">{data.attention.length} mục</span></div>
        <p className="panel-description">Task đến hạn hoặc bị chặn trong 7 ngày tới</p>
        <div className="attention-list">{data.attention.map((task) => <TaskItem key={task.id} item={task} detail={details[task.id]} today={data.today} onClick={() => onTask(task.id)} />)}</div>
        {!data.attention.length && <EmptyState hasTasks={data.total > 0} onCreateTask={onWorkspace} />}
      </section>
      <section className="distribution-panel"><span className="eyebrow">NHỊP ĐỘ CÔNG VIỆC</span><h3>Phân bố trạng thái</h3>
        <DonutChart data={data} />
        <ul className="distribution-legend" aria-label="Chú giải trạng thái">{taskStatuses.map((status) => <li key={status}><span className="legend-dot" style={{ background: statusColors[status] }} /><span>{statusLabels[status]}</span><strong>{data.counts[status]}</strong><small>{data.total ? `${Math.round(data.counts[status] / data.total * 100)}%` : '0%'}</small></li>)}</ul>
        <div className="distribution-footer"><strong>{data.dueSoonCount}</strong> sắp đến hạn <span>·</span> <strong>{data.blockedCount}</strong> bị chặn <span>·</span> <strong>{data.overdueCount}</strong> quá hạn</div>
      </section>
    </div>
    <details className="dashboard-details"><summary>Chi tiết số liệu</summary><p>Ngày đánh giá: {formatDate(data.today)}. Chỉ tổng hợp Task được giao trong các Project bạn còn là thành viên, kể cả Project đã đóng.</p><p>Tiến độ tính theo số Task hoàn thành trên tổng Task. Chưa hoàn thành: {data.activeCount} Task · {data.activeKnownEffort} Effort đã biết.</p><p>{data.missingEffortCount} Task chưa hoàn thành thiếu Effort · {data.missingDeadlineCount} thiếu hạn · {data.unassignedCount} chưa phân công.</p></details>
  </>;
}

export type { TaskFilter };
