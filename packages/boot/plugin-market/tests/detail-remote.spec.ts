/** The detail Remote methods and the image route of the plugin market service. */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context, Service } from '@deepseek-ai/cordis'
import { remoteErrorOf } from '@deepseek-ai/dsh-typert-protocol'
import { afterEach, beforeEach, expect, it, onTestFinished, vi } from 'vitest'
import { DetailReader } from '../src/detail.ts'
import PluginMarket from '../src/index.ts'
import { RepositoryCache } from '../src/repository-cache.ts'
import { parseIndexBody } from '../src/parse.ts'

vi.mock('../src/parse-thread.ts', () => ({
  parseIndexInWorker: async (body: Uint8Array, url: string) => await Promise.resolve(parseIndexBody(body, url)),
}))

const INDEX = 'https://market.example/index.json'
const COMMIT = 'b'.repeat(40)

/** The GitLab single-file API URL of one path of a project on the configured GitLab host. */
const gitlab = (project: string, path: string, ref: string): string =>
  `https://gitlab.example/api/v4/projects/${encodeURIComponent(project)}/repository/files/${encodeURIComponent(path)}/raw?ref=${ref}`
let home: string

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'dsh-plugin-market-detail-remote-'))
  // Every repository of these tests is public; no test runs Git against a network host.
  vi.spyOn(RepositoryCache.prototype, 'isPublic').mockResolvedValue(true)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  rmSync(home, { recursive: true, force: true })
})

/** Serve fixed bodies by URL; any other URL answers 404. */
function serve(routes: Record<string, unknown>) {
  const fetch = vi.fn((url: string) => {
    const body = routes[url]
    if (body instanceof Error) return Promise.reject(body)
    if (body === undefined) return Promise.resolve(new Response('missing', { status: 404 }))
    return Promise.resolve(new Response(typeof body === 'string' ? body : JSON.stringify(body)))
  })
  vi.stubGlobal('fetch', fetch)
  return fetch
}

const index = {
  format: 1, title: 'Market', plugins: [
    {
      name: 'from-git', repository: { url: 'https://gitlab.example/o/mono', directory: 'other' },
      versions: [{ version: '1.0.0', publishTimestamp: 1, source: { type: 'git', url: 'https://gitlab.example/o/r', commit: COMMIT, path: 'pkg' }, engines: { dsh: '*' } }],
    },
    {
      name: 'from-git-root', repository: { url: 'https://example.com/only' },
      versions: [{ version: '1.0.0', publishTimestamp: 1, source: { type: 'git', url: 'https://gitlab.example/o/root', commit: COMMIT }, engines: { dsh: '*' } }],
    },
    {
      name: 'from-git-self', repository: { url: 'https://gitlab.example/o/self', directory: 'pkg' },
      versions: [{ version: '1.0.0', publishTimestamp: 1, source: { type: 'git', url: 'https://gitlab.example/o/self', commit: COMMIT, path: 'pkg' }, engines: { dsh: '*' } }],
    },
    { name: 'bare', versions: [{ version: '1.0.0', publishTimestamp: 1, source: { type: 'npm' }, engines: { dsh: '*' } }] },
    {
      name: 'from-npm', versions: [
        { version: '2.0.0', publishTimestamp: 1, source: { type: 'npm' }, engines: { dsh: '*' } },
        { version: '1.0.0', publishTimestamp: 1, source: { type: 'npm', registry: 'https://npm.corp.example/' }, engines: { dsh: '*' } },
        { version: '0.9.0', publishTimestamp: 1, source: { type: 'npm', registry: 'https://registry.example.org/' }, engines: { dsh: '*' } },
      ],
      repository: { url: 'https://gitlab.example/o/npm' },
    },
  ],
}

async function mount(options: { profile?: boolean; connection?: boolean } = {}) {
  const ctx = new Context()
  onTestFinished(() => ctx.fiber.dispose())
  class Manager extends Service {
    constructor(inner: Context) { super(inner, 'pluginManager') }
    listBundles() { return Promise.resolve([]) }
    listVersionExemptions() { return { exemptions: {}, warnings: [] } }
  }
  await ctx.plugin(Manager)
  if (options.profile === true) {
    ctx.provide('profileContext', {
      name: 'test', startedBundles: [], dir: join(home, 'profile'), patchPath: join(home, 'profile', 'cordis.patch.yml'),
      installAnchor: join(home, 'package.json'), cwd: home, home, overlays: [],
    })
  }
  const routes = new Map<string, (request: Request) => Promise<Response>>()
  if (options.connection === true) {
    class Connection extends Service {
      readonly fetch = {
        register: (route: { path: string; fetch: (request: Request) => Promise<Response> }) => {
          routes.set(route.path, route.fetch)
          return () => Promise.resolve(void routes.delete(route.path))
        },
      }

      constructor(inner: Context) { super(inner, 'connection') }
    }
    await ctx.plugin(Connection)
  }
  await ctx.plugin(PluginMarket, { indexes: [INDEX], detailGitlabHosts: ['gitlab.example'], ...options.profile === true ? {} : { detailCacheDir: join(home, 'cache') } })
  return { market: ctx.pluginMarket, routes }
}

const failureOf = async (promise: Promise<unknown>) => remoteErrorOf(await promise.catch((error: unknown) => error))

it('requires a clone cache directory outside a profile', async () => {
  const ctx = new Context()
  onTestFinished(() => ctx.fiber.dispose())
  class Manager extends Service {
    constructor(inner: Context) { super(inner, 'pluginManager') }
  }
  await ctx.plugin(Manager)
  await expect(ctx.plugin(PluginMarket, { indexes: [] })).rejects.toThrow('detailCacheDir must be an absolute path')
})

it('reads market entries from their Git source and the entry repository, and asks no other host', async () => {
  const requests = serve({
    [INDEX]: index,
    [gitlab('o/r', 'pkg/README.md', COMMIT)]: '# Git',
    [gitlab('o/root', 'README.md', COMMIT)]: '# Root',
    [gitlab('o/npm', 'README.md', 'HEAD')]: '# Npm repository',
  })
  const { market } = await mount({ profile: true })
  expect(await market.readEntryDetail(INDEX, 'from-git', '1.0.0', 'en')).toMatchObject({ origin: 'readme', markdown: '# Git' })
  expect(await market.readEntryDetail(INDEX, 'from-git-root', '1.0.0', 'en')).toMatchObject({ origin: 'readme', markdown: '# Root' })
  expect(await market.readEntryDetail(INDEX, 'bare', '1.0.0', 'en')).toEqual({ status: 'none' })
  // The entry's repository is the source directory just read, so its default branch is not read again.
  expect(await market.readEntryDetail(INDEX, 'from-git-self', '1.0.0', 'en')).toEqual({ status: 'none' })
  expect(requests.mock.calls.map(([url]) => url).filter(url => url.includes('o%2Fself') && url.endsWith('ref=HEAD'))).toEqual([])
  // An npm version has no readable package files, whatever its registry; only the entry's repository is read.
  for (const version of ['2.0.0', '1.0.0', '0.9.0']) {
    expect(await market.readEntryDetail(INDEX, 'from-npm', version, 'en')).toMatchObject({ origin: 'repository', markdown: '# Npm repository' })
  }
  expect(await failureOf(market.readEntryDetail(INDEX, 'from-npm', '3.0.0', 'en')))
    .toMatchObject({ code: 'plugin-market/unknown-plugin', details: { name: 'from-npm', version: '3.0.0' } })
  expect(await failureOf(market.readEntryDetail(INDEX, 'absent', '1.0.0', 'en'))).toMatchObject({ code: 'plugin-market/unknown-plugin' })
  expect(await failureOf(market.readEntryDetail(INDEX, 'absent', '1.0.0', '!'))).toMatchObject({ code: 'plugin-market/invalid-query' })
  expect(new Set(requests.mock.calls.map(([url]) => new URL(url).host))).toEqual(new Set(['market.example', 'gitlab.example']))
})

it('reports unreadable sources as detail-unavailable and keeps other failures', async () => {
  serve({ [INDEX]: index })
  const { market } = await mount()
  await market.search(INDEX, { sort: { kind: 'index' }, offset: 0, limit: 1 })
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))))
  expect(await failureOf(market.readEntryDetail(INDEX, 'from-git', '1.0.0', 'en')))
    .toMatchObject({ code: 'plugin-market/detail-unavailable', details: { reason: 'network' } })
  const read = vi.spyOn(DetailReader.prototype, 'read').mockRejectedValueOnce(new TypeError('bug'))
  try {
    await expect(market.readEntryDetail(INDEX, 'from-git', '1.0.0', 'en')).rejects.toThrow('bug')
  } finally {
    read.mockRestore()
  }
})

it('serves images beside a read document and maps failures to statuses', async () => {
  serve({
    [INDEX]: index,
    [gitlab('o/r', 'pkg/README.md', COMMIT)]: '# Git ![a](a.png)',
    [gitlab('o/r', 'pkg/a.png', COMMIT)]: 'png',
  })
  const { market, routes } = await mount({ connection: true })
  const detail = await market.readEntryDetail(INDEX, 'from-git', '1.0.0', 'en')
  if (detail.status !== 'found') throw new Error('expected a document')
  const route = routes.get('/api/plugin-market/detail-file')!
  const get = (query: string) => route(new Request(`http://dsh.local/api/plugin-market/detail-file${query}`))
  const ok = await get(`?document=${detail.document}&path=a.png`)
  expect([ok.status, ok.headers.get('content-type'), ok.headers.get('x-content-type-options'), await ok.text()])
    .toEqual([200, 'image/png', 'nosniff', 'png'])
  expect((await get(`?document=${detail.document}`)).status).toBe(400)
  expect((await get(`?document=${detail.document}&path=missing.png`)).status).toBe(404)
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('x'.repeat(10), { headers: { 'content-length': String(6 * 1024 * 1024) } }))))
  expect((await get(`?document=${detail.document}&path=large.png`)).status).toBe(413)
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))))
  expect((await get(`?document=${detail.document}&path=b.png`)).status).toBe(502)
  const image = vi.spyOn(DetailReader.prototype, 'image').mockRejectedValueOnce(new TypeError('bug'))
  try {
    await expect(get(`?document=${detail.document}&path=c.png`)).rejects.toThrow('bug')
  } finally {
    image.mockRestore()
  }
})
