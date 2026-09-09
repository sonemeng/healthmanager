import { z } from 'zod';
import {
  ALLOWED_MIME_TYPES,
  DEFAULT_PAGE_SIZE,
  MAX_FILE_SIZE,
  MAX_PAGE_SIZE,
} from './constants';

export const dateRangeSchema = z.object({
  start: z.coerce.date().optional(),
  end: z.coerce.date().optional(),
}).refine(
  (data) => {
    if (data.start && data.end) {
      return data.start <= data.end;
    }
    return true;
  },
  { message: 'start date must be before or equal to end date' },
);

export const paginationSchema = z.object({
  limit: z
    .number()
    .int()
    .min(1)
    .max(MAX_PAGE_SIZE)
    .default(DEFAULT_PAGE_SIZE),
  cursor: z.string().optional(),
});

export const fileUploadSchema = z.object({
  mimeType: z.enum(ALLOWED_MIME_TYPES, {
    error: `File type must be one of: ${ALLOWED_MIME_TYPES.join(', ')}`,
  }),
  size: z
    .number()
    .int()
    .positive()
    .max(MAX_FILE_SIZE, {
      message: `File size must not exceed ${MAX_FILE_SIZE / (1024 * 1024)} MB`,
    }),
});

export const uuidSchema = z.string().uuid();
