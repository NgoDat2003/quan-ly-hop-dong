export const ROLE_PERMISSIONS: Record<string, string[]> = {
  ADMIN: ['*'],
  TRAINER: [],
  TRAINEE: [],
};

export function hasPermission(role: string, required: string[]): boolean {
  if (required.length === 0) return true;
  const granted = ROLE_PERMISSIONS[role] ?? [];
  if (granted.includes('*')) return true;
  return required.every((perm) => granted.includes(perm));
}
