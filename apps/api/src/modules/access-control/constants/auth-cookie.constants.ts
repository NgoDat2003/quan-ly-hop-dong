// Single source of truth for auth cookie names — imported by JwtStrategy
// (reads), AuthController (sets/clears), and every test that needs to
// attach/assert a cookie. Never hardcode these strings elsewhere.
export const ACCESS_COOKIE_NAME = 'app_access_token';
export const REFRESH_COOKIE_NAME = 'app_refresh_token';

// Real routes have no global prefix (grep confirms no setGlobalPrefix in
// main.ts — '/api' is the Swagger UI mount point, not an API prefix), so
// the refresh cookie must be scoped to '/auth' to actually reach
// POST /auth/refresh. Scoping to '/' would work too but needlessly widens
// the refresh token's exposure to every route.
export const REFRESH_COOKIE_PATH = '/auth';
