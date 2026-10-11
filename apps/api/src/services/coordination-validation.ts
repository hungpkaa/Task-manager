import { z } from 'zod';

const dates = { periodStart: z.iso.date(), periodEnd: z.iso.date() };
export const riskQuerySchema = z.object(dates).strict().refine((data) => data.periodEnd >= data.periodStart, { path: ['periodEnd'], message: 'Kỳ kết thúc không được trước kỳ bắt đầu.' });
export const workloadQuerySchema = z.object({ ...dates, page: z.coerce.number().int().min(1).max(100000).default(1) }).strict()
  .refine((data) => data.periodEnd >= data.periodStart, { path: ['periodEnd'], message: 'Kỳ kết thúc không được trước kỳ bắt đầu.' });
export const capacitySchema = z.object({ ...dates, userId: z.uuid(), capacityPoints: z.number().int().min(1).max(1000000), expectedUpdatedAt: z.iso.datetime().nullable() }).strict()
  .refine((data) => data.periodEnd >= data.periodStart, { path: ['periodEnd'], message: 'Kỳ kết thúc không được trước kỳ bắt đầu.' });
export const capacityQuerySchema = z.object({ page: z.coerce.number().int().min(1).max(100000).default(1) }).strict();
export type CapacityInput = z.infer<typeof capacitySchema>;
export type WorkloadQuery = z.infer<typeof workloadQuerySchema>;
