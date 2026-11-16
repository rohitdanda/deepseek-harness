# Desktop 本地验证

[English](README.md) | 中文

## 概述

本记录覆盖已打包客户端的故障报告人工验证。安装器、签名和发布证据由[打包](../packaging/README.zh.md)与 [Windows 签名](../windows-signing/README.zh.md)指南负责。

## 目录

- [故障报告验证](#verification-diagnostics)

<a id="verification-diagnostics"></a>

## 故障报告验证

产品行为与限制见[故障恢复与诊断](../docs/diagnostics/README.zh.md)。

使用可丢弃的 profile、独立的 Electron `userData` 和实际打包客户端。构造最小本地组合包：`package.json` 的 `dsh.bundle.patch` 指向 `cordis.patch.yml`，需要执行代码时再加入插件模块，然后打成可本地安装的 `.tgz`。这些包会故意使应用出错，不得发布或安装到日常 profile。

分别构造模块导入异常、插件初始化异常、`appReady` 后的异步异常，以及 Host 非零退出。用 patch 禁用 `agent`、`session`、`llm`、`tools` 提供者，检查服务缺失诊断。跨重启场景通过 `pluginManager` 选入该组合包，再重启同一 profile。运行期场景须实际观察客户端就绪；`appReady` 不代表窗口已经显示。

检查原始错误与 cause 或退出码、跨重启的操作 ID 和 Host 运行 ID、报告收集完成标记与遗漏信息、原生弹窗中的文件获取，以及禁用插件恢复后的启动。记录安装包版本和源码提交；生成测试包成功或管理操作返回成功，都不能代替客户端功能验证。测试后恢复协议关联并退出测试进程。

资源验证可构造大型稀疏历史文件、大量无关文件、密集记录，以及损坏行和未完成行。在独立新进程中测量，分开记录数据构造与收集开销，并核对实际读取量、输出大小、耗时和峰值内存。验证 Worker 取消时，可用仅测试加载的模块钩子在写入进入标记后挂起异步文件打开操作；先确认标记，再观察期限到达后的 Worker 退出，并逐字节核对基本报告。该方法不模拟内核系统调用卡死，也不代替打包客户端验证。
