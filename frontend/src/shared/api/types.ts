import type { components } from './schema';

type Schemas = components['schemas'];

export type User = Schemas['PublicUser'];
export type WorkspaceDetails = Schemas['WorkspaceDetailsDto'];
export type WorkspaceRole = Schemas['WorkspaceRole'];
export type Invitation = Schemas['InvitationDto'];
export type DocumentNode = Schemas['DocumentNodeDto'];
