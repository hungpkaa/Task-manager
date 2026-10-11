import { z } from 'zod';
const listing = { q: z.string().trim().max(100).default(''), page: z.coerce.number().int().min(1).max(100000).default(1) };
export const adminUsersQuery = z.object({ ...listing, status: z.enum(['ACTIVE', 'LOCKED']).optional() }).strict();
export const adminWorkspacesQuery = z.object(listing).strict();
export const adminStatusInput = z.object({ status: z.enum(['ACTIVE', 'LOCKED']), expectedStatus: z.enum(['ACTIVE', 'LOCKED']), expectedUpdatedAt: z.iso.datetime() }).strict();
export type AdminUsersQuery = z.infer<typeof adminUsersQuery>;
export type AdminWorkspacesQuery = z.infer<typeof adminWorkspacesQuery>;
export type AdminStatusInput = z.infer<typeof adminStatusInput>;
