# T1r 任务单（恢复执行）：完成 technical-plan v2 终稿

- 提出人：Hermes（PM）
- 执行人：Qoder
- 日期：2026-10-11
- 背景：T1 执行到一半遭遇宿主机故障中断。已完成的半成品：docs/adr/0001、docs/adr/0003（未提交）、/data/spikes/e22-cross-build 实测 spike（有产物）；未完成：technical-plan.md 本体仍是 v1、缺 P0-2/P0-3/P0-4/修订记录/T1b 整合。**本单把 T1+T1b 合并为一次收尾，验收以本单为准。**
- 性质：只改文档（docs/），可引用 spike 已有产物做结论，不写产品代码；spike 补充实验允许（用 /data/spikes/，禁用 /root 与系统盘路径）

## 必做清单

### 1. P0-2「打包管线」章节（写入 §9 或新增小节）
基于 `/data/spikes/e22-cross-build/` 的实测证据撰写，不许凭记忆：
- 读 build*.log 与 dist/ 产物清单，记录实际结果：electron-builder 在 Linux 交叉构建 Electron 22.3.27 的 win-unpacked、portable exe、signtool 调用均成功的证据（引用日志行）
- NSIS 目标走到哪一步（dist 里有 .nsis.7z 但若无 final .exe，如实写明缺口与补齐方案：如 NSIS 依赖 wine 的具体配置步骤）
- 结论固化为项目打包流程：命令、依赖（wine 是否需要及版本）、产物校验（断网 Win7/Win10 VM 各验一次）
- 把 spike 结论摘要写成 docs/adr/0002-linux-cross-build.md（编号补上缺的 0002，格式用 domain-modeling skill 的 ADR-FORMAT）

### 2. P0-4「投影窗显示器热插拔状态机」
- §3.2 windows.ts 增补：display added/removed 事件 → 投影窗回退主屏全屏 → 重连恢复策略（自动/一键，定一个）
- §11 风险表加对应行；写成 docs/adr/0004-display-hotplug-fallback.md

### 3. P0-3 + T1b 整合进 §2.1/§3.1/§8
- §2.1：搜索框规格改为**仅卷名检索**（全名/简称/拼音首字母三路集合 + 大小写不敏感前缀匹配）；删除"经文关键字"；§8 删除 100 万字符 indexOf 扫描相关论述
- §3.1：挂接 ADR-0003 的归一化规则 N1–N6；拼音三路索引方案（pinyin-initials.json 手工映射表）写入
- 测试策略：并入 T1b 的验收断言全集（s/sp/l/lq/gldqs/mk/mkfy/mt/yh/qsl + 反向断言"经文片段零结果"）

### 4. 收尾
- 文档头部状态改为「v2（终稿待评审）」，新增「修订记录」表：v1→v2 每行对应 T1/T1b/T1r 条目
- `git add docs/ && git commit -m "docs: plan v2 final (T1r: completes T1+T1b, spike-based packaging, hotplug ADR)" && git push origin main`
- 输出：修订摘要 + commit hash

## 禁止
- 不动 data/、src/、.qoder/skills；不在 /root 下建任何构建产物（磁盘教训）
