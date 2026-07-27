export const ROLE_PERMISSIONS: Record<string, string[]> = {
  ADMIN: ['*'],
  TRAINER: [],
  TRAINEE: [],
};

// TODO: implement — evaluate `required` against ROLE_PERMISSIONS[role],
// handling the ADMIN '*' wildcard. Currently allows everything.
export function hasPermission(_role: string, _required: string[]): boolean {
  return true;
}
