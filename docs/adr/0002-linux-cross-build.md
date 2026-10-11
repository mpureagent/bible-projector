# Linux 交叉构建 Windows 产物（NSIS 需 wine，未装则止步于 7z 打包）

开发机是 Linux（alnx4 6.6.102），产物必须是 Windows 安装包。spike（`/data/spikes/e22-cross-build/`，electron-builder 26.15.3 + Electron 22.3.27）实测证明：win-unpacked、zip、portable 目标在 Linux 上可以走通到签名步骤，**NSIS 最终 .exe 链接需要 wine，本机未安装，实测失败于 `spawn wine ENOENT`**（build3.log，exit 1）。我们决定把 Linux 交叉构建固化为项目打包流程，前置依赖是装 wine64；NSIS 完整验证在装好 wine 后补测。

## Considered Options

- **Linux 交叉构建（采用）**：零额外基础设施，一条命令出全部 Windows 产物。spike 证据：win-unpacked（`ShengYanTouPing-Spike.exe` 157,602,304 字节 + 完整 Windows DLL 集）与 93.7MB zip 产物均在 dist/ 落盘，构建耗时 ~1m14s（build4.log TEST A，ZIP_EXIT=0）。
- **CI Windows runner / Windows 虚拟机内构建**：备选，暂不启用。开发机没有现成 CI 与 Windows VM；先补 wine 这一个包就能补齐缺口，成本远低于新建设施。若 wine 路径在项目打包脚本化后仍不稳定，重开本 ADR 切换。
- **只发 zip / 便携包，不做安装器**：否决。需求方确认教会电脑是管理员账号、NSIS per-machine 安装（含桌面快捷方式）是主交付形态（T1 决策 4）。

## Consequences

- **打包命令固化**：`npx electron-builder --win --x64`（nsis + portable 双 target，配置见 spike `package.json` 的 `build` 字段，项目沿用同结构写入 `build/`）。产物为 `*-Setup-x.y.z.exe`（NSIS）与 `*-Portable-x.y.z.exe`（便携）。
- **本机依赖**：Node（任意现代版）、electron-builder 26.x、**wine64**（NSIS 链接必需）。spike 失败点：build3.log 中 electron-builder 已完成 `packaging platform=win32 arch=x64`、下载 `nsis-3.0.4.1.7z`/`nsis-resources-3.4.1.7z` 并产出 67MB 的 `*-x64.nsis.7z` 应用包，随后 `⨯ wine process failed ENOENT`——即差的是系统包 wine（如 `dnf install wine`，64 位），装上后重跑即可出最终 Setup exe。
- **exe 元数据在 Linux 上可行，无需手工 rcedit**：build3/build4.log 均有 `updating asar integrity executable resource executablePath=dist/win-unpacked/ShengYanTouPing-Spike.exe` 与 `signing with signtool.exe path=...`（主 exe 与 `resources/elevate.exe` 各一次），步骤全部通过——electron-builder 26 在 Linux 上用自带 7za/PE 工具完成资源改写与签名调用，不需要 Windows 宿主。
- **portable 目标 spike 未跑完，不许凭记忆标"已验证"**：build4.log TEST B 停在 `signing with signtool.exe path=dist/win-unpacked/resources/elevate.exe` 之后无退出码行，dist/ 里也没有 `*-Portable-*.exe`（宿主机中断）。portable 走 NSIS 机器，装 wine 后与 NSIS 一起补测。zip 目标（TEST A）已完整验证可作应急分发产物。
- **产物验收流程（M4）**：win-unpacked/Setup exe 在断网 Win7 SP1 x64 VM 与 Win10 x64 VM 各装一次（portable 免装直跑一次），双显示器环境全流程过一遍；spike 只证明了"能构建"，未在 Windows 上运行过任何产物。
- **spike 原始日志里的路径是 `/root/spikes/...`**（宿主机故障前首次运行的位置），产物已随故障恢复迁移到 `/data/spikes/e22-cross-build/`；本项目此后所有构建产物一律落在 `/data`，禁止写入 /root（磁盘教训）。
