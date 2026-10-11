import { z } from 'zod';
export const calendarQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).refine((value) => z.iso.date().safeParse(`${value}-01`).success, 'Tháng không hợp lệ.'),
  day: z.iso.date().optional(),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  sprintPage: z.coerce.number().int().min(1).max(100000).default(1),
}).strict().refine((data) => !data.day || data.day.slice(0, 7) === data.month, 'Ngày phải thuộc tháng đang xem.');
export type CalendarQuery = z.infer<typeof calendarQuerySchema>;
