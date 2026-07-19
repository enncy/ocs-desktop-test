import { existsSync } from 'fs';
import { join } from 'path';
import { ValidBrowser } from '../interface';
import os from 'os';
import 'electron';
import { BUILTIN_CHROME_FILENAME, getBuiltinChromeRuntimePath } from './chrome.path';

// 获取可用浏览器路径
export function getValidBrowsers(): ValidBrowser[] {
	switch (os.platform()) {
		case 'darwin': {
			return [
				{
					name: '软件内置浏览器-谷歌(Chrome)',
					path: resolveBuiltinBrowserPath()
				}
			].filter((b) => b.path) as ValidBrowser[];
		}
		case 'win32': {
			return [
				{
					name: '软件内置浏览器-谷歌(Chrome)',
					path: resolveBuiltinBrowserPath()
				},
				{
					name: '微软浏览器(Microsoft Edge)',
					path: resolveBrowserPath('Microsoft\\Edge\\Application\\msedge.exe')
				},
				{
					name: '谷歌浏览器(Chrome)',
					path: resolveBrowserPath('Google\\Chrome\\Application\\chrome.exe')
				}
			].filter((b) => b.path) as ValidBrowser[];
		}
		default: {
			return [];
		}
	}
}

/**
 * 解析内置 Chrome 运行时路径。
 *
 * 优先探测 init.chrome.ts 解压到 userData 的可执行文件（打包后 resourcesPath 只读，
 * 实际运行时副本位于 userData）；回退到历史 resourcesPath 布局以兼容旧版本解压位置。
 */
function resolveBuiltinBrowserPath() {
	return [
		getBuiltinChromeRuntimePath(),
		join(process.resourcesPath, 'bin', 'chrome', 'chrome', BUILTIN_CHROME_FILENAME)
	].find((p) => existsSync(p));
}

function resolveBrowserPath(commonPath: string) {
	return [
		join(process.resourcesPath, commonPath),
		...(process.platform === 'win32'
			? [
					// @ts-ignore
					join(process.env.ProgramFiles, commonPath),
					// @ts-ignore
					join(process.env['ProgramFiles(x86)'], commonPath),
					join('C:\\Program Files', commonPath),
					join('C:\\Program Files (x86)', commonPath)
			  ]
			: [])
	].find((p) => existsSync(p));
}
