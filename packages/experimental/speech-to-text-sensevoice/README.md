---
description: "Prepare and operate a local CPU SenseVoice worker on demand."
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-speech-to-text-sensevoice

English | [中文](README.zh.md)

## Summary

This provider recognizes speech with SenseVoiceSmall ONNX and Silero VAD on the Host CPU. The platform-specific sherpa-onnx Node package includes ONNX Runtime; users need no Python, compiler or model conversion. Activation checks the configured model files without loading models.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

The [bundle](../voice-input-bundle/README.md) supplies absolute `dataRoot`, `modelDirectory` and `vadModelPath` values under the DSH home. `modelDirectory` is an existing directory containing the selected ONNX file (`model.int8.onnx` for `int8`, `model.onnx` for `fp32`) and `tokens.txt`; `vadModelPath` is the Silero ONNX file. The deployer supplies these files: the provider never downloads them and does not verify their contents. `precision` defaults to `int8`; `fp32` selects the larger reference weights.

Every activation checks that the selected model, tokens and VAD files exist. Present files restore readiness immediately after inspection; the first recording wakes the worker. Missing files require explicit preparation, which fails naming each missing file, while unreadable paths report an error. File contents remain the deployer's responsibility. Disabling the plugin or restarting the Host needs no further setup.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Maintainer details — click to expand</summary>

One managed Node subprocess serializes inference. Recordings submitted during wake-up join the bounded queue. At execution, the worker requires ready or standby resources. Transcription never starts preparation. `threads`, `segmentSeconds`, `vadThreshold`, `minSpeechSeconds`, `minSilenceSeconds` and `vadOnsetPaddingSeconds` tune CPU inference and segmentation, the last restoring the onset a cold detector reports late; `maxPending` bounds accepted work. Preparation and inference have separate deadlines. Invalid language or WAV input is rejected before native inference and retains the loaded worker; inference failures, malformed responses and transport failures reclaim it. Cancellation terminates an active worker and joins its process range; cancelled queued recordings never run. `idleTimeoutMs` releases the worker after inactivity, with zero retaining it until disposal. Model files stay on disk. Authenticated loopback requests keep audio in memory. Electron workers run in Node mode and copy VAD buffers to satisfy the V8 memory cage.

The Host owns preparation across page and Session changes: check the model files, then load the worker. Both steps report elapsed time. An idle worker retains prepared paths and needs only model loading on wake-up. Cancellation after a preparation result is published waits for cleanup without replacing that result.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

[Voice input subsystem](../../../docs/subsystems/voice-input.md)

-----

<a id="model-experience"></a>
## Model Experience

None, as recordings and preparation remain outside model requests; ordinary user submission owns any later text.

#### KV Cache effect

No direct effect; ordinary submission owns the message content.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- CPU only. Native packages target macOS arm64/x64, Linux glibc arm64/x64 and Windows x64; Windows ARM64 and Linux musl are not verified deployment targets. INT8 weights occupy about 239 MB, FP32 about 938 MB, plus the runtime and VAD. Model memory exceeds file size and grows with recording length; installation hints are estimates. Language hints are auto, Chinese, English, Cantonese, Japanese and Korean. Disabling the plugin retains model caches. Packaged Desktop releases still require platform signing and microphone-permission acceptance; Linux Desktop distribution is outside this provider.

-----

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Maintainer details — click to expand</summary>

None.

</details>
