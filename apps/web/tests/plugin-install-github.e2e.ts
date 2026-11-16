// Real Git reaches a controlled proxy failure; the browser keeps the plain
// failed screen, whose details name the check's own Git run and complete log,
// without retrying the failed address.
import { once } from 'node:events'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { createServer, type Socket } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { expect, it, onTestFinished } from 'vitest'
import { launchWebScaffold, watchConsole } from './scaffold.ts'
import { ZH_BROWSER_LOCALE } from './support.ts'

it("shows the failed check's Git run and complete log in the installation details", async () => {
  const scratch = await mkdtemp(join(tmpdir(), 'dsh-install-github-details-'))
  onTestFinished(() => rm(scratch, { recursive: true, force: true }))
  const sockets = new Set<Socket>()
  const proxy = createServer((socket) => {
    sockets.add(socket)
    socket.on('error', () => {})
    socket.once('close', () => { sockets.delete(socket) })
    socket.once('data', () => socket.destroy())
  })
  onTestFinished(async () => {
    for (const socket of sockets) socket.destroy()
    await new Promise<void>((resolve, reject) => { proxy.close((error) => { if (error) reject(error); else resolve() }) })
  })
  proxy.listen(0, '127.0.0.1')
  await once(proxy, 'listening')
  const address = proxy.address()
  if (address === null || typeof address === 'string') throw new Error('proxy did not bind a TCP port')
  const gitConfig = join(scratch, 'git.config')
  await writeFile(gitConfig, `[http "https://github.com/"]\n proxy = http://127.0.0.1:${String(address.port)}\n`)
  const scaffold = await launchWebScaffold({
    profile: { packages: [], packageManager: { command: process.execPath, args: [], env: { GIT_CONFIG_GLOBAL: gitConfig, GIT_CONFIG_NOSYSTEM: '1' } } },
  })
  onTestFinished(() => scaffold.close())
  const browser = await chromium.launch()
  onTestFinished(() => browser.close())
  const profile = join(scaffold.harnessHome, 'profiles', 'scaffold')
  const attempts = join(profile, '.attempts')
  await writeFile(join(profile, 'config'), 'console.log("https://registry.npmjs.org/")\n')
  await writeFile(attempts, '')
  await writeFile(join(profile, 'add'), `
    const fs = require('node:fs');
    fs.appendFileSync('.attempts', JSON.stringify(process.argv) + '\\n');
    process.exitCode = 1;
  `)
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, locale: ZH_BROWSER_LOCALE })
  const tripwire = watchConsole(page)
  await page.goto(scaffold.authenticatedUrl)
  await page.waitForSelector('[class*="frame"]')
  if (await page.getByRole('dialog', { name: '设置' }).count() > 0) await page.keyboard.press('Escape')
  await page.getByRole('navigation', { name: '全局面板' }).getByRole('button', { name: '插件', exact: true }).click()
  await page.getByRole('button', { name: '添加插件', exact: true }).click()
  const spec = 'https://github.com/example/dsh-plugin.git'
  let dialog = page.getByRole('dialog', { name: '添加插件', exact: true })
  await dialog.getByRole('textbox', { name: '包名或地址' }).fill(spec)
  await dialog.getByRole('button', { name: '安装', exact: true }).click()
  dialog = page.getByRole('dialog', { name: '插件安装失败', exact: true })
  await dialog.waitFor()
  expect(await dialog.getByText('无法连接 github.com', { exact: false }).count()).toBe(1)
  // The details carry the failed check's own Git run and the complete log, not an empty terminal.
  await dialog.getByRole('button', { name: '查看安装详情', exact: true }).click()
  await dialog.getByText(/git -c credential\.helper= ls-remote -- https:\/\/github\.com\/example\/dsh-plugin\.git HEAD/).waitFor()
  await dialog.getByText(/fatal: unable to access/).waitFor()
  expect(await dialog.getByText(/^完整日志：.*github-connection-.*git\.log$/).count()).toBe(1)
  expect(await readFile(attempts, 'utf8')).toBe('')
  expect(tripwire.pageErrors).toEqual([])
})
