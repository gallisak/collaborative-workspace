'use client';

import { LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { api } from '@/shared/api';
import { routes } from '@/shared/config';
import { DropdownMenuItem } from '@/shared/ui/dropdown-menu';

export function LogoutMenuItem() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const logout = () =>
    startTransition(async () => {
      await api.POST('/api/auth/logout');
      router.replace(routes.login);
      router.refresh();
    });

  return (
    <DropdownMenuItem disabled={pending} onSelect={logout}>
      <LogOut />
      Sign out
    </DropdownMenuItem>
  );
}
