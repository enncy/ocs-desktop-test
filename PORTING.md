# 更新/打包系统改造 · 移植清单（fork 验证 → 正式项目）

> 本文汇总 fork（ocs-desktop-test）验证期间对 **electron-updater 更新体系 + 发布流水线** 的全部改动，供移植回正式仓库使用。
> 验证通过的机制：4 平台打包、COS 上传（全球加速）、审批闸门发布、release-please 全自动发版、markdown 更新日志、启动崩溃/图标修复。

---

## 一、必须移植的代码修复（3 个真实 bug）

### 1.1 打包后启动崩溃：`common` 被外部化但 `lib/` 不存在

**现象**：安装后启动报 `Cannot find module .../node_modules/@ocs-desktop/common/lib/index.js`。
**原因**：`electron.vite.config.ts` 的 alias 指向 common 源码，但 `externalizeDepsPlugin()` 在 alias 之前把 `@ocs-desktop/common`（在 dependencies 中）标记为外部依赖；而 `lib/`（tsc 产物）被 gitignore 且构建链从不编译它。
**修复**（`packages/app/electron.vite.config.ts`）：

```ts
main: {
	// common 必须排除出外部化：否则产物保留 require('@ocs-desktop/common')，
	// 运行时去 node_modules 找 lib/index.js（构建链不产出）导致启动崩溃
	plugins: [externalizeDepsPlugin({ exclude: ['@ocs-desktop/common'] })],
	...
}
```

效果：common 源码经 alias 直接打进 `out/main` bundle，彻底摆脱对 `lib/` 的依赖。

### 1.2 安装包/启动图标丢失

**原因**：`electron.builder.json` 引用 `public/favicon.{png,ico,icns}`，但 `packages/app/public/` 不存在（图标实际在 `packages/web/public/`）；且运行时代码 `path.resolve('./public/favicon.ico')`（`window.ts`、`tray.ts`）也依赖该目录。
**修复**：复制 3 个图标到 `packages/app/public/` 并**强制提交**（该目录被模板 `.gitignore` 的 `public/` 规则忽略）：

```bash
mkdir -p packages/app/public
cp packages/web/public/favicon.{ico,png,icns} packages/app/public/
git add -f packages/app/public/
```

### 1.3 lint 修复（CI 会卡）

- `packages/app/src/worker/index.ts`：`new Promise((r) => ...)` → `(resolve)`（`promise/param-names` 规则）；
- 若干文件 Prettier 格式化（`pnpm lint` 全量过一遍即可）。

---

## 二、CI/CD 发布链（`.github/workflows/`）

### 2.1 `build.yml` — 常量集中管理

workflow 顶部统一 `env:`，移植时**只需改这几行的值**：

```yaml
env:
  # 腾讯云 COS（非机密；机密仅需 secrets.TENCENT_SECRET_ID / TENCENT_SECRET_KEY）
  COS_BUCKET: ocs-1301696006
  COS_REGION: ap-guangzhou
  # 全球加速 endpoint：GitHub runner（美国）→ 国内跨境链路慢且部分 runner 路由不通，
  # 走加速域名经腾讯骨干网回源（需 COS 控制台开启全球加速；coscmd 的 -r 与 -e 二选一）
  COS_ENDPOINT: cos.accelerate.myqcloud.com
  # COS 目标目录（生产值）
  COS_DOWNLOAD_DIR: /app/download/
  COS_UPDATER_DIR: /app/electron-updater/
  # coscmd 调优：跨境慢链路下 16MB 分片单片 2-4 分钟会被服务端 UserNetworkTooSlow 踢断，
  # 4MB 分片约 30s 完成；低并发保证单流带宽；120s 快速失败避免坏路由空等 10 分钟
  COS_THREAD_NUM: "3"
  COS_PART_SIZE: "4"
  COS_RETRY: "10"
  COS_TIMEOUT: "120"
```

三处 `coscmd config` 统一引用变量，且用 `-e "$COS_ENDPOINT"` 替代 `-r`：

```bash
coscmd config -a ${{ secrets.TENCENT_SECRET_ID }} \
  -s ${{ secrets.TENCENT_SECRET_KEY }} \
  -b "$COS_BUCKET" \
  -e "$COS_ENDPOINT" \
  -m "$COS_THREAD_NUM" -p "$COS_PART_SIZE" \
  --retry "$COS_RETRY" --timeout "$COS_TIMEOUT"
```

### 2.2 `build.yml` — latest.yml 审批闸门（核心新能力）

原理：**客户端只轮询 latest.yml**，安装包/blockmap/CHANGELOG 提前上传无害。把发布链最后一步拆开：

| Job | 内容 | 时机 |
|---|---|---|
| `upload-cos` | 安装包 → `$COS_DOWNLOAD_DIR$VERSION/` | 自动 |
| `upload-changelog` | CHANGELOG.md → `$COS_UPDATER_DIR` | 自动 |
| `upload-electron-updater` | 安装包 + blockmap（**glob 中去掉 `latest*.yml`**） | 自动 |
| `publish-update` | **只传 `artifacts/latest*.yml`** | **人工审批** |

`publish-update` 关键配置：

```yaml
publish-update:
  needs: upload-electron-updater
  if: startsWith(github.ref, 'refs/tags/')
  runs-on: ubuntu-latest
  environment: publish-update   # ← 闸门
  steps: # download-artifact → coscmd config → 上传 artifacts/latest*.yml
```

**配套一次性操作**：仓库 Settings → Environments → 新建 `publish-update` → 勾选 Required reviewers。
之后每次发版停在 "Review deployments"，Approve 才发布更新，Reject 则不发。
注意：CI artifacts 保留 3 天，审批需在构建后 3 天内完成。

### 2.3 `release-pr.yml` — 防重复发版竞态（重要）

**事故**：合并 Release PR 时，`release-pr.yml`（push 触发）与 `release-tag.yml`（PR closed 触发）同时跑，前者执行时新 tag 尚未创建，release-please 全量重扫历史 commit，凭空生成内容重复的下一版本 PR。
**修复**：跳过合并 Release PR 产生的 push——

```yaml
jobs:
  release-pr:
    if: ${{ !contains(github.event.head_commit.message, 'release-please--branches') }}
    runs-on: ubuntu-latest
```

### 2.4 release-please 两个 workflow 用内置 GITHUB_TOKEN

`secrets.RELEASE_PLEASE_TOKEN` → `secrets.GITHUB_TOKEN`（共 3 处：release-pr.yml 1 处、release-tag.yml 2 处）。
成立条件：发布链靠**真人合并 PR** + `gh workflow run`（workflow_dispatch 是 GITHUB_TOKEN 限制的例外）。无需再配置 PAT。
副作用：机器人开的 Release PR 不触发 CI 检查，无分支保护时直接合并即可。

### 2.5 actions 全部升级到 Node 24 运行时

| Action | 版本 | | Action | 版本 |
|---|---|---|---|---|
| checkout | v5 | | cache | v6 |
| setup-node | v7 | | upload-artifact | v7 |
| pnpm/action-setup | v6 | | download-artifact | v8 |
| release-please-action | v5 | | | |

### 2.6 `release-please-config.json`

首发 3.0.0 时曾加 `"release-as": "3.0.0"`（一次性），发布后**必须删除**，否则后续版本被强制锁定。正式仓库 manifest 若已是 3.x 则不需要此配置。

---

## 三、fork 专用值 vs 生产值对照（移植时勿带错）

| 配置项 | fork 验证值 | 生产值 |
|---|---|---|
| `COS_DOWNLOAD_DIR` | `/app/test/download/` | `/app/download/` |
| `COS_UPDATER_DIR` | `/app/test/electron-updater/` | `/app/electron-updater/` |
| `electron.builder.json` publish.url | `.../app/test/electron-updater/` | `.../app/electron-updater/` |
| `updater.ts` DEFAULT_FEED_URL | 同上 | 同上 |
| `upgrader-stub/main.js` UPDATER_BASE_URL | 同上 | 同上 |
| `SettingPanel.vue` 更新源 placeholder | 同上 | 同上 |
| Secrets | 仅需 `TENCENT_SECRET_ID` + `TENCENT_SECRET_KEY` | 同（`COS_BUCKET`/`COS_REGION`/`RELEASE_PLEASE_TOKEN` 均已不需要） |

fork 遗留问题（正式仓库一般不涉及）：历史合并把 git 冲突标记提交进了 `pnpm-lock.yaml` 和 `build.yml` matrix 段，导致 CI 安装失败/workflow 非法——移植前可对正式仓库跑 `grep -rn '^<<<<<<<' .` 排查同类问题。

---

## 四、环境/控制台一次性配置清单

1. **COS 控制台**：开启存储桶全球加速，得到 `cos.accelerate.myqcloud.com` 域名；
2. **GitHub 仓库 Settings → Environments**：新建 `publish-update`，加 Required reviewers（public 仓库免费；private 需付费计划）；
3. **Secrets**：确认仅有 `TENCENT_SECRET_ID` / `TENCENT_SECRET_KEY`；
4. 可选清理：删除不再需要的 `COS_BUCKET`、`COS_REGION`、`RELEASE_PLEASE_TOKEN` secrets。

---

## 五、运维须知（踩过的坑）

- **re-run failed jobs 不更新 workflow 快照**：workflow 文件的修改对已触发的 run 无效，只影响新触发；
- **runner 抽盲盒**：个别 GitHub runner 到国内路由完全不通（ConnectTimeout），re-run 换新 runner 是最有效的解法；加速 endpoint 开启后基本杜绝；
- **CDN 缓存**：`latest.yml`/`CHANGELOG.md` 覆盖后若 CDN 忽略 query 参数缓存，需手动刷新（客户端靠 `?t=时间戳` 防缓存）；
- **Release PR 无 CI**：机器人开的 PR 不触发 `pull_request` 工作流，属预期；
- **审批时限**：artifacts 保留 3 天，`publish-update` 审批别拖过 3 天。
