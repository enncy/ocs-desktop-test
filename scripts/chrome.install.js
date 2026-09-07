/**
 * 内置浏览器维护脚本（独立于构建链，手动运行）。
 *
 * 背景：137 版本后谷歌禁止使用命令行加载插件，内置浏览器锁定 Chrome for Testing 并严格版本控制。
 * 安装包不再内置浏览器，首次启动时由 init.chrome.ts 从远程下载源拉取。
 *
 * 用途：
 * 1. 从 Chrome for Testing 官方源下载指定版本、指定平台的浏览器压缩包
 * 2. 计算并输出 SHA256（填入 packages/common/src/utils/chrome.source.ts 的 BUILTIN_CHROME_SHA256）
 * 3. 按 {platform}/chrome-{platform}.zip 结构产出到 ../.chrome-temp/cdn/，便于手动上传 cdn.ocsjs.com
 *
 * 用法（在 scripts 目录外任意目录运行均可，输出路径基于脚本位置解析）：
 *   node scripts/chrome.install.js [version] [platform]
 *   version  默认 137.0.7151.55
 *   platform ∈ win64 | mac-x64 | mac-arm64 | linux64 | all（默认 all）
 *
 * 升级浏览器版本的完整流程：
 *   1. node scripts/chrome.install.js <新版本> all
 *   2. 将输出的 SHA256 填入 chrome.source.ts（BUILTIN_CHROME_VERSION + BUILTIN_CHROME_SHA256）
 *   3. 将 ../.chrome-temp/cdn/ 整个目录上传至 cdn.ocsjs.com 的 resources/chrome/<新版本>/ 下
 */
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_VERSION = '137.0.7151.55';
const ALL_PLATFORMS = ['win64', 'mac-x64', 'mac-arm64', 'linux64'];

const version = process.argv[2] || DEFAULT_VERSION;
const platformArg = process.argv[3] || 'all';
const platforms = platformArg === 'all' ? ALL_PLATFORMS : [platformArg];

for (const p of platforms) {
	if (!ALL_PLATFORMS.includes(p)) {
		console.error(`不支持的平台: ${p}，可选: ${ALL_PLATFORMS.join(' | ')} | all`);
		process.exit(1);
	}
}

const outputRoot = path.resolve(__dirname, '../.chrome-temp/cdn');

/** 从官方源下载并流式计算 SHA256（跟随重定向） */
function downloadWithSha256(url, dest) {
	return new Promise((resolve, reject) => {
		const request = (currentUrl, redirectCount) => {
			https
				.get(currentUrl, (res) => {
					if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
						res.resume();
						if (redirectCount > 5) {
							return reject(new Error('重定向次数过多'));
						}
						return request(res.headers.location, redirectCount + 1);
					}
					if (res.statusCode !== 200) {
						res.resume();
						return reject(new Error(`HTTP ${res.statusCode}`));
					}
					const hash = crypto.createHash('sha256');
					res.on('data', (chunk) => hash.update(chunk));
					const writer = fs.createWriteStream(dest);
					res.pipe(writer);
					writer.on('finish', () => resolve(hash.digest('hex')));
					writer.on('error', reject);
					res.on('error', reject);
				})
				.on('error', reject);
		};
		request(url, 0);
	});
}

async function main() {
	console.log(`Chrome for Testing 版本: ${version}`);
	console.log(`目标平台: ${platforms.join(', ')}`);
	console.log(`产出目录: ${outputRoot}\n`);

	const results = {};

	for (const platform of platforms) {
		const filename = `chrome-${platform}.zip`;
		const url = `https://storage.googleapis.com/chrome-for-testing-public/${version}/${platform}/${filename}`;
		const destDir = path.join(outputRoot, platform);
		const dest = path.join(destDir, filename);

		fs.mkdirSync(destDir, { recursive: true });

		console.log(`[${platform}] 下载中: ${url}`);
		const sha256 = await downloadWithSha256(url, dest);
		results[platform] = sha256;
		console.log(`[${platform}] 完成: ${dest}`);
		console.log(`[${platform}] SHA256: ${sha256}\n`);
	}

	console.log('将以下哈希填入 packages/common/src/utils/chrome.source.ts 的 BUILTIN_CHROME_SHA256：\n');
	for (const platform of platforms) {
		const key = platform.includes('-') ? `'${platform}'` : platform;
		console.log(`\t${key}: '${results[platform]}',`);
	}
	console.log(`\n并将 BUILTIN_CHROME_VERSION 更新为 '${version}'`);
	console.log(`最后将 ${outputRoot} 整个 cdn 目录上传至 cdn.ocsjs.com 的 resources/chrome/${version}/ 下。`);
}

main().catch((e) => {
	console.error('维护脚本执行失败:', e);
	process.exit(1);
});
