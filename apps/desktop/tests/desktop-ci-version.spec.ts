import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { desktopCiVersion } from '../scripts/desktop-ci-version.mjs'
import { desktopBuildVersionPrefix } from '../scripts/desktop-build-version.mjs'
import { createElectronBuilderConfig } from '../scripts/electron-builder-config.mjs'

it('resolves every CI version mode', () => {
  const now = new Date('2026-11-03T00:00:00Z')
  for (const version of ['1.2.3', '1.2.3-alpha.1', '1.2.3-rc.1']) {
    const env = { GITHUB_RUN_NUMBER: '7', GITHUB_RUN_ATTEMPT: '2' }
    const generated = `${desktopBuildVersionPrefix(version)}20261103.7.2`
    expect(desktopCiVersion({ ...env, PACKAGE_VERSION_MODE: 'follow-dsh' }, version, now)).toBe(version)
    for (const preset of ['test', 'production']) {
      expect(desktopCiVersion({ ...env, DSH_PACKAGING_PRESET: preset, PACKAGE_VERSION_MODE: 'build-number' }, version, now)).toBe(generated)
    }
    expect(desktopCiVersion({ ...env, PACKAGE_VERSION_MODE: 'product' }, version, now)).toBe(version)
    expect(desktopCiVersion({ ...env, PACKAGE_VERSION_MODE: 'auto' }, version, now)).toBe(generated)
    expect(desktopCiVersion({ ...env, PACKAGE_VERSION_MODE: 'manual', PACKAGE_BUILD_VERSION: generated }, version, now)).toBe(generated)
    expect(desktopCiVersion({ ...env, PACKAGE_VERSION_MODE: 'default', DSH_PACKAGING_PRESET: 'production' }, version, now)).toBe(version)
    expect(desktopCiVersion({ ...env, PACKAGE_VERSION_MODE: 'default', DSH_PACKAGING_PRESET: 'test' }, version, now)).toBe(generated)
    expect(() => desktopCiVersion({ ...env, PACKAGE_VERSION_MODE: 'manual', PACKAGE_BUILD_VERSION: 'invalid' }, version, now)).toThrow('Invalid build version')
  }
})

it.each(['arm64', 'x64'] as const)('carries a prerelease build version and no update feed in a macOS %s package', (arch) => {
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }
  const version = `${desktopBuildVersionPrefix(manifest.version)}20261103.1`
  const config = createElectronBuilderConfig({
    DSH_DESKTOP_APP_ID: 'com.example.build-version-test',
    DSH_DESKTOP_BUILD_VERSION: version,
    DSH_DESKTOP_MACOS_SIGNING_IDENTITY: 'Example Company (TEAMID1234)',
    DSH_DESKTOP_MACOS_TEAM_ID: 'TEAMID1234',
    APPLE_KEYCHAIN_PROFILE: 'build-version-test',
  }, 'darwin', arch)
  expect(config.extraMetadata).toMatchObject({ version })
  expect(config.publish).toBeNull()
})

it('accepts a prerelease build version in an unsigned Windows x64 configuration', () => {
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }
  const version = `${desktopBuildVersionPrefix(manifest.version)}20261103.1`
  const config = createElectronBuilderConfig({
    DSH_DESKTOP_APP_ID: 'com.example.build-version-test',
    DSH_DESKTOP_BUILD_VERSION: version,
    DSH_DESKTOP_UNSIGNED: '1',
  }, 'win32', 'x64')
  expect(config.extraMetadata).toMatchObject({ version })
  expect(config.publish).toBeNull()
})
