import type { components } from './schema';

type Schemas = components['schemas'];

export type User = Schemas['PublicUser'];
export type WorkspaceDetails = Schemas['WorkspaceDetailsDto'];
export type WorkspaceRole = Schemas['WorkspaceRole'];
export type Invitation = Schemas['InvitationDto'];
export type Member = Schemas['MemberDto'];
export type DocumentNode = Schemas['DocumentNodeDto'];
export type Version = Schemas['VersionDto'];
export type Thread = Schemas['ThreadDto'];
export type Comment = Schemas['CommentDto'];
export type Notification = Schemas['NotificationDto'];
export type ShareLink = Schemas['ShareLinkDto'];
export type AccessLevel = Schemas['AccessLevel'];
