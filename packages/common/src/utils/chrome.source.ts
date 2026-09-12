/**
 * 内置浏览器（Chrome for Testing）下载源常量模块。
 *
 * 137 版本后谷歌禁止使用命令行加载插件，因此内置浏览器版本严格锁定、手动更新。
 * 安装包不再内置浏览器，首次启动时按「国内镜像 → 官方 → 自建 CDN」优先级下载。
 *
 * 升级浏览器版本时需同步修改：
 * 1. BUILTIN_CHROME_VERSION — 版本号
 * 2. BUILTIN_CHROME_SHA256 — 四平台 zip 哈希（通过 scripts/chrome.install.js 维护脚本计算产出）
 */

/** 内置 Chrome for Testing 版本（严格锁定，手动更新） */
export const BUILTIN_CHROME_VERSION = '137.0.7151.55';

/**
 * Chrome for Testing 官方平台标识。
 * 注意与 @puppeteer/browsers 的平台标识（win64/mac/mac_arm/linux）不同。
 */
export type CftPlatform = 'win64' | 'mac-x64' | 'mac-arm64' | 'linux64';

/**
 * 四平台 zip 的 SHA256。
 * 实测自官方源（storage.googleapis.com/chrome-for-testing-public），
 * npmmirror 为字节级镜像，哈希与官方一致。
 */
export const BUILTIN_CHROME_SHA256: Record<CftPlatform, string> = {
	win64: '186efa65df60a8062ff4e7f8430c860b8ef0d298db160d973b68dfe430e9e48a',
	'mac-x64': '1342558af92f8d8f9cb26c4504f9d49b63c0b1d6fe06485c2e01c763a67deb44',
	'mac-arm64': '582745f2cc1f61c77323c07c156ae7a991b8033eaaf6f7ab21b7f127ff9ffd00',
	linux64: 'ffedd41a261f26e2e60e5d1692e0955c292caffafd15865344d21b845554a3d4'
};

/** 将 Node 进程平台/架构解析为 CfT 官方平台标识 */
export function resolveCftPlatform(
	// eslint-disable-next-line no-undef
	platform: NodeJS.Platform = process.platform,
	arch: string = process.arch
): CftPlatform {
	if (platform === 'win32' && arch === 'x64') return 'win64';
	if (platform === 'darwin' && arch === 'x64') return 'mac-x64';
	if (platform === 'darwin' && arch === 'arm64') return 'mac-arm64';
	if (platform === 'linux' && arch === 'x64') return 'linux64';
	throw new Error(`内置浏览器不支持的平台: ${platform}-${arch}`);
}

/** 下载源类型 */
export type ChromeDownloadSourceType = 'npmmirror' | 'official' | 'ocs-cdn';

export interface ChromeDownloadSource {
	type: ChromeDownloadSourceType;
	/** 展示名称（用于进度提示与日志） */
	name: string;
	url: string;
}

/**
 * 内置浏览器下载源列表，按优先级排序：国内镜像 → 谷歌官方 → OCS 自建 CDN。
 *
 * 自建 CDN 文件由 scripts/chrome.install.js 维护脚本产出后手动上传，
 * 文件不存在时服务器返回 404，下载器会视为失败并自动切换下一源。
 */
export function getChromeDownloadSources(
	version: string = BUILTIN_CHROME_VERSION,
	platform: CftPlatform = resolveCftPlatform()
): ChromeDownloadSource[] {
	const filename = `chrome-${platform}.zip`;
	return [
		{
			type: 'npmmirror',
			name: '国内镜像源',
			url: `https://registry.npmmirror.com/-/binary/chrome-for-testing/${version}/${platform}/${filename}`
		},
		{
			type: 'official',
			name: '谷歌官方源',
			url: `https://storage.googleapis.com/chrome-for-testing-public/${version}/${platform}/${filename}`
		},
		{
			type: 'ocs-cdn',
			name: 'OCS 自建源',
			url: `https://cdn.ocsjs.com/resources/chrome/${version}/cdn/${platform}/${filename}`
		}
	];
}
