import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { z } from 'zod'
import { randomHex, safeEqual } from '../lib/crypto'
import { AppError } from '../lib/errors'
import type { AppContext } from '../services/context'
import type { Actor } from '../services/audit'
import { extractFields } from '../nlp/engine'
import { interpretQuery } from '../nlp/query'
import type { ProfileInput } from '../../shared/types'

const TOKEN_KEY = 'mcp.token'

export interface McpStatus {
  enabled: boolean
  running: boolean
  port: number
  hasToken: boolean
}

export class McpLayer {
  private server: ReturnType<typeof createServer> | null = null
  private port: number = 7421

  constructor(private readonly ctx: AppContext) {}

  status(): McpStatus {
    const s = this.ctx.settings?.get()
    return {
      enabled: this.ctx.settings ? s!.mcpEnabled : false,
      running: !!(this.server && this.server.listening),
      port: this.port,
      hasToken: !!this.ctx.settings?.getRaw(TOKEN_KEY),
    }
  }

  token(): string | null {
    return this.ctx.settings?.getRaw(TOKEN_KEY) ?? null
  }

  ensureToken(): string {
    let t = this.token()
    if (!t) {
      t = randomHex(24)
      this.ctx.settings?.setRaw(TOKEN_KEY, t, 'mcp')
    }
    return t
  }

  regenerateToken(): string {
    const t = randomHex(24)
    this.ctx.settings?.setRaw(TOKEN_KEY, t, 'mcp')
    this.restart()
    return t
  }

  async start(): Promise<void> {
    if (this.server?.listening) return
    const s = this.ctx.settings?.get()
    if (!s?.mcpEnabled) return
    this.port = s.mcpPort
    const token = this.ensureToken()

    this.server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      try {
        if ((req.method ?? 'GET') === 'GET') {
          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, Mcp-Session-Id',
          })
          res.end(JSON.stringify({ ok: true, protocol: 'mcp', endpoint: '/mcp', auth: 'Bearer token' }))
          return
        }
        if (req.method === 'OPTIONS') {
          res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, Mcp-Session-Id',
            'Access-Control-Max-Age': '86400',
          })
          res.end()
          return
        }
        if ((req.url ?? '').split('?')[0] !== '/mcp') {
          res.writeHead(404, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: { code: -32001, message: 'Not found' } }))
          return
        }
        const authHeader = req.headers['authorization'] ?? ''
        const presented = authHeader.replace(/^Bearer\s+/i, '')
        const apikeyPrincipal = this.ctx.apikeys ? this.ctx.apikeys.verify(presented) : null
        if (!presented || (!safeEqual(presented, token) && !apikeyPrincipal)) {
          res.writeHead(401, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32001, message: 'Unauthorized' } }))
          return
        }
        const apiKeyPrincipal: { userId: string; username: string } | null = apikeyPrincipal
        const chunks: Buffer[] = []
        for await (const chunk of req) chunks.push(chunk as Buffer)
        const body = Buffer.concat(chunks).toString('utf8')
        const server = this.buildServer(apiKeyPrincipal)
        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Mcp-Session-Id')
        res.on('close', () => {
          void transport.close().catch(() => undefined)
        })
        await server.connect(transport)
        const parsed = body ? JSON.parse(body) : { jsonrpc: '2.0', id: null, method: 'ping' }
        await transport.handleRequest(req, res, parsed)
      } catch (e) {
        if (!(res as ServerResponse & { headersSent?: boolean }).headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32603, message: e instanceof Error ? e.message : 'Internal error' } }))
        }
      }
    })

    await new Promise<void>((resolve, reject) => {
      this.server!.once('error', reject)
      this.server!.listen(this.port, '127.0.0.1', () => {
        this.server!.removeListener('error', reject)
        resolve()
      })
    })
  }

  stop(): void {
    if (!this.server) return
    const s = this.server as typeof this.server & { closeSockets?: (destroy: boolean) => void }
    try {
      s.close(() => undefined)
    } catch {
      /* ignore */
    }
    this.server = null
  }

  restart(): void {
    if (!this.server) return
    const enabled = this.ctx.settings?.get().mcpEnabled
    this.stop()
    if (enabled) void this.start()
  }

  /**
   * Writes a small connection descriptor next to the main window data so
   * agents can discover the endpoint without the user opening Settings.
   */
  connectionInfo(): { url: string; header: string; token: string; port: number } | null {
    if (!this.ctx.settings?.get().mcpEnabled) return null
    const token = this.token()
    if (!token) return null
    return {
      url: `http://127.0.0.1:${this.port}/mcp`,
      header: `Authorization: Bearer ${token}`,
      token,
      port: this.port,
    }
  }

  private actorWithGate(minRole: 'readonly' | 'standard' | 'admin' = 'readonly', principal?: { userId: string; username: string } | null): Actor {
    const auth = this.ctx.auth
    if (!this.ctx.vault || !auth) throw new AppError('UNAVAILABLE', 'Vault is not open.')
    if (principal) {
      const userRow = auth.getUser(principal.userId)
      if (!userRow || userRow.status !== 'active') throw new AppError('FORBIDDEN', 'API key owner is suspended.')
      const rank: Record<string, number> = { readonly: 1, standard: 2, admin: 3 }
      if (rank[userRow.role] < rank[minRole]) throw new AppError('FORBIDDEN', `Requires ${minRole} privileges.`)
      return { id: principal.userId, username: principal.username, sessionRef: null, deviceName: 'mcp-api-key' }
    }
    auth.requireUnlocked()
    const user = auth.requireUser()
    const rank: Record<string, number> = { readonly: 1, standard: 2, admin: 3 }
    if (rank[user.role] < rank[minRole]) throw new AppError('FORBIDDEN', `Requires ${minRole} privileges.`)
    return auth.actor()
  }

  private text(result: unknown): { content: { type: 'text'; text: string }[] } {
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
  }

  private err(e: unknown) {
    return {
      isError: true as const,
      content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: { code: e instanceof AppError ? e.code : 'INTERNAL', message: e instanceof Error ? e.message : String(e) } }, null, 2) }],
    }
  }

  buildServer(principal?: { userId: string; username: string } | null): McpServer {
    const ctx = this.ctx
    const server = new McpServer({ name: 'zeus-vault', version: '1.0.0' })
    const profiles = ctx.profiles!

    server.registerTool('dashboard_overview', {
      description: 'Live vault statistics: totals, active/archived counts, countries, categories, recent records and activity.',
      inputSchema: {},
    }, async () => {
      try { this.actorWithGate('readonly', principal); return this.text(ctx.dashboard!.overview(ctx.auth!.requireUser().id)) } catch (e) { return this.err(e) }
    })

    server.registerTool('profiles_list', {
      description: 'List profiles. Optional search text, country, category, creator, gender, date filters, sort and pagination.',
      inputSchema: {
        search: z.string().optional(),
        view: z.enum(['active', 'archived', 'favorites', 'all-status']).optional(),
        country: z.string().optional(),
        categoryId: z.string().optional(),
        createdBy: z.string().optional(),
        gender: z.string().optional(),
        createdFrom: z.string().optional(),
        createdTo: z.string().optional(),
        updatedFrom: z.string().optional(),
        updatedTo: z.string().optional(),
        sortKey: z.enum(['fullName', 'profileCode', 'username', 'country', 'city', 'category', 'createdAt', 'updatedAt', 'viewCount']).optional(),
        sortDir: z.enum(['asc', 'desc']).optional(),
        page: z.number().int().min(1).optional(),
        pageSize: z.number().int().min(1).max(250).optional(),
      },
    }, async (args) => {
      try {
        const actor = this.actorWithGate('readonly', principal)
        const { sortKey, sortDir, ...rest } = args
        const result = profiles.list({ ...rest, sort: sortKey ? { key: sortKey, dir: sortDir ?? 'desc' } : undefined }, actor.id ?? '')
        return this.text(result)
      } catch (e) { return this.err(e) }
    })

    server.registerTool('profiles_get', {
      description: 'Get one profile dossier. Set includeSensitive=true only when necessary to read account passwords.',
      inputSchema: {
        idOrCode: z.string(),
        includeSensitive: z.boolean().optional(),
      },
    }, async (args) => {
      try {
        const actor = this.actorWithGate('readonly', principal)
        const id = this.resolveId(profiles, args.idOrCode)
        const detail = profiles.get(id, actor, { trackView: false })
        if (!args.includeSensitive) {
          detail.account.password = detail.account.hasPassword ? '********' : ''
          detail.account.recoveryInfo = ''
        }
        return this.text(detail)
      } catch (e) { return this.err(e) }
    })

    server.registerTool('profiles_search', {
      description: 'Natural language search across the archive, for example "people from Bangladesh who work in technology". Returns interpreted clauses plus matches.',
      inputSchema: {
        query: z.string(),
        page: z.number().int().min(1).optional(),
        pageSize: z.number().int().min(1).max(250).optional(),
      },
    }, async (args) => {
      try {
        const actor = this.actorWithGate('readonly', principal)
        const interpretation = interpretQuery(args.query, { currentUsername: actor.username })
        const filters = { ...interpretation.filters }
        if (interpretation.freeText) filters.search = interpretation.freeText
        const result = profiles.list({ ...filters, view: filters.view ?? 'all-status', page: args.page ?? 1, pageSize: args.pageSize ?? 50 }, actor.id ?? '')
        return this.text({ interpretation, total: result.total, rows: result.rows })
      } catch (e) { return this.err(e) }
    })

    server.registerTool('profiles_create', {
      description: 'Create a new profile. Field names are fullName (one complete field), username, dob, gender, country, countryIso2, city, state, primaryEmail, primaryPhone, website, categoryId, tags, notes.',
      inputSchema: {
        fullName: z.string(),
        username: z.string().optional(),
        dob: z.string().optional(),
        gender: z.string().optional(),
        nationality: z.string().optional(),
        country: z.string().optional(),
        countryIso2: z.string().optional(),
        state: z.string().optional(),
        city: z.string().optional(),
        preferredLanguage: z.string().optional(),
        timezone: z.string().optional(),
        profileStatus: z.string().optional(),
        categoryId: z.string().nullable().optional(),
        tags: z.array(z.string()).optional(),
        notes: z.string().optional(),
        primaryEmail: z.string().optional(),
        primaryPhone: z.string().optional(),
        phoneCountryCode: z.string().optional(),
        website: z.string().optional(),
        occupation: z.string().optional(),
        company: z.string().optional(),
        industry: z.string().optional(),
        contactPerson: z.string().optional(),
      },
    }, async (args) => {
      try {
        const actor = this.actorWithGate('standard', principal)
        const input = this.composeInput(args)
        const detail = profiles.create(input, actor)
        return this.text({ id: detail.id, profileCode: detail.profileCode })
      } catch (e) { return this.err(e) }
    })

    server.registerTool('profiles_update', {
      description: 'Update one profile. Only supplied fields are changed; pass empty strings to clear fields.',
      inputSchema: {
        idOrCode: z.string(),
        fullName: z.string().optional(),
        username: z.string().optional(),
        dob: z.string().optional(),
        gender: z.string().optional(),
        country: z.string().optional(),
        countryIso2: z.string().optional(),
        state: z.string().optional(),
        city: z.string().optional(),
        primaryEmail: z.string().optional(),
        primaryPhone: z.string().optional(),
        website: z.string().optional(),
        occupation: z.string().optional(),
        company: z.string().optional(),
        industry: z.string().optional(),
        notes: z.string().optional(),
        tags: z.array(z.string()).optional(),
        password: z.string().optional(),
        clearPassword: z.boolean().optional(),
      },
    }, async (args) => {
      try {
        const actor = this.actorWithGate('standard', principal)
        const id = this.resolveId(profiles, args.idOrCode)
        const detail = profiles.get(id, actor, { trackView: false })
        const input = this.composeInput(args, detail)
        const result = profiles.update(id, input, actor)
        return this.text({ id, changes: result.changes })
      } catch (e) { return this.err(e) }
    })

    server.registerTool('profiles_lifecycle', {
      description: 'Archive, restore, or soft-delete a profile. action is one of archive, restore, delete.',
      inputSchema: {
        idOrCode: z.string(),
        action: z.enum(['archive', 'restore', 'delete']),
      },
    }, async (args) => {
      try {
        const actor = this.actorWithGate('standard', principal)
        const id = this.resolveId(profiles, args.idOrCode)
        profiles.setStatus(id, args.action, actor)
        return this.text({ ok: true, action: args.action, id })
      } catch (e) { return this.err(e) }
    })

    server.registerTool('profiles_duplicate', {
      description: 'Duplicate a profile (username collision-avoided) and return the new identifier.',
      inputSchema: { idOrCode: z.string() },
    }, async (args) => {
      try {
        const actor = this.actorWithGate('standard', principal)
        const id = this.resolveId(profiles, args.idOrCode)
        const copy = profiles.duplicate(id, actor)
        return this.text({ id: copy.id, profileCode: copy.profileCode })
      } catch (e) { return this.err(e) }
    })

    server.registerTool('profiles_favorite', {
      description: 'Toggle whether a profile is in the current user favorites.',
      inputSchema: { idOrCode: z.string() },
    }, async (args) => {
      try {
        const actor = this.actorWithGate('readonly', principal)
        const id = this.resolveId(profiles, args.idOrCode)
        return this.text(profiles.toggleFavorite(id, actor))
      } catch (e) { return this.err(e) }
    })

    server.registerTool('profiles_field_history', {
      description: 'Field-level change history for one profile.',
      inputSchema: { idOrCode: z.string() },
    }, async (args) => {
      try {
        const actor = this.actorWithGate('readonly', principal)
        const id = this.resolveId(profiles, args.idOrCode)
        return this.text({ id, history: profiles.fieldHistory(id) })
      } catch (e) { return this.err(e) }
    })

    server.registerTool('profiles_audit', {
      description: 'Audit trail entries that target one profile.',
      inputSchema: { idOrCode: z.string() },
    }, async (args) => {
      try {
        const actor = this.actorWithGate('readonly', principal)
        const id = this.resolveId(profiles, args.idOrCode)
        return this.text({ id, audit: profiles.profileAudit(id) })
      } catch (e) { return this.err(e) }
    })

    server.registerTool('nlp_extract', {
      description: 'Deterministic, offline extraction of profile fields from free text. Returns fields with semantic category and confidence.',
      inputSchema: { text: z.string() },
    }, async (args) => {
      try {
        this.actorWithGate('readonly', principal)
        return this.text(extractFields(args.text.slice(0, 4000)))
      } catch (e) { return this.err(e) }
    })

    server.registerTool('categories_list', {
      description: 'List profile categories with profile counts.',
      inputSchema: {},
    }, async () => {
      try { this.actorWithGate('readonly', principal); return this.text(ctx.categories!.list()) } catch (e) { return this.err(e) }
    })

    server.registerTool('b2b_list', {
      description: 'List B2B contacts. Filters for search text, industry, status (Lead, Active, Dormant), country, favorites, pagination.',
      inputSchema: {
        search: z.string().optional(),
        industry: z.string().optional(),
        status: z.enum(['Lead', 'Active', 'Dormant']).optional(),
        country: z.string().optional(),
        favoritesOnly: z.boolean().optional(),
        page: z.number().int().min(1).optional(),
        pageSize: z.number().int().min(1).max(250).optional(),
      },
    }, async (args) => {
      try {
        const actor = this.actorWithGate('readonly', principal)
        return this.text(ctx.b2b!.list(args, actor.id ?? ''))
      } catch (e) { return this.err(e) }
    })

    server.registerTool('b2b_create', {
      description: 'Create a B2B contact: companyName is required; industry, website, workType (type of work they need), contactPerson, contactRole, phone, email, address, and status are optional.',
      inputSchema: {
        companyName: z.string(),
        industry: z.string().optional(),
        website: z.string().optional(),
        workType: z.string().optional(),
        contactPerson: z.string().optional(),
        contactRole: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().optional(),
        street: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        postalCode: z.string().optional(),
        country: z.string().optional(),
        countryIso2: z.string().optional(),
        status: z.enum(['Lead', 'Active', 'Dormant']).optional(),
        notes: z.string().optional(),
        tags: z.array(z.string()).optional(),
      },
    }, async (args) => {
      try {
        const actor = this.actorWithGate('standard', principal)
        const created = ctx.b2b!.create({ ...args, tags: args.tags ?? [] } as never, actor)
        return this.text(created)
      } catch (e) { return this.err(e) }
    })

    server.registerTool('b2b_update', {
      description: 'Update a B2B contact. Only supplied fields change.',
      inputSchema: {
        id: z.string(),
        companyName: z.string().optional(),
        industry: z.string().optional(),
        website: z.string().optional(),
        workType: z.string().optional(),
        contactPerson: z.string().optional(),
        contactRole: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().optional(),
        street: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        postalCode: z.string().optional(),
        country: z.string().optional(),
        countryIso2: z.string().optional(),
        status: z.enum(['Lead', 'Active', 'Dormant']).optional(),
        notes: z.string().optional(),
        tags: z.array(z.string()).optional(),
      },
    }, async (args) => {
      try {
        const actor = this.actorWithGate('standard', principal)
        const existing = ctx.b2b!.get(args.id)
        const { id, ...patch } = args
        const updated = ctx.b2b!.update(id, { ...existing, ...patch, tags: patch.tags ?? existing.tags } as never, actor)
        return this.text(updated)
      } catch (e) { return this.err(e) }
    })

    server.registerTool('b2b_delete', {
      description: 'Soft-delete a B2B contact.',
      inputSchema: { id: z.string() },
    }, async (args) => {
      try {
        const actor = this.actorWithGate('standard', principal)
        ctx.b2b!.remove(args.id, actor)
        return this.text({ ok: true, id: args.id })
      } catch (e) { return this.err(e) }
    })

    server.registerTool('audit_list', {
      description: 'List audit log entries with category and text filters plus pagination. Non-admin users see only their own activity.',
      inputSchema: {
        category: z.enum(['PROFILE', 'IDENTITY', 'SYSTEM']).optional(),
        search: z.string().optional(),
        eventType: z.string().optional(),
        page: z.number().int().min(1).optional(),
      },
    }, async (args) => {
      try {
        const actor = this.actorWithGate('readonly', principal)
        const principalRole = this.roleOf(actor)
        const query = {
          category: args.category,
          search: args.search,
          eventType: args.eventType,
          actorId: principalRole === 'admin' ? undefined : actor.id ?? undefined,
          page: args.page ?? 1,
          pageSize: 50,
        }
        return this.text(ctx.audit!.list(query))
      } catch (e) { return this.err(e) }
    })

    server.registerTool('users_list', {
      description: 'Administrator only: list user accounts with roles and session state.',
      inputSchema: {},
    }, async () => {
      try {
        const actor = this.actorWithGate('admin', principal)
        void actor
        return this.text(ctx.users!.list())
      } catch (e) { return this.err(e) }
    })

    server.registerTool('security_integrity', {
      description: 'Run a database integrity check (quick_check, FK, decrypt spot-check) and return the report.',
      inputSchema: {},
    }, async () => {
      try { this.actorWithGate('readonly', principal); return this.text(ctx.security!.integrityCheck()) } catch (e) { return this.err(e) }
    })

    server.registerTool('export_profiles', {
      description: 'Export profiles to a file. format is csv, json, xlsx, or pdf summary. includeSensitive adds the decrypted account password column and requires the standard role or higher.',
      inputSchema: {
        format: z.enum(['csv', 'json', 'xlsx', 'pdf']).optional(),
        includeSensitive: z.boolean().optional(),
        search: z.string().optional(),
        view: z.enum(['active', 'archived', 'favorites', 'all-status']).optional(),
      },
    }, async (args) => {
      try {
        const actor = this.actorWithGate('readonly', principal)
        const categories = new Map(ctx.categories!.list().map((c) => [c.id, c.name]))
        const filters = { search: args.search, view: args.view ?? 'all-status' }
        const result = await ctx.transfer!.exportProfiles(
          { filters, format: args.format ?? 'csv', includeSensitive: !!args.includeSensitive, categoryNames: categories },
          actor,
        )
        return this.text(result)
      } catch (e) { return this.err(e) }
    })

    return server
  }

  private composeInput(args: Record<string, unknown>, existing?: import('../../shared/types').ProfileDetail): ProfileInput {
    const get = <T,>(v: unknown, fallback: T): T => (v === undefined ? fallback : (v as T))
    const prev = existing
    const basic = {
      fullName: get(args.fullName as string, prev?.basic.fullName ?? ''),
      username: get(args.username as string, prev?.basic.username ?? ''),
      dob: get(args.dob as string, prev?.basic.dob ?? ''),
      gender: get(args.gender as string, prev?.basic.gender ?? ''),
      nationality: get(args.nationality as string, prev?.basic.nationality ?? ''),
      country: get(args.country as string, prev?.basic.country ?? ''),
      countryIso2: get(args.countryIso2 as string, prev?.basic.countryIso2 ?? ''),
      state: get(args.state as string, prev?.basic.state ?? ''),
      city: get(args.city as string, prev?.basic.city ?? ''),
      preferredLanguage: get(args.preferredLanguage as string, prev?.basic.preferredLanguage ?? ''),
      timezone: get(args.timezone as string, prev?.basic.timezone ?? 'UTC'),
      profileStatus: get(args.profileStatus as string, prev?.basic.profileStatus ?? 'Active'),
      categoryId: get(args.categoryId as string | null | undefined, (prev?.basic.categoryId as string) || null) ?? null,
      tags: get(args.tags as string[] | undefined, prev?.tags.map((t) => t.name) ?? []) ?? [],
      notes: get(args.notes as string, prev?.basic.notes ?? ''),
    }
    const contact = {
      primaryPhone: get(args.primaryPhone as string, prev?.contact.primaryPhone ?? ''),
      secondaryPhone: prev?.contact.secondaryPhone ?? '',
      phoneCountryCode: get(args.phoneCountryCode as string, prev?.contact.phoneCountryCode ?? ''),
      primaryEmail: get(args.primaryEmail as string, prev?.contact.primaryEmail ?? ''),
      secondaryEmail: prev?.contact.secondaryEmail ?? '',
      altEmail: prev?.contact.altEmail ?? '',
      website: get(args.website as string, prev?.contact.website ?? ''),
      contactPreference: prev?.contact.contactPreference ?? '',
      socialLinks: prev?.contact.socialLinks ?? [],
    }
    const address = {
      street: prev?.address.street ?? '',
      apartment: prev?.address.apartment ?? '',
      city: prev?.address.city ?? '',
      state: prev?.address.state ?? '',
      postalCode: prev?.address.postalCode ?? '',
      country: prev?.address.country ?? '',
      countryCode: prev?.address.countryCode ?? '',
    }
    const account = {
      loginUsername: prev?.account.loginUsername ?? '',
      loginEmail: prev?.account.loginEmail ?? '',
      password: (args.password as string) ?? '',
      clearPassword: !!args.clearPassword,
      accountProvider: prev?.account.accountProvider ?? '',
      accountCreatedAt: prev?.account.accountCreatedAt ?? '',
      lastLogin: prev?.account.lastLogin ?? '',
      status: prev?.account.status ?? 'Active',
      recoveryInfo: '',
      notes: prev?.account.notes ?? '',
    }
    const professional = {
      occupation: get(args.occupation as string, prev?.professional.occupation ?? ''),
      jobTitle: prev?.professional.jobTitle ?? '',
      company: get(args.company as string, prev?.professional.company ?? ''),
      industry: get(args.industry as string, prev?.professional.industry ?? ''),
      website: prev?.professional.website ?? '',
      workEmail: prev?.professional.workEmail ?? '',
      workPhone: prev?.professional.workPhone ?? '',
      notes: prev?.professional.notes ?? '',
    }
    const custom = {
      fields: prev?.custom.fields ?? [],
      personalNotes: prev?.custom.personalNotes ?? '',
      internalNotes: prev?.custom.internalNotes ?? '',
      personalTags: prev?.custom.personalTags ?? [],
    }
    return { basic, contact, address, account, professional, custom }
  }

  private roleOf(actor: Actor): 'readonly' | 'standard' | 'admin' {
    const user = this.ctx.auth!.getUser(actor.id ?? '')
    return (user?.role as 'readonly' | 'standard' | 'admin') || 'readonly'
  }

  private resolveId(_profiles: import('../services/profiles').ProfilesService, idOrCode: string): string {
    const { db } = this.ctx.vault!
    const byCode = db.get<{ id: string }>('SELECT id FROM profiles WHERE profile_code = ? AND deleted_at IS NULL', [idOrCode])
    if (byCode) return byCode.id
    const byId = db.get<{ id: string }>('SELECT id FROM profiles WHERE id = ? AND deleted_at IS NULL', [idOrCode])
    if (byId) return byId.id
    throw new AppError('NOT_FOUND', `No profile with id or code ${idOrCode}`)
  }
}
