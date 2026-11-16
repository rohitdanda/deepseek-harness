// @vitest-environment jsdom
/** Collapsed progress summaries and Host-owned steps survive view remounts. */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { bindSnapshotSelector, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import type { SpeechPreparationState, SpeechPreparationStep, SpeechProviderId } from '@deepseek-ai/dsh-experimental-speech-to-text/types'
import { afterEach, expect, it, vi } from 'vitest'
import { PreparationCard, VoicePreparation } from '../src/client/PreparationCard.tsx'
import type { VoiceInputProps } from '../src/client/VoiceInput.tsx'
import type { SpeechReadiness } from '../src/client/readiness.ts'
import { Recording } from '../src/client/audio.ts'
import { zh, en, ja, es, fr, de, ru, pt } from '../src/client/locales.ts'

afterEach(() => { cleanup(); vi.useRealTimers() })
const id = 'local' as SpeechProviderId, t = makeTranslate(zh, commonZh)
const steps: SpeechPreparationStep[] = [{ kind: 'check', status: 'running', startedAt: 0 }, { kind: 'load', status: 'pending' }]
function fixture(preparation: SpeechPreparationState, connected = true) {
  const prepare = vi.fn(async (_id: SpeechProviderId) => {}), cancelPreparation = vi.fn(async (_id: SpeechProviderId) => {})
  const props = { provider: { id, name: 'SenseVoiceSmall', location: 'host-local' as const, languages: ['auto', 'zh', 'en', 'ja'], preparation },
    connected, prepare, cancelPreparation, t }
  return { ...render(<PreparationCard {...props} />), prepare, cancelPreparation, props }
}
it('collapses by default, expands all steps, and shows details only for the active step', async () => {
  vi.useFakeTimers(); vi.setSystemTime(5000)
  const b = fixture({ phase: 'checking', step: 'check', startedAt: 0, steps })
  expect(screen.queryByRole('list')).toBeNull()
  expect(screen.getByText('已等待 5 秒')).toBeTruthy()
  expect(screen.queryByRole('progressbar')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: new RegExp(zh['step.check']) }))
  expect(screen.getAllByRole('listitem')).toHaveLength(2)
  expect(b.container.querySelectorAll('[data-step-state="pending"] [data-state="idle"]')).toHaveLength(1)
  expect(screen.getAllByText('已等待 5 秒')).toHaveLength(1)
  await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
  expect(screen.getByText('已等待 6 秒')).toBeTruthy()
  b.unmount()
  fixture({ phase: 'checking', step: 'check', startedAt: 0, steps })
  expect(screen.getByText('已等待 6 秒')).toBeTruthy()
  expect(screen.queryByRole('list')).toBeNull()
})
it('cancels running preparation and disables commands while disconnected', () => {
  const b = fixture({ phase: 'checking', step: 'check', startedAt: 0, steps })
  fireEvent.click(screen.getByRole('button', { name: zh.cancelPrepare }))
  expect(b.cancelPreparation).toHaveBeenCalledWith(id)
  b.cancelPreparation.mockClear()
  b.rerender(<PreparationCard {...b.props} connected={false} />)
  fireEvent.click(screen.getByRole('button', { name: zh.cancelPrepare }))
  expect(b.cancelPreparation).not.toHaveBeenCalled()
  expect(screen.getByText(zh.reconnecting)).toBeTruthy()
})
it('starts preparation and offers retry without showing progress for completed or pending steps', async () => {
  const b = fixture({ phase: 'unprepared', steps: steps.map(step => ({ kind: step.kind, status: 'pending' })) })
  fireEvent.click(screen.getByRole('button', { name: zh.prepare }))
  expect(b.prepare).toHaveBeenCalledWith(id)
  b.rerender(<PreparationCard {...b.props} provider={{ ...b.props.provider,
    preparation: { phase: 'failed', message: 'network unavailable', steps: [{ kind: 'load', status: 'failed' }] } }} />)
  await waitFor(() => { expect(screen.getByRole<HTMLButtonElement>('button', { name: zh.retryPrepare }).disabled).toBe(false) })
  b.prepare.mockRejectedValueOnce(new Error('offline'))
  fireEvent.click(screen.getByRole('button', { name: zh.retryPrepare }))
  await screen.findByText('语音识别失败：offline')
  b.prepare.mockRejectedValueOnce('network closed')
  fireEvent.click(screen.getByRole('button', { name: zh.retryPrepare }))
  await screen.findByText('语音识别失败：network closed')
  fireEvent.click(screen.getByRole('button', { name: zh['short.failed'] }))
  expect(screen.queryByRole('progressbar')).toBeNull()
})
it('shows waking without an explicit preparation cancellation control', () => {
  fixture({ phase: 'waking', startedAt: Date.now() - 5000 })
  expect(screen.getByText('已等待 5 秒')).toBeTruthy()
  expect(screen.queryByRole('button', { name: zh.cancelPrepare })).toBeNull()
})
it('shows the preparation failure message and retains an actionable retry', () => {
  const b = fixture({ phase: 'failed', message: 'Speech model files are missing: model.int8.onnx' })
  expect(screen.getByRole('alert').textContent).toBe('准备失败：Speech model files are missing: model.int8.onnx')
  fireEvent.click(screen.getByRole('button', { name: zh.retryPrepare }))
  expect(b.prepare).toHaveBeenCalledWith(id)
})
it('persists settings and reports disconnection in the detail card', async () => {
  const store = createSnapshotStore<SpeechReadiness>({ connected: true, error: null, catalog: {
    selection: { providerId: id, language: 'auto' }, maxAudioBytes: 100, maxDurationSeconds: 120,
    providers: [{ id, name: 'SenseVoiceSmall', location: 'host-local', languages: ['auto', 'zh', 'en', 'ja'], preparation: { phase: 'ready' } },
      { id: 'cloud' as SpeechProviderId, name: 'Cloud', location: 'cloud', languages: ['auto', 'en', 'zh', 'ja', 'fr', 'it'], preparation: { phase: 'ready' } }],
  } })
  const configure = vi.fn<VoiceInputProps['configure']>(async () => {})
  const props = { useSpeechReadiness: bindSnapshotSelector(store), configure, t,
    useMicrophoneDevice: bindSnapshotSelector(createSnapshotStore({ id: '', label: '' })),
    selectMicrophone: vi.fn(), createRecording: () => new Recording(() => {}),
    prepare: vi.fn(async () => {}), cancelPreparation: vi.fn(async () => {}) }
  const view = render(<VoicePreparation {...props} />)
  fireEvent.change(screen.getByLabelText(zh.provider), { target: { value: 'cloud' } })
  await waitFor(() => { expect(configure).toHaveBeenCalledWith({ providerId: 'cloud' }) })
  const current = store.getSnapshot()
  act(() => { store.set({ ...current, catalog: { ...current.catalog!, selection: { providerId: 'cloud' as SpeechProviderId, language: 'en' } } }) })
  expect(screen.getByText(zh.cloud)).toBeTruthy()
  expect(within(screen.getByLabelText(zh.language)).getAllByRole<HTMLOptionElement>('option').map(item => item.value))
    .toEqual(['auto', 'en', 'zh', 'ja', 'fr', 'it'])
  expect(within(screen.getByLabelText(zh.language)).getByRole('option', { name: zh.fr })).toBeTruthy()
  expect(within(screen.getByLabelText(zh.language)).getByRole('option', { name: 'it' })).toBeTruthy()
  configure.mockRejectedValueOnce(new Error('settings are read-only'))
  fireEvent.change(screen.getByLabelText(zh.language), { target: { value: 'zh' } })
  await screen.findByText('语音识别失败：settings are read-only')
  configure.mockRejectedValueOnce('settings are locked')
  fireEvent.change(screen.getByLabelText(zh.language), { target: { value: 'ja' } })
  await screen.findByText('语音识别失败：settings are locked')
  act(() => { store.set({ catalog: null, connected: false, error: 'disconnected' }) })
  view.rerender(<VoicePreparation {...props} />)
  expect(screen.getByText(zh.loading)).toBeTruthy()
  expect(screen.getByRole('alert').textContent).toContain('disconnected')
})
it.each(['cancelled', 'standby', 'cancelling'] as const)('displays Host state %s', (phase) => {
  fixture(phase === 'cancelling' ? { phase, startedAt: Date.now() } : { phase })
  expect(screen.getByText(zh[`preparation.${phase}`])).toBeTruthy()
})

it('shows provider-specific installation estimates before preparation and removes them while running', () => {
  const b = fixture({ phase: 'unprepared' })
  const provider = { ...b.props.provider, setupEstimate: {
    recommendedDiskBytes: 5_000_000_000, expectedMemoryBytes: 2_000_000_000, minimumMinutes: 5, maximumMinutes: 30,
  } }
  b.rerender(<PreparationCard {...b.props} provider={provider} />)
  expect(screen.getByText(zh['setup.local'])).toBeTruthy()
  expect(screen.getByText(/建议预留约 5 GB/)).toBeTruthy()
  expect(screen.getByText(/模型加载后约 2 GB/)).toBeTruthy()
  expect(screen.getByText(/参考 5–30 分钟/)).toBeTruthy()
  b.rerender(<PreparationCard {...b.props} provider={{ ...provider, preparation: { phase: 'checking', startedAt: Date.now() } }} />)
  expect(screen.queryByText(zh['setup.local'])).toBeNull()
})

it('gives each speech recognition language a distinct localized name', () => {
  for (const dictionary of [zh, en, ja, es, fr, de, ru, pt]) {
    const names = [
      dictionary.zh, dictionary.en, dictionary.yue, dictionary.ja, dictionary.es,
      dictionary.fr, dictionary.de, dictionary.ru, dictionary.pt, dictionary.ko,
    ]
    expect(new Set(names).size).toBe(names.length)
  }
  expect(zh.fr).toBe('法语')
})
