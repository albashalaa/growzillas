import { SetMetadata } from '@nestjs/common';

/**
 * Skip tenancy check for this route.
 * 
 * Use this decorator on routes that don't require org context:
 * - Public endpoints
 * - Auth endpoints (register, login)
 * - Health checks
 * 
 * @example
 * ```typescript
 * @Get('public')
 * @SkipTenancy()
 * async getPublicData() {
 *   return { message: 'Public data' };
 * }
 * ```
 */
export const SkipTenancy = () => SetMetadata('skipTenancy', true);
