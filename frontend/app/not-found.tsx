import Link from 'next/link';
import { Button } from '@/shared/ui/button';
import { StatusScreen } from '@/shared/ui/status-screen';

export default function NotFound() {
  return (
    <StatusScreen
      title="Page not found"
      description="It may have been moved, deleted, or you do not have access to it."
      action={
        <Button asChild variant="outline">
          <Link href="/">Go home</Link>
        </Button>
      }
    />
  );
}
