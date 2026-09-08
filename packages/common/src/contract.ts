/**
 * 跨进程共享契约：主进程（@ocs-desktop/app）与渲染进程（@ocs-desktop/web）共同依赖的
 * 类型定义集中于此，保证依赖方向单向为 app → common ← web。
 *
 * 本文件仅包含类型（type/interface），不产生运行时代码，可安全用于浏览器环境。
 */
import type { AxiosRequestConfig } from 'axios';
import type { LaunchOptions } from 'playwright-core';
import type { AutomationScript } from './scripts/script';
import type { Config } from './scripts/interface';
import type { UpdateInformationResource } from './api';
import type { getValidBrowsers } from './utils/valid.browser';

/** 应用持久化存储结构（主进程 electron-store 与渲染进程共享） */
export interface AppStore {
	name: string;
	version: string;
	/** 路径数据 */
	paths: {
		'app-path': string;
		'user-data-path': string;
		'exe-path': string;
		'logs-path': string;
		'config-path': string;
		/** 浏览器用户数据文件夹 */
		userDataDirsFolder: string;
		/** 浏览器下载文件夹 */
		downloadFolder: string;
		/** 加载拓展路径 */
		extensionsFolder: string;
	};
	/** 窗口设置 */
	window: {
		/** 窗口置顶 */
		alwaysOnTop: boolean;
		/** 开机自启 */
		autoLaunch: boolean;
		/** 后台运行：关闭窗口时自动隐藏到系统托盘，浏览器保持运行 */
		hideToTrayOnClose: boolean;
	};
	/** 本地服务器数据 */
	server: {
		port: number;
		authToken: string;
	};
	/** 渲染进程数据（磁盘上可能为加密后的字符串，由主进程解密） */
	render: { [x: string]: any };
}

/** 用户脚本（渲染进程持久化结构） */
export interface UserScripts {
	id: number;
	/** 用户脚本链接 */
	url: string;
	/** 启动自动安装脚本 */
	enable: boolean;
	/**
	 * 脚本信息
	 */
	info: any;
	/** 是否为本地脚本 */
	isLocalScript: boolean;
	/** 是否为网络链接加载的脚本 */
	isInternetLinkScript: boolean;
	/** 上次成功安装到浏览器的版本，undefined 表示从未通过 OCS 安装过 */
	lastInstalledVersion?: string;
	/** 脚本信息上次更新时间（最新版本、描述等信息），0 表示从未更新 */
	lastInfoUpdateTime?: number;
}

/** 自动化脚本的纯数据形态（跨进程传输时丢失方法/事件，仅保留数据字段） */
export type RawAutomationScript = Pick<AutomationScript, 'configs' | 'name' | 'icon'>;

/** 批量预下载用户脚本的单项结果 */
export interface DownloadUserscriptResult {
	url: string;
	path: string;
	success: boolean;
	error?: string;
}

/**
 * 主进程 methods 远程调用契约。
 * 实现见 @ocs-desktop/app src/tasks/remote.register.ts（const methods: RemoteMethods）。
 */
export interface RemoteMethods {
	autoLaunch: () => void;
	get: (url: string, config?: AxiosRequestConfig<any> | undefined) => Promise<any>;
	getWithStatus: (url: string, config?: AxiosRequestConfig<any> | undefined) => Promise<{ status: number; data: any }>;
	post: (url: string, config?: AxiosRequestConfig<any> | undefined) => Promise<any>;
	download: (channel: string, url: string, dest: string) => Promise<string>;
	zip: (input: string, output: string) => Promise<void>;
	unzip: (input: string, output: string) => Promise<void>;
	getValidBrowsers: typeof getValidBrowsers;
	getBrowserMajorVersion: (executablePath: string) => number | undefined;
	getExtensionPaths: (extensionsFolder: string) => string[];
	/** 下载并安装内置浏览器，返回安装完成后的可执行文件路径 */
	installBuiltinChrome: () => Promise<string>;
	systemProcesses: () => Promise<any>;
	exportExcel: (excel: { sheetName: string; list: any[] }[], filename: string) => void;
	statisticFolderSize: (dir: string) => Promise<number>;
	// eslint-disable-next-line no-undef
	getPlatform: () => NodeJS.Platform;
	getSystemDark: () => boolean;
	updateApp: (newVersion: UpdateInformationResource) => Promise<void>;
	moveWindowToTop: () => void;
	hideToTray: () => void;
	showMainWindow: () => void;
	quitApp: (code?: number) => void;
	cancelQuit: () => void;
	destroyTray: () => void;
	resetApp: () => void;
	isEncryptionAvailable: () => boolean;
	isDirectory: (path: string) => boolean;
	getRawScripts: () => RawAutomationScript[];
	encryptRenderString: (plaintext: string) => string;
	decryptRenderString: (encrypted: string) => string;
	saveStore: (plainStoreJson: string, shouldEncrypt: boolean) => void;
	downloadUserscripts: (urls: string[]) => Promise<DownloadUserscriptResult[]>;
}

/** worker 初始化参数中的自动化脚本纯数据形态 */
export type ScriptWorkerAutomationScript = { name: string; configs: Record<string, Config> };

export interface ScriptWorkerBrowserInfo {
	name: string;
	notes: string;
	tags: { color: string; name: string }[];
}

export interface ScriptWorkerBrowserConfig {
	/** 是否启用弹窗 */
	enable_dialog?: boolean;
	/** 是否启用浏览器界面预览（Page.startScreencast 推流） */
	screenshot_preview?: boolean;
}

export interface ScriptWorkerLangs {
	error_when_executable_not_found?: string;
	error_when_browser_version_too_high?: string;
	error_when_browser_launch_failed_too_fast?: string;
	error_when_extension_version_too_low?: string;
	error_when_playwright_selector_timeout?: string;
	error_when_extension_not_found?: string;
}

export interface ScriptWorkerInitOptions {
	store: AppStore;
	uid: string;
	cachePath: string;
	automationScripts: ScriptWorkerAutomationScript[];
	browserInfo: ScriptWorkerBrowserInfo;
	config: ScriptWorkerBrowserConfig;
	langs: ScriptWorkerLangs;
}

export type ScriptWorkerLaunchOptions = Required<Pick<LaunchOptions, 'executablePath' | 'headless' | 'args'>> & {
	userDataDir: string;
	userscripts: string[];
	/** 总共启用的用户脚本数量（用于区分"无脚本"和"无需更新"） */
	enabledScriptCount: number;
};

export interface ScreencastOptions {
	everyNthFrame?: number;
	maxWidth?: number;
	maxHeight?: number;
	quality?: number;
}

/**
 * 脚本工作进程（worker）调用契约。
 * 实现见 @ocs-desktop/app src/worker/index.ts（class ScriptWorker implements ScriptWorker）。
 */
export interface ScriptWorker {
	init(options: ScriptWorkerInitOptions): void;
	launch(options: ScriptWorkerLaunchOptions): Promise<void>;
	close(): Promise<void>;
	bringToFront(): Promise<void>;
	startScreencast(opts?: ScreencastOptions): Promise<void>;
	pauseScreencast(): Promise<void>;
	stopScreencast(): Promise<void>;
	kill(): void;
	debug(...msg: any[]): void;
	warn(...msg: any[]): void;
	info(...msg: any[]): void;
	error(...msg: any[]): void;
}
