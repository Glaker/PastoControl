import { useMyProfile } from '../profile/queries';
import type { Mode } from './modes';

export type Roles = { isClient: boolean; isCutter: boolean };

/** Roles del usuario logueado, según las marcas is_client / is_cutter de su perfil. */
export function useRoles(): Roles {
  const { data } = useMyProfile();
  return { isClient: !!data?.is_client, isCutter: !!data?.is_cutter };
}

export function availableModes(roles: Roles): Mode[] {
  const modes: Mode[] = [];
  if (roles.isClient) modes.push('pedir');
  if (roles.isCutter) modes.push('cortar');
  return modes;
}
