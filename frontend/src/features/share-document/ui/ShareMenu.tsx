'use client';

import { Copy, Globe, Link2Off } from 'lucide-react';
import { useActionState, useTransition } from 'react';
import { toast } from 'sonner';
import { initialFormState, type ShareLink } from '@/shared/api';
import { routes } from '@/shared/config';
import { relativeTime } from '@/shared/lib';
import { Alert, AlertDescription } from '@/shared/ui/alert';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/shared/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { createShareLink, revokeShareLink } from '../api/share-links';
import { ACCESS_LABELS, ACCESS_LEVELS, EXPIRY_OPTIONS } from '../model/share-options';

interface ShareMenuProps {
  documentId: string;
  links: readonly ShareLink[];
}

function CreateLinkForm({ documentId }: { documentId: string }) {
  const [state, action, pending] = useActionState(
    createShareLink.bind(null, documentId),
    initialFormState,
  );
  return (
    <form action={action} className="grid gap-2" noValidate>
      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <div className="grid grid-cols-2 gap-2">
        <div className="grid gap-1.5">
          <Label htmlFor="share-access">Access</Label>
          <Select name="accessLevel" defaultValue="VIEW">
            <SelectTrigger id="share-access" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ACCESS_LEVELS.map((level) => (
                <SelectItem key={level} value={level}>
                  {ACCESS_LABELS[level]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="share-expiry">Expiry</Label>
          <Select name="expiry" defaultValue="never">
            <SelectTrigger id="share-expiry" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EXPIRY_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? 'Creating…' : 'Create link'}
      </Button>
    </form>
  );
}

function ShareLinkRow({ link }: { link: ShareLink }) {
  const [pending, startTransition] = useTransition();
  const url = new URL(routes.publicPage(link.token), window.location.origin).href;
  const label = `${ACCESS_LABELS[link.accessLevel]} link`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copied');
    } catch {
      toast.error('Could not copy the link');
    }
  };

  const revoke = () =>
    startTransition(async () => {
      const result = await revokeShareLink(link.id);
      if (result.error) {
        toast.error(result.error);
      }
    });

  return (
    <li className="grid gap-1.5 rounded-md border p-2" aria-label={label}>
      <div className="flex items-center justify-between gap-2 text-xs">
        <Badge variant={link.accessLevel === 'EDIT' ? 'default' : 'secondary'}>
          {ACCESS_LABELS[link.accessLevel]}
        </Badge>
        <span className="text-muted-foreground">
          {link.expiresAt ? `Expires ${relativeTime(link.expiresAt)}` : 'No expiry'}
        </span>
      </div>
      <div className="flex gap-1">
        <Input
          readOnly
          value={url}
          aria-label={`${label} URL`}
          className="h-8 text-xs"
          onFocus={(event) => event.currentTarget.select()}
        />
        <Button size="icon-sm" variant="ghost" aria-label={`Copy ${label}`} onClick={copy}>
          <Copy />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={`Revoke ${label}`}
          disabled={pending}
          onClick={revoke}
        >
          <Link2Off />
        </Button>
      </div>
    </li>
  );
}

export function ShareMenu({ documentId, links }: ShareMenuProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm">
          <Globe />
          Share{links.length > 0 ? ` (${links.length})` : ''}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96">
        <PopoverHeader>
          <PopoverTitle>Publish to the web</PopoverTitle>
          <PopoverDescription>
            Anyone with a link can read the page. Signed in people can edit through a “Can edit”
            link.
          </PopoverDescription>
        </PopoverHeader>
        {links.length > 0 ? (
          <ul className="grid gap-2" aria-label="Share links">
            {links.map((link) => (
              <ShareLinkRow key={link.id} link={link} />
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">The page is not published yet.</p>
        )}
        <CreateLinkForm documentId={documentId} />
      </PopoverContent>
    </Popover>
  );
}
