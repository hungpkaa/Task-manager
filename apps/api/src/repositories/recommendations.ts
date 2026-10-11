import type { Prisma, Project } from '../generated/prisma/client.js';
import { projectRisk } from './project-risk.js';

export async function recommendations(tx: Prisma.TransactionClient, project: Pick<Project, 'id' | 'endDate' | 'status'>, query: { periodStart: string; periodEnd: string; page: number }, now = new Date()) {
  const risk = await projectRisk(tx, project, query, now);
  const start = new Date(query.periodStart); const end = new Date(query.periodEnd);
  const within: Prisma.TaskWhereInput = { AND: [{ OR: [{ startDate: null }, { startDate: { lte: end } }] }, { OR: [{ dueDate: null }, { dueDate: { gte: start } }] }] };
  const active: Prisma.TaskWhereInput = { projectId: project.id, status: { not: 'DONE' } };
  const members = await tx.projectMember.findMany({ where: { projectId: project.id }, orderBy: { userId: 'asc' }, select: { userId: true, workspaceMember: { select: { user: { select: { id: true, displayName: true, status: true } } } } } });
  const capacities = await tx.memberCapacity.findMany({ where: { projectId: project.id, periodStart: start, periodEnd: end } });
  const groups = await tx.task.groupBy({ by: ['assigneeId'], where: { ...active, ...within }, _sum: { effort: true }, _count: { _all: true, effort: true } });
  const availableIds = members.filter((member) => member.workspaceMember.user.status === 'ACTIVE').map((member) => member.userId);
  const overloadedIds = groups.flatMap((group) => { const cap = capacities.find((item) => item.userId === group.assigneeId); return cap && (group._sum.effort ?? 0) > cap.capacityPoints && group.assigneeId ? [group.assigneeId] : []; });
  const today = new Date(`${risk.today}T00:00:00Z`);
  const where: Prisma.TaskWhereInput = { ...active, OR: [
    { effort: null }, { dueDate: null }, { assigneeId: null }, { dueDate: { lt: today } },
    { dependencies: { some: { dependsOnTask: { status: { not: 'DONE' } } } } },
    { assigneeId: { not: null, notIn: availableIds } },
    { assigneeId: { in: overloadedIds }, ...within },
  ] };
  const total = await tx.task.count({ where });
  const tasks = await tx.task.findMany({ where, orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }], skip: (query.page - 1) * 20, take: 20,
    select: { id: true, title: true, status: true, effort: true, startDate: true, dueDate: true, assigneeId: true, assignee: { select: { displayName: true } }, dependencies: { where: { dependsOnTask: { status: { not: 'DONE' } } }, orderBy: { dependsOnTaskId: 'asc' }, select: { dependsOnTask: { select: { id: true, title: true } } } } } });
  const items = tasks.map((task) => {
    const reasons: { code: string; message: string }[] = [];
    if (task.effort === null) reasons.push({ code: 'ESTIMATE', message: 'Ước lượng Effort trước khi đánh giá khả năng nhận thêm việc.' });
    if (!task.dueDate) reasons.push({ code: 'SET_DEADLINE', message: 'Thống nhất hạn hoàn thành để đánh giá quá hạn và kế hoạch.' });
    if (!task.assigneeId) reasons.push({ code: 'ASSIGN', message: 'Chọn người phụ trách trong Project.' });
    if (task.assigneeId && !availableIds.includes(task.assigneeId)) reasons.push({ code: 'REPLACE_UNAVAILABLE', message: 'Xem lại phân công vì người phụ trách đã rời Project hoặc tài khoản khóa.' });
    if (task.dueDate && task.dueDate < today) reasons.push({ code: 'REVIEW_OVERDUE', message: 'Kiểm tra nguyên nhân quá hạn, ưu tiên và thống nhất lại kế hoạch.' });
    if (task.dependencies.length) reasons.push({ code: 'UNBLOCK', message: `Trao đổi để hoàn thành ${task.dependencies.length} dependency chưa DONE trước khi tiếp tục Task.` });
    const inPeriod = (!task.startDate || task.startDate <= end) && (!task.dueDate || task.dueDate >= start);
    if (inPeriod && task.assigneeId && overloadedIds.includes(task.assigneeId)) reasons.push({ code: 'REBALANCE', message: task.status === 'TODO' ? 'Cân nhắc chuyển Task chưa bắt đầu để giảm tải người phụ trách.' : 'Xem lại phạm vi hoặc hỗ trợ người quá tải; Task đã bắt đầu cần cân nhắc chi phí bàn giao.' });
    const needsAssignee = !task.assigneeId || !availableIds.includes(task.assigneeId) || overloadedIds.includes(task.assigneeId);
    const candidates = task.status === 'TODO' && inPeriod && task.effort !== null && !task.dependencies.length && needsAssignee
      ? members.flatMap((member) => {
        if (member.userId === task.assigneeId || member.workspaceMember.user.status !== 'ACTIVE') return [];
        const cap = capacities.find((item) => item.userId === member.userId); if (!cap) return [];
        const load = groups.find((group) => group.assigneeId === member.userId);
        if (load && load._count._all !== load._count.effort) return [];
        const knownEffort = load?._sum.effort ?? 0; const projectedEffort = knownEffort + task.effort!;
        if (projectedEffort > cap.capacityPoints) return [];
        return [{ userId: member.userId, displayName: member.workspaceMember.user.displayName, knownEffort, capacityPoints: cap.capacityPoints, projectedEffort, projectedPercent: Math.round(projectedEffort / cap.capacityPoints * 10000) / 100 }];
      }).sort((a, b) => a.projectedEffort / a.capacityPoints - b.projectedEffort / b.capacityPoints || a.userId.localeCompare(b.userId)).slice(0, 3) : [];
    return { task: { id: task.id, title: task.title, status: task.status, assignee: task.assignee?.displayName ?? null }, reasons, candidates,
      blockingCount: task.dependencies.length, blockingTasks: task.dependencies.slice(0, 3).map((item) => item.dependsOnTask) };
  });
  const actions: Record<string, string> = {
    OVERDUE: 'Rà soát các Task quá hạn và thống nhất ưu tiên/kế hoạch xử lý.', OVERLOAD: 'Rà soát phân công và phạm vi để giảm tải trong kỳ.',
    LATE_SPRINT: 'Tổng kết Sprint hết hạn và quyết định xử lý Task chưa hoàn thành.', LATE_PROJECT: 'Rà soát mốc kết thúc Project với nhóm.',
    BLOCKED: 'Trao đổi với người phụ trách dependency để gỡ chặn.', BEHIND_SPRINT: 'Kiểm tra blocker, phạm vi và khả năng đạt Goal; tỷ lệ theo thời gian chỉ là tín hiệu.',
    MISSING_EFFORT: 'Bổ sung Effort trước khi so sánh tải.', MISSING_DEADLINE: 'Bổ sung hạn hoàn thành còn thiếu.', MISSING_CAPACITY: 'Thiết lập Capacity khớp đúng kỳ cho người phụ trách.',
    UNASSIGNED: 'Phân công Task cho thành viên Project.', UNAVAILABLE_ASSIGNEE: 'Kiểm tra thành viên/tài khoản và chuyển giao khi cần.', EMPTY_PROJECT: 'Lập Backlog để có dữ liệu điều phối.',
  };
  return { periodStart: query.periodStart, periodEnd: query.periodEnd, today: risk.today, page: query.page, pageSize: 20, total, items, projectStatus: project.status,
    advice: risk.signals.map((signal) => ({ code: signal.code, message: actions[signal.code] ?? signal.message })) };
}
