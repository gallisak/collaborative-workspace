import { Suspense } from 'react';
import {
  assignableRoles,
  canChangeRole,
  canManageMembers,
  canRemoveMember,
  ROLE_LABELS,
} from '@/entities/workspace';
import { DeleteWorkspaceButton } from '@/features/delete-workspace';
import { RenameWorkspaceForm } from '@/features/edit-workspace';
import { InviteMemberForm, RevokeInvitationButton } from '@/features/invite-member';
import { MemberRoleSelect, RemoveMemberButton } from '@/features/manage-members';
import { getSessionUser, load } from '@/shared/dal';
import { Badge } from '@/shared/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';
import { Skeleton } from '@/shared/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table';

interface WorkspaceSettingsPageProps {
  params: Promise<{ workspaceId: string }>;
}

const dateFormat = new Intl.DateTimeFormat('en', { dateStyle: 'medium' });

async function Settings({ params }: WorkspaceSettingsPageProps) {
  const { workspaceId } = await params;
  const path = { params: { path: { workspaceId } } };
  const [user, workspace, members] = await Promise.all([
    getSessionUser(),
    load((api) => api.GET('/api/workspaces/{workspaceId}', path)),
    load((api) => api.GET('/api/workspaces/{workspaceId}/members', path)),
  ]);
  const manager = canManageMembers(workspace.role);
  const invitations = manager
    ? await load((api) => api.GET('/api/workspaces/{workspaceId}/invitations', path))
    : [];
  const roles = assignableRoles(workspace.role);
  const seatLimit = workspace.plan.maxMembers;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>General</CardTitle>
          <CardDescription>
            {workspace.plan.name} plan ·{' '}
            {seatLimit === null
              ? `${workspace.memberCount} members`
              : `${workspace.memberCount} of ${seatLimit} seats used`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RenameWorkspaceForm workspaceId={workspaceId} name={workspace.name} editable={manager} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
          <CardDescription>People who can open this workspace.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          {manager && <InviteMemberForm workspaceId={workspaceId} roles={roles} />}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((member) => (
                <TableRow key={member.userId}>
                  <TableCell>
                    <div className="font-medium">
                      {member.name}
                      {member.userId === user.id && (
                        <span className="text-muted-foreground font-normal"> (you)</span>
                      )}
                    </div>
                    <div className="text-muted-foreground text-xs">{member.email}</div>
                  </TableCell>
                  <TableCell>
                    {member.userId !== user.id && canChangeRole(workspace.role, member.role) ? (
                      <MemberRoleSelect
                        workspaceId={workspaceId}
                        userId={member.userId}
                        name={member.name}
                        role={member.role}
                        roles={roles}
                      />
                    ) : (
                      <Badge variant="secondary">{ROLE_LABELS[member.role]}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {(member.userId === user.id
                      ? member.role !== 'OWNER'
                      : canRemoveMember(workspace.role, member.role)) && (
                      <RemoveMemberButton
                        workspaceId={workspaceId}
                        userId={member.userId}
                        name={member.name}
                        self={member.userId === user.id}
                      />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {manager && (
        <Card>
          <CardHeader>
            <CardTitle>Pending invitations</CardTitle>
            <CardDescription>Invitations count towards the seats of the plan.</CardDescription>
          </CardHeader>
          <CardContent>
            {invitations.length === 0 ? (
              <p className="text-muted-foreground text-sm">No pending invitations.</p>
            ) : (
              <Table>
                <TableBody>
                  {invitations.map((invitation) => (
                    <TableRow key={invitation.id}>
                      <TableCell className="font-medium">{invitation.email}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{ROLE_LABELS[invitation.role]}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        Expires {dateFormat.format(new Date(invitation.expiresAt))}
                      </TableCell>
                      <TableCell className="text-right">
                        <RevokeInvitationButton
                          workspaceId={workspaceId}
                          invitationId={invitation.id}
                          email={invitation.email}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {workspace.role === 'OWNER' && (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle>Delete workspace</CardTitle>
            <CardDescription>
              Removes the workspace with all its pages for every member.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DeleteWorkspaceButton workspaceId={workspaceId} name={workspace.name} />
          </CardContent>
        </Card>
      )}
    </>
  );
}

export function WorkspaceSettingsPage(props: WorkspaceSettingsPageProps) {
  return (
    <main className="mx-auto grid w-full max-w-3xl gap-6 px-6 py-14">
      <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
      <Suspense
        fallback={
          <div className="grid gap-6">
            <Skeleton className="h-40" />
            <Skeleton className="h-64" />
          </div>
        }
      >
        <Settings {...props} />
      </Suspense>
    </main>
  );
}
