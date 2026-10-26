import { createRevalidateHandler } from '@/app/revalidation';
import { serverEnv } from '@/shared/dal';

export const POST = createRevalidateHandler(serverEnv.REVALIDATE_SECRET);
