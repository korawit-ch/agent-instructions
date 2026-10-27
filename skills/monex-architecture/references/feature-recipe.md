# Adding a resource, end to end

The pattern comes from the template's Link slice, trimmed and corrected. Lines marked
`// [fix]` differ from the template on purpose (see known-template-flaws.md). Steps marked [auth]
apply only when auth is present. Replace `link`/`Link` with the new resource name.

## 1. Schema (detected Prisma location)

```prisma
model Link {
  id          Int      @id @default(autoincrement())
  tenantId    String   @map("tenant_id")          // [auth] tenant-owned rows
  url         String
  title       String
  description String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@unique([tenantId, url])
  @@index([tenantId, createdAt])
  @@map("links")                                   // snake_case table name
}
```

Then `npm run db:validate` and `npm run db:generate`. Run `db:migrate`/`db:push` only after
confirming the target is the local database.

## 2. [auth] Permissions

Add `'link.read' | 'link.create' | 'link.update' | 'link.delete'` to `PERMISSIONS` in
`packages/authorization/src/index.ts`, then add a condition for each one in
`apps/api/src/auth/authorization-policy.ts` (it throws on unmapped permissions), then grant them
to roles in `apps/api/src/auth/auth.permissions.ts`.

## 3. Contract: `packages/api-contract/src/links.ts`

```ts
import type { ApiEndpoint, ApiEndpointWithBody } from './types.js';

/** Wire shape. Dates are ISO strings; never the Prisma model. */
export interface LinkResponse {
  id: number;
  url: string;
  title: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  capabilities: { update: LinkCapability; delete: LinkCapability }; // [auth] only
}

export interface LinkCapability {
  allowed: boolean;
  reason?: string;
}

export interface CreateLinkRequest {
  title: string;
  url: string;
  description?: string;
}

export const linksApi = {
  list: (): ApiEndpoint<LinkResponse[]> => ({ url: '/links', method: 'GET' }),
  detail: (id: number): ApiEndpoint<LinkResponse> => ({ url: `/links/${id}`, method: 'GET' }),
  create: (body: CreateLinkRequest): ApiEndpointWithBody<CreateLinkRequest, LinkResponse> => ({
    url: '/links',
    method: 'POST',
    body,
  }),
};
```

Export it from `src/index.ts` and add the subpath to `package.json` `exports`. Use `.js`
import specifiers (ESM).

## 4. API module: `apps/<api>/src/links/`

DTO (`dto/create-link.dto.ts`) implements the contract and carries runtime validation:

```ts
export class CreateLinkDto implements CreateLinkRequest {
  @ApiProperty({ example: 'https://google.com' })
  @IsUrl({ require_protocol: true })
  @MaxLength(2048)
  url: string;

  @ApiProperty({ example: 'Google' })
  @IsString()
  @MaxLength(200)
  title: string;

  @ApiProperty({ example: 'Search engine', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}
```

Service (`links.service.ts`): every query is scoped; the final mutation is scoped again and its
row count is checked:

```ts
@Injectable()
export class LinksService {
  constructor(private readonly prisma: PrismaService) {}

  private scope(auth: AuthorizationContext, permission: Permission) {   // [auth]
    const scope = resourceScope(auth, permission);
    if (!scope?.tenantId) throw new ForbiddenException(`Missing resource scope: ${permission}`);
    return { tenantId: scope.tenantId };
  }

  async create(auth: AuthorizationContext, data: CreateLinkRequest) {
    try {
      return await this.prisma.client.link.create({
        data: { ...this.scope(auth, 'link.create'), title: data.title, url: data.url, description: data.description },
      });
    } catch (error) {
      // [fix] map unique violations to 409 instead of leaking a 500
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('A link with this URL already exists');
      }
      throw error;
    }
  }

  async update(auth: AuthorizationContext, id: number, data: UpdateLinkRequest) {
    await this.findOneForPermission(auth, id, 'link.update');           // 404 if not visible
    const result = await this.prisma.client.link.updateMany({
      where: { id, ...this.scope(auth, 'link.update') },               // scope the write itself
      data: { title: data.title, url: data.url, description: data.description },
    });
    if (result.count !== 1) throw new ConflictException('The link changed before the operation completed');
    return this.findOneForPermission(auth, id, 'link.update');
  }

  private async findOneForPermission(auth: AuthorizationContext, id: number, permission: Permission) {
    const link = await this.prisma.client.link.findFirst({ where: { id, ...this.scope(auth, permission) } });
    if (!link) throw new NotFoundException(`Link with ID ${id} not found`);
    return link;
  }
}
```

Mapper (`links.mapper.ts`): the only place the DB model becomes the wire shape:

```ts
export function toLinkResponse(link: PrismaLink, auth: AuthorizationContext): LinkResponse {
  const resource = { tenantId: link.tenantId };                            // [auth]
  const mayUpdate = can(auth, 'link.update', resource);
  const mayDelete = can(auth, 'link.delete', resource);
  return {
    id: link.id,
    url: link.url,
    title: link.title,
    description: link.description,
    createdAt: link.createdAt.toISOString(),
    updatedAt: link.updatedAt.toISOString(),
    capabilities: {
      update: mayUpdate ? { allowed: true } : { allowed: false, reason: 'Missing update grant or tenant scope' },
      delete: mayDelete ? { allowed: true } : { allowed: false, reason: 'Missing delete grant or tenant scope' },
    },
  };
}
```

Controller (`links.controller.ts`): thin; permission, auth context, service, mapper:

```ts
@Controller('links')
export class LinksController {
  constructor(private readonly linksService: LinksService) {}

  @Post()
  @RequirePermission('link.create')                                     // [auth]
  async create(@CurrentAuth() auth: AuthorizationContext, @Body() data: CreateLinkDto): Promise<LinkResponse> {
    return toLinkResponse(await this.linksService.create(auth, data), auth);
  }

  @Patch(':id')
  @RequirePermission('link.update')
  async update(
    @CurrentAuth() auth: AuthorizationContext,
    @Param('id', ParseIntPipe) id: number,
    @Body() data: UpdateLinkDto,
  ): Promise<LinkResponse> {
    return toLinkResponse(await this.linksService.update(auth, id, data), auth);
  }
}
```

Module: `@Module({ controllers: [LinksController], providers: [LinksService] })`, registered in
`app.module.ts`. Specs sit next to the source (`*.spec.ts`) and mock `PrismaService` with the
methods the service actually calls (`findFirst`, `updateMany`, `deleteMany`).

## 5. [auth] BFF routes: `apps/<web>/app/api/links/route.ts` and `[id]/route.ts`

```ts
export function GET(request: NextRequest) {
  return proxyProtectedRequest(request, '/links', 'link.read');
}
export function POST(request: NextRequest) {
  return proxyProtectedRequest(request, '/links', 'link.create');
}

// [id]/route.ts: validate the path segment before forwarding
type RouteContext = { params: Promise<{ id: string }> };
async function proxy(request: NextRequest, context: RouteContext, permission: 'link.read' | 'link.update' | 'link.delete') {
  const { id } = await context.params;
  if (!/^\d+$/.test(id)) return Response.json({ message: 'Invalid link ID' }, { status: 400 });
  return proxyProtectedRequest(request, `/links/${id}`, permission);
}
export function PATCH(request: NextRequest, context: RouteContext) {
  return proxy(request, context, 'link.update');
}
```

## 6. Data access: `apps/<web>/data-access/links.server.ts` and `links.client.ts`

```ts
// links.server.ts: for Server Components and Route Handlers
export async function getLinks(): Promise<LinkResponse[]> {
  return serverFetch(linksApi.list(), 'link.read');
}
export async function getLink(id: number): Promise<LinkResponse> {     // [fix] serverFetch throws on 404; no `| null`
  return serverFetch(linksApi.detail(id), 'link.read');
}
```

```ts
// links.client.ts
'use client';

export const linkKeys = {
  all: ['links'] as const,
  detail: (id: number) => ['links', id] as const,
};

export function useLinksQuery(enabled = true) {
  return useQuery<LinkResponse[]>({
    queryKey: linkKeys.all,
    queryFn: () => clientFetch(linksApi.list()),                        // [fix] no artificial delay
    enabled,
  });
}

export function useLinkQuery(id: number) {
  return useQuery<LinkResponse>({
    queryKey: linkKeys.detail(id),
    queryFn: () => clientFetch(linksApi.detail(id)),
    enabled: id > 0,                                                    // [fix] explicit boolean, not `!!id`
  });
}

export function useUpdateLinkMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateLinkRequest }) => clientFetch(linksApi.update(id, data)),
    onSuccess: (_, { id }) => {
      void queryClient.invalidateQueries({ queryKey: linkKeys.all });
      void queryClient.invalidateQueries({ queryKey: linkKeys.detail(id) });
    },
  });
}
```

## 7. UI

- Route: `app/(protected)/<route>/page.tsx` ([auth]; `app/<route>/page.tsx` without auth). Server
  Component by default; fetch with the server data-access function.
- Route-only components go in `_components/`. Add `'use client'` only where hooks or events need it.
- [auth] Gate UX with `useAuth().hasPermission('link.read')`; drive per-row actions from
  `link.capabilities`. These are UX only; the API enforces access.
- Use `@repo/ui/<component>` deep imports and design-system tokens; no `components/common`.

## 8. Duplicated apps

Repeat steps 4–7 in every duplicated app that needs the feature. The contract (step 3) is shared.

## 9. Verify

`npx turbo run build --filter='./packages/*'` first (apps consume built packages), then
typecheck, lint, and test for the touched workspaces.
