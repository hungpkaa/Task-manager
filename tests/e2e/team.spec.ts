import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../apps/api/dist/generated/prisma/client.js';
import { readConfig } from '../../apps/api/dist/config.js';

const config = readConfig();
const password = 'browser acceptance passphrase';
const baseURL = process.env.WEB_URL || 'http://127.0.0.1:5174';
let emails: string[];
let contexts: BrowserContext[];
let client: PrismaClient;
let pageErrors: string[];
test.beforeEach(async () => {
  emails = []; contexts = []; pageErrors = [];
  client = new PrismaClient({ adapter: new PrismaPg({ connectionString: config.databaseUrl }) });
});
test.afterEach(async () => {
  await Promise.all(contexts.map((context) => context.close()));
  try {
    await client.project.deleteMany({ where: { workspace: { creator: { email: { in: emails } } } } });
    await client.workspace.deleteMany({ where: { creator: { email: { in: emails } } } });
    await client.user.deleteMany({ where: { email: { in: emails } } });
  } finally { await client.$disconnect(); }
  expect(pageErrors, 'No uncaught React/browser runtime exceptions').toEqual([]);
});
async function observe(page: Page) {
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.route('https://fonts.googleapis.com/**', (route) => route.abort());
  await page.route('https://fonts.gstatic.com/**', (route) => route.abort());
}
async function register(page: Page, name: string) {
  const email = `e2e-${randomUUID()}@example.invalid`; emails.push(email);
  await observe(page); await page.goto(baseURL);
  await page.getByRole('button', { name: 'Đăng ký', exact: true }).click();
  await page.getByLabel('Tên hiển thị', { exact: true }).fill(name);
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
  await page.getByLabel('Nhập lại mật khẩu', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Tạo tài khoản →', exact: true }).click();
  await expect(page.locator('.sidebar')).toBeVisible();
  return email;
}
async function nav(page: Page, name: string) { await page.locator('.sidebar').getByRole('button', { name, exact: true }).click(); }
async function noOverflow(page: Page) {
  const size = await page.evaluate(() => ({ width: window.innerWidth, document: document.documentElement.scrollWidth }));
  expect(size.document, 'Only Kanban should scroll internally; the page must fit the viewport').toBeLessThanOrEqual(size.width + 1);
}

test('three users complete Workspace → Project → Task → My Tasks → DONE → closed Project', async ({ browser }, testInfo) => {
  const pages: Page[] = [];
  for (let index = 0; index < 3; index++) {
    const context = await browser.newContext({ viewport: testInfo.project.use.viewport, hasTouch: testInfo.project.name === 'mobile' });
    contexts.push(context); pages.push(await context.newPage());
  }
  const [owner, pm, member] = pages as [Page, Page, Page];
  const ownerEmail = await register(owner, 'Owner QA');
  const pmEmail = await register(pm, 'PM QA');
  const memberEmail = await register(member, 'Member QA');
  const workspaceName = `Workspace QA ${randomUUID().slice(0, 8)}`;
  const projectName = 'Dự án nghiệm thu';
  const taskName = 'Kiểm tra công việc nhóm trên trình duyệt';
  await nav(owner, 'Workspace');
  await owner.getByLabel('Tên Workspace', { exact: true }).fill(workspaceName);
  await owner.getByRole('button', { name: 'Tạo Workspace', exact: true }).click();
  await expect(owner.getByRole('heading', { name: workspaceName, exact: true })).toBeVisible();
  for (const email of [pmEmail, memberEmail]) {
    await owner.getByLabel('Mời bằng email đã đăng ký').fill(email);
    await owner.getByRole('button', { name: 'Thêm thành viên', exact: true }).click();
    await expect(owner.locator('.member-list').first()).toContainText(email);
  }
  await owner.getByLabel('Tên Project', { exact: true }).fill(projectName);
  await owner.getByRole('button', { name: 'Tạo Project', exact: true }).click();
  const ownerProject = owner.locator('.projects-panel');
  await expect(ownerProject.getByRole('heading', { name: projectName, exact: true })).toBeVisible();
  await owner.getByLabel('Chọn thành viên Workspace').selectOption({ label: `PM QA · ${pmEmail}` });
  await owner.getByRole('button', { name: 'Phân công PM', exact: true }).click();
  await owner.getByRole('group', { name: 'Xác nhận thay đổi Project' }).getByRole('button', { name: 'Xác nhận', exact: true }).click();
  await expect(ownerProject).toContainText('PM QA');
  await expect(ownerProject.getByRole('button', { name: '+ Tạo Task', exact: true })).toHaveCount(0);
  await nav(pm, 'Workspace');
  await pm.getByRole('button', { name: new RegExp(workspaceName) }).click();
  await pm.getByRole('button', { name: new RegExp(projectName) }).click();
  await pm.getByLabel('Thêm thành viên từ Workspace').selectOption({ label: `Member QA · ${memberEmail}` });
  await pm.getByRole('button', { name: 'Thêm vào Project', exact: true }).click();
  await expect(pm.locator('.projects-panel .member-list')).toContainText(memberEmail);
  const pmTasks = pm.locator('.tasks-panel');
  await pmTasks.getByRole('button', { name: '+ Tạo Task', exact: true }).click();
  await pmTasks.getByLabel('Tiêu đề', { exact: true }).fill(taskName);
  await pmTasks.getByLabel('Mô tả', { exact: true }).fill('Nghiệm thu phân quyền và lưu dữ liệu.');
  await pmTasks.getByLabel('Ngày bắt đầu', { exact: true }).fill('2026-10-10');
  await pmTasks.getByLabel('Deadline', { exact: true }).fill('2026-10-20');
  await pmTasks.getByRole('combobox', { name: 'Người phụ trách', exact: true }).selectOption({ label: `Member QA · ${memberEmail}` });
  await pmTasks.getByRole('button', { name: 'Tạo Task', exact: true }).click();
  await expect(pmTasks.getByRole('heading', { name: taskName, exact: true })).toBeVisible();
  await pm.getByRole('button', { name: 'Đóng Project', exact: true }).click();
  const closeConfirm = pm.getByRole('group', { name: 'Xác nhận thay đổi Project' });
  await closeConfirm.getByRole('button', { name: 'Xác nhận', exact: true }).click();
  await expect(pm.getByRole('alert')).toContainText('Còn Task chưa DONE');
  await closeConfirm.getByRole('button', { name: 'Hủy', exact: true }).click();
  await nav(member, 'Thông báo');
  await member.getByRole('listitem').filter({ hasText: taskName }).getByRole('button', { name: 'Mở công việc', exact: true }).click();
  await expect(member.getByRole('heading', { name: taskName, exact: true })).toBeVisible();
  await expect(member.getByRole('button', { name: 'Lưu thay đổi', exact: true })).toHaveCount(0);
  const comments = member.getByRole('region', { name: 'Bình luận Task', exact: true });
  await comments.getByLabel('Nội dung bình luận', { exact: true }).fill('Nhờ PM kiểm tra <script>alert(1)</script>');
  await comments.getByRole('combobox', { name: 'Nhắc thành viên (@mention)', exact: true }).selectOption({ label: `PM QA · ${pmEmail}` });
  await comments.getByRole('button', { name: 'Gửi bình luận', exact: true }).click();
  await expect(comments.locator('.comment-card')).toContainText('Nhờ PM kiểm tra <script>alert(1)</script>');
  await member.reload();
  await nav(member, 'My Tasks');
  await member.locator('.task-card').filter({ hasText: taskName }).click();
  await expect(comments.locator('.comment-card')).toContainText('Đã nhắc: @PM QA');
  for (const label of ['Đang làm', 'Chờ duyệt', 'Hoàn thành']) {
    await member.getByRole('button', { name: `Chuyển sang ${label}`, exact: true }).click();
    await expect(member.locator('.task-detail dd').filter({ hasText: new RegExp(`^${label}$`) })).toBeVisible();
  }
  await nav(member, 'My Tasks');
  await expect(member.getByRole('heading', { name: 'My Tasks', exact: true })).toBeVisible();
  await member.getByRole('button', { name: new RegExp(taskName) }).click();
  await nav(member, 'My Tasks');
  await expect(member.getByRole('heading', { name: 'My Tasks', exact: true })).toBeVisible();
  await member.reload();
  await expect(member.locator('.sidebar')).toBeVisible();
  await nav(member, 'My Tasks');
  await expect(member.locator('.task-card').filter({ hasText: taskName })).toContainText('Hoàn thành');
  await noOverflow(member);
  await pmTasks.getByRole('button', { name: '← Danh sách', exact: true }).click();
  await pmTasks.getByRole('button', { name: 'Kanban', exact: true }).click();
  await expect(pmTasks.locator('.kanban-column')).toHaveCount(4);
  await expect(pmTasks.locator('.kanban-column').filter({ has: pm.getByRole('heading', { name: /^Hoàn thành/ }) })).toContainText(taskName);
  await noOverflow(pm);
  await pmTasks.getByLabel('Tìm kiếm', { exact: true }).fill('khong-tim-thay');
  await pmTasks.getByRole('button', { name: 'Áp dụng', exact: true }).click();
  await expect(pmTasks).toContainText('Chưa có công việc phù hợp.');
  await pmTasks.getByLabel('Tìm kiếm', { exact: true }).fill('');
  await pmTasks.getByRole('button', { name: 'Áp dụng', exact: true }).click();
  await expect(pmTasks.locator('.task-card')).toHaveCount(1);
  await pm.getByRole('button', { name: 'Đóng Project', exact: true }).click();
  await pm.getByRole('group', { name: 'Xác nhận thay đổi Project' }).getByRole('button', { name: 'Xác nhận', exact: true }).click();
  await expect(pm.locator('.projects-panel')).toContainText('Project đã đóng');
  await expect(pm.getByRole('button', { name: '+ Tạo Task', exact: true })).toHaveCount(0);
  await pm.screenshot({ path: testInfo.outputPath('closed-project.png'), fullPage: true });
  const task = await client.task.findFirstOrThrow({ where: { project: { workspace: { creator: { email: ownerEmail } } }, title: taskName } });
  expect(task.status).toBe('DONE');
  await nav(pm, 'Thông báo');
  await pm.getByRole('listitem').filter({ hasText: 'Bạn được nhắc trong bình luận' }).getByRole('button', { name: 'Mở công việc', exact: true }).click();
  const closedComments = pm.getByRole('region', { name: 'Bình luận Task', exact: true });
  await expect(closedComments.locator('.comment-card')).toContainText('Nhờ PM kiểm tra');
  await expect(closedComments.getByRole('button', { name: 'Gửi bình luận', exact: true })).toHaveCount(0);
  await noOverflow(pm);
  await pm.screenshot({ path: testInfo.outputPath('comments.png'), fullPage: true });
});

test('registration errors, profile persistence, logout and network recovery are visible in the UI', async ({ page }) => {
  await observe(page); await page.goto(baseURL);
  await page.getByRole('button', { name: 'Đăng ký', exact: true }).click();
  const email = `e2e-${randomUUID()}@example.invalid`; emails.push(email);
  await page.getByLabel('Tên hiển thị', { exact: true }).fill('Profile QA');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
  await page.getByLabel('Nhập lại mật khẩu', { exact: true }).fill('a different long passphrase');
  await page.getByRole('button', { name: 'Tạo tài khoản →', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Mật khẩu xác nhận chưa khớp.');
  await page.getByLabel('Nhập lại mật khẩu', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Tạo tài khoản →', exact: true }).click();
  await expect(page.locator('.sidebar')).toBeVisible();
  await nav(page, 'Hồ sơ cá nhân');
  await page.getByLabel('Tên hiển thị', { exact: true }).fill('Profile đã đổi');
  await page.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Đã lưu thay đổi hồ sơ.');
  await page.reload(); await expect(page.locator('.sidebar')).toContainText('Profile đã đổi');
  await page.route('**/api/workspaces', (route) => route.abort());
  await nav(page, 'Workspace');
  await expect(page.getByRole('alert')).toContainText('Không kết nối được máy chủ.');
  await page.unroute('**/api/workspaces');
  await page.getByRole('button', { name: 'Thử lại', exact: true }).click();
  await expect(page.getByText('Bạn chưa tham gia Workspace nào.', { exact: true })).toBeVisible();
  await noOverflow(page);
  await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
  await expect(page.getByText('Bạn đã đăng xuất.', { exact: true })).toBeVisible();
  await page.reload(); await expect(page.getByRole('button', { name: 'Đăng nhập →', exact: true })).toBeVisible();
});

test('expired persisted sessions return to login with a clear message', async ({ page }) => {
  const email = await register(page, 'Session QA');
  await client.session.updateMany({ where: { user: { email } }, data: { expiresAt: new Date(Date.now() - 1000) } });
  await nav(page, 'My Tasks');
  await expect(page.getByText('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Đăng nhập →', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Đăng nhập →', exact: true })).toBeVisible();
});

test('pagination, keyboard navigation, invalid deadlines and deletion work through the browser', async ({ page }) => {
  const email = await register(page, 'Task PM QA');
  const actor = await client.user.findUniqueOrThrow({ where: { email } });
  // Seed a larger list; the operations being accepted below are performed in the UI.
  const workspace = await client.workspace.create({ data: { createdBy: actor.id, name: 'Pagination workspace', members: { create: { userId: actor.id, role: 'OWNER' } } } });
  const project = await client.project.create({ data: { workspaceId: workspace.id, managerUserId: actor.id, name: 'Pagination project', members: { create: { userId: actor.id } } } });
  await client.task.createMany({ data: Array.from({ length: 21 }, (_, index) => ({ projectId: project.id, title: `Task ${String(index + 1).padStart(2, '0')}`, assigneeId: actor.id, status: 'DONE' as const })) });
  await nav(page, 'My Tasks');
  const tasks = page.locator('.tasks-panel');
  await tasks.getByRole('combobox', { name: 'Sắp xếp', exact: true }).selectOption('title');
  await tasks.getByRole('combobox', { name: 'Thứ tự', exact: true }).selectOption('asc');
  await tasks.getByRole('button', { name: 'Áp dụng', exact: true }).click();
  await expect(tasks.locator('.task-card')).toHaveCount(20);
  await tasks.getByRole('button', { name: 'Trang sau →', exact: true }).click();
  await expect(tasks.locator('.task-card')).toHaveCount(1);
  await tasks.getByRole('button', { name: /^Task 21/ }).click();
  await tasks.getByLabel('Ngày bắt đầu', { exact: true }).fill('2026-10-10');
  await tasks.getByLabel('Deadline', { exact: true }).fill('2026-10-09');
  await tasks.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
  expect(await tasks.getByLabel('Deadline', { exact: true }).evaluate((input: HTMLInputElement) => input.validity.rangeUnderflow)).toBe(true);
  expect((await client.task.findFirstOrThrow({ where: { projectId: project.id, title: 'Task 21' } })).dueDate).toBeNull();
  await tasks.getByLabel('Deadline', { exact: true }).fill('2026-10-20');
  await tasks.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
  await expect(tasks.getByRole('status').filter({ hasText: 'Đã lưu công việc.' })).toBeVisible();
  await tasks.getByRole('button', { name: 'Xóa Task', exact: true }).click();
  const confirmation = tasks.getByRole('group', { name: 'Xác nhận thay đổi công việc' });
  await confirmation.getByRole('button', { name: 'Hủy', exact: true }).click();
  expect(await client.task.count({ where: { projectId: project.id } })).toBe(21);
  await tasks.getByRole('button', { name: 'Xóa Task', exact: true }).click();
  await confirmation.getByRole('button', { name: 'Xác nhận', exact: true }).click();
  await expect(tasks).toContainText('Đã xóa công việc.');
  await expect(tasks.locator('.task-card')).toHaveCount(20);
  const navButton = page.locator('.sidebar').getByRole('button', { name: 'Workspace', exact: true });
  await navButton.focus(); await page.keyboard.press('Enter');
  await page.getByRole('button', { name: /Pagination workspace/ }).click();
  await expect(page.getByRole('heading', { name: 'Pagination workspace', exact: true })).toBeVisible();
  await nav(page, 'Workspace');
  await expect(page.getByRole('heading', { name: 'Workspace của bạn', exact: true })).toBeVisible();
  await noOverflow(page);
});
