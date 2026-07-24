import { ipcMain, app, dialog, BrowserWindow, safeStorage, nativeTheme } from 'electron';
import { Logger } from '../logger';
import { autoLaunch } from './auto.launch';
import axios, { AxiosRequestConfig } from 'axios';
import { downloadFile, moveWindowToTop, unzip, zip } from '../utils';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { OCSApi, getValidBrowsers } from '@ocs-desktop/common';
import si from 'systeminformation';
import { store } from '../store';
import { exportExcel } from '../utils/index';
import { readdir, stat } from 'fs/promises';
import { updateApp } from './updater';
import { AutomationScripts } from '../scripts';
import { AutomationScript } from '../scripts/script';
import { getBrowserMajorVersion, getExtensionPaths } from '../utils/browser';
import { AppStore } from '../../types';
import { encryptRenderString, decryptRenderString } from '../crypto';
import { hideToTray, showMainWindow, quitApp, cancelQuit, destroyTray } from '../tray';

export type RawAutomationScript = Pick<AutomationScript, 'configs' | 'name'>;

/**
 * 注册主进程远程通信事件
 * @param name 事件前缀名称
 * @param target 事件目标
 */
function registerRemoteEvent(name: string, target: any) {
	const logger = Logger('remote');
	try {
		ipcMain
			.on(name + '-get', (event, [property]) => {
				try {
					// logger.info({ event: name + '-get', args: [property] });
					event.returnValue = target[property];
				} catch (e) {
					event.returnValue = { error: e };
				}
			})
			.on(name + '-set', (event, [property, value]) => {
				try {
					// logger.info({ event: name + '-set', args: [property, value] });
					event.returnValue = target[property] = value;
				} catch (e) {
					event.returnValue = { error: e };
				}
			})

			/** 异步调用 */
			.on(
				name + '-call',
				async (
					event,
					[
						/** 回调id */
						respondChannel,
						property,
						...args
					]
				) => {
					// logger.info({ event: name + '-call', args });
					try {
						const result = await target[property](...args);
						event.reply(respondChannel, { data: result });
					} catch (e) {
						event.reply(respondChannel, { error: e });
					}
				}
			)

			/** 同步调用 */
			.on(name + '-call-sync', (event, [property, ...args]) => {
				// logger.info({ event: name + '-call-sync', args: [property] });
				try {
					const result = target[property](...args);
					event.returnValue = { data: result };
				} catch (e) {
					event.returnValue = { error: e };
				}
			});
	} catch (err) {
		logger.error(err);
	}
}

let win: BrowserWindow | undefined;

/** 需远程共享的方法 */
const methods = {
	autoLaunch,
	get: (url: string, config?: AxiosRequestConfig<any> | undefined) => axios.get(url, config).then((res) => res.data),
	getWithStatus: (url: string, config?: AxiosRequestConfig<any> | undefined) =>
		axios.get(url, { ...config, validateStatus: () => true }).then((res) => ({ status: res.status, data: res.data })),
	post: (url: string, config?: AxiosRequestConfig<any> | undefined) => axios.post(url, config).then((res) => res.data),
	download: (channel: string, url: string, dest: string) => {
		/** 下载文件 */
		return downloadFile(url, dest, (rate: any, totalLength: any, chunkLength: any) => {
			win?.webContents?.send('download', channel, rate, totalLength, chunkLength);
		});
	},
	zip: zip,
	unzip: unzip,
	getValidBrowsers: getValidBrowsers,
	getBrowserMajorVersion: getBrowserMajorVersion,
	getExtensionPaths: getExtensionPaths,
	systemProcesses: () => si.processes(),
	exportExcel: exportExcel,
	statisticFolderSize: statisticFolderSize,
	getPlatform: () => process.platform,
	/** 读取系统当前是否为深色主题（nativeTheme.themeSource 默认 system，跟随 OS） */
	getSystemDark: () => nativeTheme.shouldUseDarkColors,
	updateApp: updateApp,
	moveWindowToTop: moveWindowToTop,
	/** 隐藏主窗口到系统托盘（后台运行） */
	hideToTray: hideToTray,
	/** 显示并聚焦主窗口（从托盘恢复） */
	showMainWindow: showMainWindow,
	/** 程序化退出（置位 isQuitting 后 app.exit，绕过「隐藏到托盘」） */
	quitApp: quitApp,
	/** 取消程序化退出，复位 isQuitting */
	cancelQuit: cancelQuit,
	/** 销毁托盘图标 */
	destroyTray: destroyTray,
	/**
	 * 重置设置并重启：渲染层已同步保存重置后的 store（render.setting + window 等），
	 * 此处仅负责重启。通过 quitApp 程序化退出，绕过「隐藏到托盘」逻辑。
	 */
	resetApp: () => {
		app.relaunch();
		quitApp(0);
	},
	isEncryptionAvailable: () => {
		return safeStorage.isEncryptionAvailable();
	},
	isDirectory: (path: string) => fs.statSync(path).isDirectory(),
	getRawScripts: () => JSON.parse(JSON.stringify(AutomationScripts)) as RawAutomationScript[],
	encryptRenderString,
	decryptRenderString,
	/** 一次性完成加密和存储，避免二次 IPC 调用 */
	saveStore: (plainStoreJson: string, shouldEncrypt: boolean): void => {
		const storeData: AppStore = JSON.parse(plainStoreJson);
		if (shouldEncrypt && safeStorage.isEncryptionAvailable()) {
			// @ts-ignore
			storeData.render = encryptRenderString(JSON.stringify(storeData.render));
		}
		store.store = storeData;
	}
};

export type RemoteMethods = typeof methods;

/**
 * 初始化远程通信
 */
export function remoteRegister(_win: BrowserWindow) {
	win = _win;
	registerRemoteEvent('electron-store', store);
	registerRemoteEvent('fs', fs);
	registerRemoteEvent('os', os);
	registerRemoteEvent('path', path);
	registerRemoteEvent('crypto', crypto);
	registerRemoteEvent('OCSApi', OCSApi);

	registerRemoteEvent('win', _win);
	registerRemoteEvent('webContents', _win.webContents);
	registerRemoteEvent('app', app);
	registerRemoteEvent('dialog', dialog);
	registerRemoteEvent('methods', methods);
	registerRemoteEvent('logger', Logger('render'));

	// 系统深浅色变化时通知渲染层（用于「自动」模式跟随系统，matchMedia 在 Electron 不稳定）
	nativeTheme.on('updated', () => {
		win?.webContents?.send('system-theme-change', nativeTheme.shouldUseDarkColors);
	});
}

const _registerRemoteEvent = registerRemoteEvent;
export { _registerRemoteEvent as registerRemoteEvent };

async function statisticFolderSize(dir: string) {
	const files = await readdir(dir, { withFileTypes: true });

	const paths: Promise<number>[] = files.map(async (file) => {
		const _path = path.join(dir, file.name);
		if (file.isDirectory()) return await statisticFolderSize(_path);

		if (file.isFile()) {
			const { size } = await stat(_path);
			return size;
		}
		return 0;
	});

	return (await Promise.all(paths)).flat().reduce((i, size) => i + size, 0);
}
