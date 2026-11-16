/** Repository files through the GitLab single-file API, with the clone fallback. */
import { afterEach, expect, it, vi } from 'vitest'
import { DetailFailure } from '@deepseek-ai/dsh-plugin-detail'
import { repositoryFiles, type RepositoryFileOptions } from '../src/detail-files.ts'

const signal = new AbortController().signal
const lifetime = new AbortController().signal
const options = { timeoutMs: 5000, lifetime }
const text = (bytes: Uint8Array | undefined): string | undefined => bytes === undefined ? undefined : new TextDecoder().decode(bytes)

afterEach(() => { vi.unstubAllGlobals() })

/** Answer requests by URL with a fresh response each time; any other URL fails the test. */
function serve(routes: Record<string, Error | (() => Response)>) {
  const fetch = vi.fn((url: string) => {
    const route = routes[url]
    if (route === undefined) throw new Error(`unexpected fetch ${url}`)
    if (route instanceof Error) return Promise.reject(route)
    return Promise.resolve(route())
  })
  vi.stubGlobal('fetch', fetch)
  return fetch
}

/** A clone cache double recording its calls. */
function clones(answers: { public?: boolean | Error; read?: string; readme?: string } = {}) {
  const calls: string[] = []
  const cache = {
    isPublic: vi.fn((url: string) => {
      calls.push(`public ${url}`)
      return answers.public instanceof Error ? Promise.reject(answers.public) : Promise.resolve(answers.public ?? false)
    }),
    read: vi.fn((url: string, commit: string | undefined, path: string) => {
      calls.push(`read ${url} ${String(commit)} ${path}`)
      return Promise.resolve(answers.read === undefined ? undefined : Buffer.from(answers.read))
    }),
    readme: vi.fn((url: string, commit: string | undefined, dir: string) => {
      calls.push(`readme ${url} ${String(commit)} ${dir}`)
      return Promise.resolve(answers.readme === undefined ? undefined : { path: `${dir}/README.md`, bytes: Buffer.from(answers.readme) })
    }),
  }
  const settings: RepositoryFileOptions = {
    ...options, gitlabHosts: ['gitlab.example'], cache,
  }
  return { calls, settings }
}

const GITHUB = { host: 'github.com', project: 'o/r', url: 'https://github.com/o/r.git' }
const GITLAB = { host: 'gitlab.example', project: 'g/s/p', url: 'https://gitlab.example/g/s/p.git' }
const OTHER = { host: 'git.example', project: 'o/r', url: 'https://git.example/o/r.git' }
const COMMIT = 'a'.repeat(40)

/** The GitLab single-file API URL of one path of `GITLAB`. */
const gitlab = (path: string, ref = 'HEAD'): string =>
  `https://gitlab.example/api/v4/projects/g%2Fs%2Fp/repository/files/${encodeURIComponent(path)}/raw?ref=${ref}`

it('reads public repositories through the GitLab single-file API', async () => {
  serve({
    [gitlab('p/README.md', COMMIT)]: () => new Response('# pinned'),
    [gitlab('README.md')]: () => new Response('no', { status: 404 }),
    [gitlab('readme.md')]: () => new Response('no', { status: 404 }),
    [gitlab('Readme.md')]: () => new Response('# root'),
    [gitlab('missing.png')]: () => new Response('no', { status: 404 }),
    [gitlab('guide/a.md')]: () => new Response('# gl'),
    [gitlab('down.md')]: () => new Response('down', { status: 500 }),
  })
  const { calls, settings } = clones({ public: true })
  const pinned = repositoryFiles(GITLAB, COMMIT, settings)
  expect(pinned.key).toBe(`git:https://gitlab.example/g/s/p.git#${COMMIT}`)
  expect(await pinned.readme('p', 100, signal)).toMatchObject({ path: 'p/README.md' })
  const head = repositoryFiles(GITLAB, undefined, settings)
  expect(await head.readme('', 100, signal)).toMatchObject({ path: 'Readme.md' })
  expect(await head.read('missing.png', 100, signal)).toBeUndefined()
  await expect(head.read('down.md', 100, signal)).rejects.toMatchObject({ reason: 'network' })
  expect(text(await head.read('guide/a.md', 100, signal))).toBe('# gl')
  // Each ambiguous answer asks whether the repository is public; the clone cache shares and caches that check.
  expect(calls).toEqual(['public https://gitlab.example/g/s/p.git', 'public https://gitlab.example/g/s/p.git'])
})

it('reads repositories that need credentials, and repositories on hosts without a single-file API, from the clone', async () => {
  const fetch = serve({
    [gitlab('README.md')]: () => new Response('no', { status: 404 }),
    [gitlab('a.png')]: () => new Response('no', { status: 403 }),
  })
  const { calls, settings } = clones({ public: false, read: 'png', readme: '# private' })
  const files = repositoryFiles(GITLAB, undefined, settings)
  expect(await files.readme('', 100, signal)).toMatchObject({ path: '/README.md' })
  expect(text(await files.read('a.png', 100, signal))).toBe('png')
  expect(fetch).toHaveBeenCalledTimes(2)
  // GitHub and every other host without a configured single-file API are read from the clone alone.
  const github = repositoryFiles(GITHUB, undefined, settings)
  expect(text(await github.read('g.png', 100, signal))).toBe('png')
  expect((await github.readme('', 100, signal))?.path).toBe('/README.md')
  const other = repositoryFiles(OTHER, COMMIT, settings)
  expect(text(await other.read('b.png', 100, signal))).toBe('png')
  expect((await other.readme('d', 100, signal))?.path).toBe('d/README.md')
  expect(calls).toEqual([
    'public https://gitlab.example/g/s/p.git',
    'readme https://gitlab.example/g/s/p.git undefined ',
    'public https://gitlab.example/g/s/p.git',
    'read https://gitlab.example/g/s/p.git undefined a.png',
    'read https://github.com/o/r.git undefined g.png',
    'readme https://github.com/o/r.git undefined ',
    `read https://git.example/o/r.git ${COMMIT} b.png`,
    `readme https://git.example/o/r.git ${COMMIT} d`,
  ])
  expect(fetch).toHaveBeenCalledTimes(2)
  const cleartext = repositoryFiles({ host: 'git.example', project: 'o/r', url: 'http://git.example/o/r.git' }, undefined, settings)
  expect(text(await cleartext.read('c.png', 100, signal))).toBe('png')
})

it('reports a failed anonymous check as the read\'s failure', async () => {
  serve({ [gitlab('a.md')]: () => new Response('no', { status: 404 }) })
  const { calls, settings } = clones({ public: new DetailFailure('network', 'offline') })
  const files = repositoryFiles(GITLAB, undefined, settings)
  await expect(files.read('a.md', 100, signal)).rejects.toMatchObject({ reason: 'network' })
  await expect(files.read('a.md', 100, signal)).rejects.toMatchObject({ reason: 'network' })
  expect(calls).toEqual(['public https://gitlab.example/g/s/p.git', 'public https://gitlab.example/g/s/p.git'])
})
