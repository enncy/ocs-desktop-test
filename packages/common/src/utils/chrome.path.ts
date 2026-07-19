import path from 'path';
import { app } from 'electron';

/**
 * 内置 Chrome 解压后的可执行文件相对名（win/darwin/linux），与 init.chrome.ts 解压目标一致。
 */
export const BUILTIN_CHROME_FILENAME =
	process.platform === 'win32'
		? 'chrome.exe'
		: process.platform === 'darwin'
		? 'Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
		: 'chrome';

/**
 * 内置 Chrome 解压根目录。
 *
 * - 打包模式：`resources/bin/chrome`
 *   （electron-builder 的 extraResources 把 `bin/chrome/<platform>-<arch>/` 拍平到此）
 * - 开发模式：`<projectRoot>/bin/chrome/<platform>-<arch>`
 *   （scripts/chrome.install.js 的 pack() 输出到该平台子目录）
 *
 * 平台串 `<platform>-<arch>` 与 chrome.install.js 的 `${PLATFORM || 'win'}-${ARCH || 'x64'}` 保持一致。
 */
export function getBuiltinChromeRoot(): string {
	if (app.isPackaged) {
		return path.join(process.resourcesPath, 'bin', 'chrome');
	}
	const platformName = process.platform === 'win32' ? 'win' : process.platform === 'darwin' ? 'mac' : 'linux';
	// dev 下 app.getAppPath() 为 packages/app，../.. 回到项目根目录
	return path.join(app.getAppPath(), '..', '..', 'bin', 'chrome', `${platformName}-${process.arch}`);
}

/**
 * 内置 Chrome 运行时可执行路径（init.chrome.ts 解压目标）。
 *
 * 打包后 `process.resourcesPath` 只读，故 init.chrome.ts 将内置 Chrome 解压到 userData 下可写目录：
 * `<userData>/bin/chrome/chrome/<BUILTIN_CHROME_FILENAME>`。本函数返回该路径，供
 * `getValidBrowsers()` 探测、使「软件内置浏览器」出现在设置-浏览器路径列表中。
 */
export function getBuiltinChromeRuntimePath(): string {
	return path.join(app.getPath('userData'), 'bin', 'chrome', 'chrome', BUILTIN_CHROME_FILENAME);
}
