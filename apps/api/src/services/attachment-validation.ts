import { HttpError } from '../domain/errors.js';
export const maxAttachmentBytes = 10 * 1024 * 1024;
export const attachmentExtensions = ['pdf', 'png', 'jpg', 'jpeg', 'txt', 'csv', 'md', 'zip', 'docx', 'xlsx', 'pptx'];
export function attachmentFilename(encoded: unknown) {
  let filename: string;
  try { if (typeof encoded !== 'string') throw new Error(); filename = decodeURIComponent(encoded).trim().normalize('NFC'); }
  catch { throw new HttpError(400, 'Tên tệp không hợp lệ.'); }
  if (!filename || filename.length > 255 || /[\\/\x00-\x1f\x7f]/u.test(filename) || filename.startsWith('.') || !attachmentExtensions.includes(filename.split('.').pop()!.toLowerCase())) {
    throw new HttpError(400, 'Tên tệp không hợp lệ hoặc loại tệp chưa hỗ trợ.');
  }
  return filename;
}
export function attachmentBytes(input: unknown): Buffer {
  if (!Buffer.isBuffer(input) || !input.length) throw new HttpError(400, 'Chọn tệp có nội dung.');
  if (input.length > maxAttachmentBytes) throw new HttpError(413, 'Tệp tối đa 10 MB.');
  return input;
}
