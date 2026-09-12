const { series } = require('gulp');
const { rmSync, existsSync } = require('fs');
const { execOut } = require('./utils');

// electron-vite 一次构建 main + renderer（含 worker 双入口），随后 electron-builder 打包
function buildApp() {
	return execOut('pnpm dist', { cwd: '../packages/app' });
}

/**
 * 清理上次构建失败遗留的 win-unpacked.tmp（及 lockfile 目录）。
 *
 * Windows 下残留该目录时，electron-builder 会删除并立刻重建同名目录；若杀软/索引器/
 * 文件监视器仍持有其中文件的句柄，目录会处于 delete-pending 状态，导致 extractArchive
 * 的 rename 步骤 EPERM（现象：构建前手动删除该目录即可成功，此处将该操作自动化）。
 * 删除后稍作等待，让占用方释放句柄。
 */
async function cleanUnpackedTmp() {
	const leftovers = [
		// 构建产物输出目录（仓库根 releases/，已加入 VS Code watcher 排除，规避文件监视导致的 rename EPERM）
		'../releases/win-unpacked.tmp',
		'../releases/win-unpacked.tmp.lock',
		// 兼容清理历史遗留的 dist/ 残留
		'../packages/app/dist/win-unpacked.tmp',
		'../packages/app/dist/win-unpacked.tmp.lock'
	];
	for (const dir of leftovers) {
		for (let attempt = 1; attempt <= 5 && existsSync(dir); attempt++) {
			try {
				rmSync(dir, { recursive: true, force: true });
				// 等待 delete-pending 句柄释放
				await new Promise((resolve) => setTimeout(resolve, 1000));
			} catch (err) {
				console.warn(`清理 ${dir} 失败（第 ${attempt} 次），1 秒后重试: ${err.message}`);
				await new Promise((resolve) => setTimeout(resolve, 1000));
			}
		}
		if (existsSync(dir)) {
			console.warn(`警告: ${dir} 仍被占用，构建可能因 EPERM 失败，请在资源监视器中检查该目录的占用进程`);
		}
	}
}

// 精简版构建：安装包不再内置浏览器压缩包，首次启动时由 init.chrome.ts 从远程下载源拉取
//
// 自动更新已迁移至 electron-updater：构建后 dist/ 会产出 latest.yml / *.exe / *.blockmap，
// 发布时将三者上传至 electron.builder.json 中 publish.url 对应目录（https://cdn.ocsjs.com/app/electron-updater/）。
// 旧版客户端（zip 热更新机制）由 upgrader-stub 引导包负责升级，见 scripts/build-upgrader-stub.js。
exports.default = series(cleanUnpackedTmp, buildApp);
