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

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
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
  workspaceId: string; userId: string; role: 'OWNER' | 'MEMBER'; joinedAt: string;
  user: { id: string; email: string; displayName: string; status: 'ACTIVE' | 'LOCKED' };
}
export interface Notification {
  id: string; title: string; message: string; relatedEntityType: string; relatedEntityId: string;
  readAt: string | null; createdAt: string;
}
const json = (method: string, data: unknown) => ({ method, body: JSON.stringify(data) });
export const workspaceApi = {
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
export const projectApi = {
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
export interface TaskPage { tasks: Task[]; total: number; page: number; pageSize: number; }
export const taskApi = {
  comments: (id: string, page = 1) => request<CommentPage>(`/tasks/${id}/comments?page=${page}`),
  addComment: (id: string, body: string) => request<{ comment: TaskComment }>(`/tasks/${id}/comments`, json('POST', { body })),
  list: (projectId: string, query: URLSearchParams) => request<TaskPage>(`/projects/${projectId}/tasks?${query}`),
  mine: (query: URLSearchParams) => request<TaskPage>(`/tasks/mine?${query}`),
  detail: (id: string) => request<{ task: Task }>(`/tasks/${id}`),
  create: (projectId: string, data: TaskInput & { assigneeId: string | null }) => request<{ task: Task }>(`/projects/${projectId}/tasks`, json('POST', data)),
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
