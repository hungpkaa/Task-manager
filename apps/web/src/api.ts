export type ConnectionState = 'checking' | 'connected' | 'unavailable';
export interface ConnectionResult {
  api: ConnectionState;
  database: ConnectionState;
}

export async function checkConnection(signal: AbortSignal): Promise<ConnectionResult> {
  try {
    const live = await fetch('/api/health', { signal, cache: 'no-store' });
    const body: unknown = await live.json();
    if (!live.ok || !isObject(body) || body.status !== 'ok' || body.service !== 'task-manager-api') {
      return { api: 'unavailable', database: 'unavailable' };
    }
  } catch (error) {
    if (signal.aborted) throw error;
    return { api: 'unavailable', database: 'unavailable' };
  }
  try {
    const ready = await fetch('/api/health/ready', { signal, cache: 'no-store' });
    const body: unknown = await ready.json();
    return {
      api: 'connected',
      database: ready.ok && isObject(body) && body.status === 'ok' && body.database === 'connected'
        ? 'connected' : 'unavailable',
    };
  } catch (error) {
    if (signal.aborted) throw error;
    return { api: 'connected', database: 'unavailable' };
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export interface Account {
  id: string;
  email: string;
  displayName: string;
  systemRole: 'MEMBER' | 'SYSTEM_ADMIN';
  createdAt: string;
}

export class ApiError extends Error {
  constructor(public readonly status: number, message: string, public readonly fields: Record<string, string> = {}) {
    super(message);
  }
}

export interface Sprint { id: string; name: string; goal: string; startDate: string; endDate: string; updatedAt: string; startedAt: string | null; completedAt?: string | null; completion?: { doneCount: number; incompleteCount: number; tasks: { id: string; title: string; status: string; destinationSprintId: string | null }[] } | null; status: 'PLANNED' | 'ACTIVE' | 'COMPLETED'; _count?: { tasks: number }; }
export interface SprintStart { applied: boolean; sprint: Sprint; warnings: string[]; taskCount: number; }
export interface SprintMonitorResult {
  sprint: Sprint; summary: { total: number; counts: Record<TaskStatus, number>; progressPercent: number; blocked: number; overdue: number; daysRemaining: number; today: string; sprintOverdue: boolean };
  items: (BacklogTask & { assigneeId: string | null; dueDate: string | null; blocked: boolean; overdue: boolean; blockingTasks: { id: string; title: string; status: TaskStatus }[] })[];
  total: number; page: number; pageSize: number; assignees: { id: string; displayName: string }[]; warnings: string[];
}
export interface BacklogTask { id: string; title: string; status: string; priority: string; effort: number | null; updatedAt: string; assignee: { displayName: string } | null; }
export interface PlanningAssessment { applied: boolean; warnings: string[]; totalEffort: number; missingEffort: number; taskCount: number; capacityAvailable: boolean; }
export interface SprintInput { name: string; goal: string; startDate: string; endDate: string; }
export interface DailyResult { items: { id: string; progress: string; nextPlan: string; blockers: string; createdAt: string; author: { id: string; displayName: string } }[]; total: number; pageSize: number; canCreate: boolean; }
export const sprintApi = {
  finishPreview: (projectId: string, id: string) => request<{ snapshot: string; doneCount: number; incompleteCount: number }>(`/projects/${projectId}/sprints/${id}/finish-preview`, { method: 'POST', body: '{}' }),
  finish: (projectId: string, id: string, expectedSnapshot: string, destinationSprintId: string | null) => request(`/projects/${projectId}/sprints/${id}/finish`, { method: 'POST', body: JSON.stringify({ expectedSnapshot, destinationSprintId, confirmed: true }) }),
  retrospective: (projectId: string, id: string) => request<RetrospectiveResult>(`/projects/${projectId}/sprints/${id}/retrospective`),
  saveRetrospective: (projectId: string, id: string, input: RetrospectiveInput) => request<SprintRetrospectiveRecord>(`/projects/${projectId}/sprints/${id}/retrospective`, { method: 'PUT', body: JSON.stringify(input) }),
  review: (projectId: string, id: string) => request<ReviewResult>(`/projects/${projectId}/sprints/${id}/review`),
  saveReview: (projectId: string, id: string, input: { summary: string; feedback: string; expectedUpdatedAt: string | null }) => request<SprintReviewRecord>(`/projects/${projectId}/sprints/${id}/review`, { method: 'PUT', body: JSON.stringify(input) }),
  daily: (projectId: string, id: string, page: number) => request<DailyResult>(`/projects/${projectId}/sprints/${id}/daily?page=${page}`),
  addDaily: (projectId: string, id: string, input: { progress: string; nextPlan: string; blockers: string }) => request(`/projects/${projectId}/sprints/${id}/daily`, { method: 'POST', body: JSON.stringify(input) }),
  list: (projectId: string, page: number) => request<{ items: Sprint[]; total: number; pageSize: number; canMonitor: boolean }>(`/projects/${projectId}/sprints?page=${page}`),
  start: (projectId: string, sprint: Sprint, confirmed: boolean) => request<SprintStart>(`/projects/${projectId}/sprints/${sprint.id}/start`, { method: 'POST', body: JSON.stringify({ expectedUpdatedAt: sprint.updatedAt, confirmed }) }),
  monitor: (projectId: string, sprintId: string, query: URLSearchParams) => request<SprintMonitorResult>(`/projects/${projectId}/sprints/${sprintId}/monitor?${query}`),
  backlog: (projectId: string, page: number, sprintId = '') => request<{ items: BacklogTask[]; total: number; pageSize: number }>(`/projects/${projectId}/backlog?page=${page}${sprintId ? `&sprintId=${sprintId}` : ''}`),
  create: (projectId: string, input: SprintInput) => request<{ sprint: Sprint }>(`/projects/${projectId}/sprints`, { method: 'POST', body: JSON.stringify(input) }),
  plan: (projectId: string, sprintId: string, tasks: { id: string; updatedAt: string }[], confirmed: boolean) => request<PlanningAssessment>(`/projects/${projectId}/sprints/${sprintId}/plan`, { method: 'POST', body: JSON.stringify({ tasks, confirmed }) }),
  returnTask: (projectId: string, sprintId: string, task: BacklogTask) => request<void>(`/projects/${projectId}/sprints/${sprintId}/tasks/${task.id}/return`, { method: 'POST', body: JSON.stringify({ updatedAt: task.updatedAt }) }),
};

export interface SprintReviewRecord { id: string; summary: string; feedback: string; doneCount: number; incompleteCount: number; updatedAt: string; author: { id: string; displayName: string }; }
export interface ReviewResult { review: SprintReviewRecord | null; current: { doneCount: number; incompleteCount: number }; canEdit: boolean; }
export interface RetrospectiveInput { wentWell: string; needsImprovement: string; actionItems: string; expectedUpdatedAt: string | null; }
export interface SprintRetrospectiveRecord { id: string; wentWell: string; needsImprovement: string; actionItems: string; updatedAt: string; author: { id: string; displayName: string }; }
export interface RetrospectiveResult { retrospective: SprintRetrospectiveRecord | null; canEdit: boolean; }

async function request<T>(path: string, options: RequestInit = {}, binary = false): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      ...options,
      credentials: 'same-origin',
      cache: 'no-store',
      signal: options.signal ?? AbortSignal.timeout(10_000),
      headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
    });
  } catch {
    throw new ApiError(0, 'Không kết nối được máy chủ. Vui lòng thử lại.');
  }
  if (response.status === 204) return undefined as T;
  if (response.ok && binary) return await response.blob() as T;
  let body: unknown;
  try { body = await response.json(); } catch {
    throw new ApiError(response.status, 'Máy chủ chưa sẵn sàng. Vui lòng thử lại.');
  }
  if (!response.ok) {
    const fields: Record<string, string> = {};
    if (isObject(body) && isObject(body.fields)) {
      for (const [field, value] of Object.entries(body.fields)) if (typeof value === 'string') fields[field] = value;
    }
    throw new ApiError(response.status,
      isObject(body) && typeof body.message === 'string' ? body.message : 'Không thể xử lý yêu cầu.', fields);
  }
  return body as T;
}

export const accountApi = {
  forgotPassword: (email: string) => request<{ message: string }>('/auth/password/forgot', { method: 'POST', body: JSON.stringify({ email }), signal: AbortSignal.timeout(15_000) }),
  resetPassword: (token: string, password: string) => request<{ message: string }>('/auth/password/reset', { method: 'POST', body: JSON.stringify({ token, password }) }),
  me: (signal?: AbortSignal) => request<{ user: Account }>('/auth/me', { signal }),
  register: (data: { email: string; password: string; displayName: string }) =>
    request<{ user: Account }>('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  login: (data: { email: string; password: string }) =>
    request<{ user: Account }>('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
  logout: () => request<void>('/auth/logout', { method: 'POST', body: '{}' }),
  updateProfile: (displayName: string) =>
    request<{ user: Account }>('/auth/me', { method: 'PATCH', body: JSON.stringify({ displayName }) }),
};

export interface Workspace {
  id: string; name: string; description: string; createdBy: string;
  myRole: 'OWNER' | 'MEMBER'; memberCount: number; createdAt: string; updatedAt: string;
}
export interface WorkspaceMember {
  emailDelivery?: 'LOCAL' | 'SENT' | 'FAILED' | 'DISABLED';
  workspaceId: string; userId: string; role: 'OWNER' | 'MEMBER'; joinedAt: string;
  user: { id: string; email: string; displayName: string; status: 'ACTIVE' | 'LOCKED' };
}
export interface Notification {
  id: string; title: string; message: string; relatedEntityType: string; relatedEntityId: string;
  readAt: string | null; createdAt: string;
}
const json = (method: string, data: unknown) => ({ method, body: JSON.stringify(data) });
export const workspaceApi = {
  resendInvitation: (id: string, userId: string) => request<{ delivery: NonNullable<WorkspaceMember['emailDelivery']> }>(`/workspaces/${id}/members/${userId}/email`, json('POST', {})),
  list: () => request<{ workspaces: Workspace[] }>('/workspaces'),
  detail: (id: string) => request<{ workspace: Workspace }>(`/workspaces/${id}`),
  create: (data: { name: string; description: string }) => request<{ workspace: Workspace }>('/workspaces', json('POST', data)),
  update: (id: string, data: { name: string; description: string }) => request<{ workspace: Workspace }>(`/workspaces/${id}`, json('PATCH', data)),
  members: (id: string) => request<{ members: WorkspaceMember[] }>(`/workspaces/${id}/members`),
  invite: (id: string, email: string) => request<{ member: WorkspaceMember }>(`/workspaces/${id}/members`, json('POST', { email })),
  role: (id: string, userId: string, role: WorkspaceMember['role']) => request<{ member: WorkspaceMember }>(`/workspaces/${id}/members/${userId}`, json('PATCH', { role })),
  remove: (id: string, userId: string) => request<void>(`/workspaces/${id}/members/${userId}`, json('DELETE', {})),
};
export const notificationApi = {
  list: () => request<{ items: Notification[]; unreadCount: number }>('/notifications'),
  read: (id: string) => request<{ notification: Notification }>(`/notifications/${id}/read`, json('PATCH', {})),
};

export interface Project {
  id: string; workspaceId: string; name: string; description: string;
  managerUserId: string | null; manager: WorkspaceMember['user'] | null;
  status: 'ACTIVE' | 'CLOSED'; startDate: string | null; endDate: string | null;
  isWorkspaceOwner: boolean; isManager: boolean; memberCount: number;
}
export interface ProjectMember { projectId: string; userId: string; user: WorkspaceMember['user']; joinedAt: string; }
export interface ProjectInput { name: string; description: string; startDate: string | null; endDate: string | null; }
export interface MemberCapacity { id: string; userId: string; periodStart: string; periodEnd: string; capacityPoints: number; updatedAt: string; }
export interface WorkloadPage {
  periodStart: string; periodEnd: string; page: number; pageSize: number; total: number; canEdit: boolean;
  summary: { taskCount: number; knownEffort: number; missingEffortCount: number; unassignedCount: number; unassignedEffort: number };
  items: { user: ProjectMember['user']; taskCount: number; knownEffort: number; missingEffortCount: number; capacity: MemberCapacity | null; percent: number | null; overloaded: boolean; complete: boolean }[];
}
export interface CapacityPage { items: (MemberCapacity & { user: ProjectMember['user'] })[]; total: number; page: number; pageSize: number; }
export const projectApi = {
  workload: (id: string, periodStart: string, periodEnd: string, page = 1) => request<WorkloadPage>(`/projects/${id}/workload?${new URLSearchParams({ periodStart, periodEnd, page: String(page) })}`),
  capacities: (id: string, page = 1) => request<CapacityPage>(`/projects/${id}/capacities?page=${page}`),
  saveCapacity: (id: string, input: { userId: string; periodStart: string; periodEnd: string; capacityPoints: number; expectedUpdatedAt: string | null }) => request<{ capacity: MemberCapacity }>(`/projects/${id}/capacities`, json('PUT', input)),
  list: (workspaceId: string) => request<{ projects: Project[] }>(`/workspaces/${workspaceId}/projects`),
  create: (workspaceId: string, data: ProjectInput) => request<{ project: Project }>(`/workspaces/${workspaceId}/projects`, json('POST', data)),
  detail: (id: string) => request<{ project: Project }>(`/projects/${id}`),
  update: (id: string, data: ProjectInput) => request<{ project: Project }>(`/projects/${id}`, json('PATCH', data)),
  manager: (id: string, managerUserId: string, expectedManagerUserId: string | null) => request<{ project: Project }>(`/projects/${id}/manager`, json('PATCH', { managerUserId, expectedManagerUserId })),
  close: (id: string) => request<{ project: Project }>(`/projects/${id}/close`, json('POST', {})),
  members: (id: string) => request<{ members: ProjectMember[] }>(`/projects/${id}/members`),
  add: (id: string, userId: string) => request<{ member: ProjectMember }>(`/projects/${id}/members`, json('POST', { userId })),
  remove: (id: string, userId: string) => request<void>(`/projects/${id}/members/${userId}`, json('DELETE', {})),
};

export const taskStatuses = ['TODO', 'IN_PROGRESS', 'REVIEW', 'DONE'] as const;
export const taskPriorities = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
export type TaskStatus = typeof taskStatuses[number];
export type TaskPriority = typeof taskPriorities[number];
export interface Task {
  id: string; projectId: string; title: string; description: string; status: TaskStatus; priority: TaskPriority;
  assigneeId: string | null; assignee: { id: string; displayName: string; email: string } | null;
  sprintId: string | null; startDate: string | null; dueDate: string | null; effort: number | null;
  updatedAt: string; project: { id: string; name: string; workspaceId: string; managerUserId: string | null; status: 'ACTIVE' | 'CLOSED' };
  canEdit: boolean; canChangeStatus: boolean; blocked: boolean; blockingTasks: { id: string; title: string; status: TaskStatus }[];
}
export interface TaskInput { title: string; description: string; priority: TaskPriority; startDate: string | null; dueDate: string | null; effort: number | null; }
export interface DependencyPage { items: { dependsOnTaskId: string; dependsOnTask: { id: string; title: string; status: TaskStatus } }[]; total: number; pageSize: number; canEdit: boolean; }
export interface TaskPage { tasks: Task[]; total: number; page: number; pageSize: number; }
export const taskApi = {
  dependencies: (id: string, page: number) => request<DependencyPage>(`/tasks/${id}/dependencies?page=${page}`),
  addDependency: (id: string, dependsOnTaskId: string) => request(`/tasks/${id}/dependencies`, json('POST', { dependsOnTaskId })),
  removeDependency: (id: string, dependsOnTaskId: string) => request<void>(`/tasks/${id}/dependencies/${dependsOnTaskId}`, json('DELETE', {})),
  attachments: (id: string, page = 1) => request<AttachmentPage>(`/tasks/${id}/attachments?page=${page}`),
  upload: (id: string, file: File) => request<{ attachment: Omit<TaskAttachment, 'canDelete'> }>(`/tasks/${id}/attachments`, { method: 'POST', body: file, headers: { 'Content-Type': 'application/octet-stream', 'X-Filename': encodeURIComponent(file.name) }, signal: AbortSignal.timeout(30_000) }),
  download: (id: string, attachmentId: string) => request<Blob>(`/tasks/${id}/attachments/${attachmentId}/download`, { signal: AbortSignal.timeout(30_000) }, true),
  removeAttachment: (id: string, attachmentId: string) => request<void>(`/tasks/${id}/attachments/${attachmentId}`, json('DELETE', {})),
  comments: (id: string, page = 1) => request<CommentPage>(`/tasks/${id}/comments?page=${page}`),
  addComment: (id: string, body: string) => request<{ comment: TaskComment }>(`/tasks/${id}/comments`, json('POST', { body })),
  list: (projectId: string, query: URLSearchParams) => request<TaskPage>(`/projects/${projectId}/tasks?${query}`),
  mine: (query: URLSearchParams) => request<TaskPage>(`/tasks/mine?${query}`),
  detail: (id: string) => request<{ task: Task }>(`/tasks/${id}`),
  create: (projectId: string, data: TaskInput & { assigneeId: string | null; sprintId?: string | null }) => request<{ task: Task }>(`/projects/${projectId}/tasks`, json('POST', data)),
  update: (id: string, data: TaskInput) => request<{ task: Task }>(`/tasks/${id}`, json('PATCH', data)),
  assign: (id: string, assigneeId: string | null) => request<{ task: Task }>(`/tasks/${id}/assignee`, json('PATCH', { assigneeId })),
  status: (id: string, status: TaskStatus, expectedStatus: TaskStatus, acknowledgeBlocked = false) => request<{ task: Task; warning: string | null }>(`/tasks/${id}/status`, json('PATCH', { status, expectedStatus, acknowledgeBlocked })),
  remove: (id: string) => request<void>(`/tasks/${id}`, json('DELETE', {})),
};

export interface TaskComment {
  id: string; body: string; createdAt: string; author: { id: string; displayName: string; email: string };
  mentions: { user: { id: string; displayName: string; email: string } }[];
}
export interface CommentPage { items: TaskComment[]; total: number; page: number; pageSize: number; canPost: boolean; }
export interface TaskAttachment {
  id: string; taskId: string; filename: string; sizeBytes: number; createdAt: string; canDelete: boolean;
  uploader: { id: string; displayName: string; email: string };
}
export interface AttachmentPage { items: TaskAttachment[]; total: number; page: number; pageSize: number; canUpload: boolean; }
