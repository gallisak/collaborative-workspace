import { toast } from 'sonner';
import { ApiError } from '../api/errors';

export function notifyError(error: unknown, fallback = 'Something went wrong, please try again') {
  const message = error instanceof ApiError ? error.message : fallback;
  const reference = error instanceof ApiError ? error.correlationId : undefined;
  toast.error(message, reference ? { description: `Reference: ${reference}` } : undefined);
}
