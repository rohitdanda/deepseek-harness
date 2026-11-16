---
description: "从插件管理页启用实验性语音输入。"
kind: "package-bundle"
---

# @deepseek-ai/dsh-experimental-voice-input-bundle

[English](README.md) | 中文

## 概述

此可选 Bundle 组合语音服务定义、本地 SenseVoice Provider、带认证的 Remote 与浏览器麦克风控件。随包配置默认禁用。

## 目录

- [使用此包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用此包

打开 Web 侧栏的插件管理页并启用带蓝色声波图标的“语音输入”。缺少模型文件时，弹窗提供“前往安装”和“稍后”选项；“前往安装”打开 Bundle 详情。模型文件齐全时不会提示安装。在详情中选择“准备”；默认折叠的当前步骤摘要可展开为完整步骤列表。检查和加载显示等待时间。就绪后点击模型选择器与发送按钮之间的麦克风，再点击停止以插入转写文字。Bundle 详情通过 Settings 服务保存识别器和语言。禁用 Bundle 会取消当前任务；模型文件保留在磁盘上。

准备之前，请将 SenseVoice ONNX 模型（`model.int8.onnx`）和 `tokens.txt` 放入 DSH 主目录下的 `speech-to-text/sensevoice/models/sensevoice-onnx/`，将 Silero VAD 模型 `silero_vad.onnx` 放入 `speech-to-text/sensevoice/models/silero/`。此 Bundle 不下载任何内容。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>维护者信息 — 点击展开</summary>

静态 `cordis.patch.yml` 添加四个语音条目，选择 `sensevoice-local` 作为默认识别器，并通过 `dshHomePath` 提供 DSH 主目录下的模型文件位置。可选 Bundle 安装使插件管理器能够发现此包，但不会在默认配置中选择它。浏览器贡献拥有其生成 Remote 的挂载；稳定 API Remotes 不导入实验性代码。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

[语音输入子系统](../../../docs/subsystems/voice-input.zh.md)

-----

<a id="model-experience"></a>
## 模型体验

无，因为录音与准备不进入模型请求；之后的文字由普通用户提交拥有。

#### KV 缓存影响

没有直接影响；普通提交拥有消息内容。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

- 此 Bundle 提供一个本地识别器。额外 Provider 使用不同 id 注册到同一服务；云端识别需要显式增加 Provider 与凭据配置。Bundle 不增加模型工具或修改智能体循环。
- 安装 dsh 时会一并安装 `sherpa-onnx-node` 及其平台原生运行时（含 ONNX Runtime），即使此 Bundle 处于禁用状态。运行时的磁盘占用和下载量独立于你提供的模型文件；原生包体积随平台和版本变化。

-----

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者信息 — 点击展开</summary>

无。

</details>
