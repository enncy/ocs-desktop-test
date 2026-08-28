import { ChildProcess } from 'child_process';
import { remote } from './remote';
import { t, store } from '../store';
import { LaunchOptions } from 'playwright-core';
import { reactive } from 'vue';
import type { ScriptWorker } from '@ocs-desktop/app';
import { Browser } from '../fs/browser';
import { Message } from '@arco-design/web-vue';
import EventEmitter from 'events';
import { child_process } from './node';
import { notify } from './notify';
import { Status } from './statusBar';
import { filterScriptsNeedingInstall, ScriptToInstall } from './script-version';

/** 用户脚本安装结果（由 worker 回传） */
interface InstallResult {
	url: string;
	success: boolean;
	reason?: string;
}

export type RemoteScriptWorker = <W extends keyof ScriptWorker = keyof ScriptWorker>(
	event: W,
	...args: ScriptWorker[W] extends { (...args: any[]): any } ? Parameters<ScriptWorker[W]> : any[]
) => void;

/**
 * 运行进程
 */
export class Process extends EventEmitter {
	uid: string;
	shell?: ChildProcess;
	worker?: RemoteScriptWorker;
	/** 状态 */
	status: 'closed' | 'closing' | 'launching' | 'launched' = 'closed';
	/** 浏览器实体信息 */
	browser: Browser;
	/** 浏览器启动参数 */
	launchOptions: Required<LaunchOptions>;
	/** 输出 */
	logs: string[] = [];

	/** 当前预览帧的 Blob URL（由 worker screencast 推流更新） */
	frameUrl: string = '';
	/** 上一帧 Blob URL，用于更新前 revoke 避免内存泄漏 */
	private _blobUrl: string = '';

	static from(uid: string) {
		return processes.find((p) => p.uid === uid);
	}

	// 从进程列表中移除
	static remove(uid: string) {
		const index = processes.findIndex((p) => p.uid === uid);
		if (index !== -1) {
			processes.splice(index, 1);
		}
	}

	constructor(browser: Browser, launchOptions: LaunchOptions) {
		super();
		this.browser = browser;
		this.uid = browser.uid;
		this.launchOptions = launchOptions as any;
	}

	/**
	 * 使用 child_process 运行 ocs 命令
	 */
	async init(onConsole?: (data: any) => void) {
		this.shell = child_process.fork(
			await remote.path.call('join', await remote.app.call('getAppPath'), './script.js'),
			{
				stdio: ['ipc'],
				env: process.env
			}
		);
		this.worker = createRemoteScriptWorker(this.shell);

		this.shell.stdout?.on('data', (data: any) => {
			this.logs.push(data.toString());
			onConsole?.(data.toString());
		});
		this.shell.stderr?.on('data', (data: any) => {
			onConsole?.(data.toString());
			remote.logger.call('error', String(data));
			this.logs.push(`${this.browser.name} 错误`, data);
			notify(`${this.browser.name} 错误`, data, this.browser.uid, {
				duration: 60 * 1000,
				copy: true,
				type: 'error'
			});
		});

		/** 监听器 */
		const listeners: Record<string, (...args: any[]) => void> = {
			/** 浏览器启动 */
			launched: async () => {
				this.status = 'launched';
			},
			/**
			 * 浏览器关闭
			 * 可以由 browser.close() 关闭
			 * 或者进程主动触发
			 */
			/** 预览帧到达（worker screencast 推流，base64 直传） */
			'screencast-frame': (_uid: string, base64: string) => {
				this.setFrame(base64);
			},
			/** 预览清理 */
			'screencast-cleared': () => {
				this.clearFrame();
			},
			/**
			 * 浏览器关闭
			 * 可以由 browser.close() 关闭
			 * 或者进程主动触发
			 */
			'browser-closed': () => {
				console.log('browser-closed', this.uid);
				this.clearFrame();
				// 从进程列表中移除
				Process.remove(this.uid);
			}
		};

		this.shell.on('message', ({ event, args }: { event: string; args: any[] }) => {
			// 将 shell 的事件共享到当前的对象
			this.emit(event, ...args);
			if (listeners[event]) {
				listeners[event](...args);
			}
		});

		// 初始化进程数据
		this.worker('init', {
			store,
			cachePath: this.browser.cachePath,
			uid: this.uid,
			automationScripts: this.browser.automationScripts,
			browserInfo: {
				name: this.browser.name,
				notes: this.browser.notes,
				tags: this.browser.tags
			},
			config: {
				enable_dialog: store.render.setting.browser.enableDialog,
				screenshot_preview: store.render.setting.browser.screenshotPreview
			},
			langs: store.render.langs as any
		});
	}

	async launchPreCheck() {
		// 检查
		if (!this.launchOptions.executablePath) {
			Message.error('浏览器路径为空，请在软件设置中修改');
			return;
		}

		try {
			const exists = await remote.fs.call('existsSync', this.launchOptions.executablePath);
			if (!exists) {
				Message.error('浏览器路径不存在，请在软件设置中修改');
				return;
			}

			// 脚本检查
			Status.loading('正在检查本地脚本...');
			const enabledUserScripts = store.render.scripts.filter((s) => s.enable);
			for (const s of enabledUserScripts) {
				if (!s.url.startsWith('http')) {
					const res = await remote.fs.call('existsSync', s.info?.code_url || s.url);
					if (!res) {
						notify(
							'本地脚本不存在',
							t('error_when_script_not_found', `本地脚本 ${s.info?.name}：(${s.url})\n不存在，请检查脚本路径`, {
								name: s.info?.name || '',
								url: s.url
							}),
							'process_launch_error_' + s.url,
							{
								duration: 60 * 1000,
								type: 'warning',
								copy: true
							}
						);
					}
				}
			}

			Status.loading('正在检查脚本更新...');
			const scriptsToInstall = await filterScriptsNeedingInstall(enabledUserScripts);
			if (scriptsToInstall.length > 0) {
				Status.loading(`正在启动 ${this.browser.name}（需更新/安装 ${scriptsToInstall.length} 个脚本）...`);
			} else {
				Status.loading(`正在启动 ${this.browser.name}（脚本均为最新，无需更新）...`);
			}
			// 预下载远程脚本 + 构造安装 URL（远程脚本经本地服务器代理，规避网络波动）
			const port = store.server.port || 15319;
			const userscripts: string[] = [];
			const urlToItem = new Map<string, ScriptToInstall>();
			for (const item of scriptsToInstall) {
				const script = item.script;
				if (script.isLocalScript) {
					// 本地脚本：直接通过本地服务器代理（拓展只能拦截 http/https）
					const localPath = script.info?.code_url || script.url;
					const installUrl = `http://localhost:${port}/api/local-userscript?path=${encodeURIComponent(localPath)}`;
					userscripts.push(installUrl);
					urlToItem.set(installUrl, item);
				} else {
					// 远程脚本：主进程预下载到临时文件，再经本地服务器代理给拓展拦截
					const remoteUrl = script.info?.code_url || script.url;
					Status.loading(`正在下载脚本 ${script.info?.name || remoteUrl} ...`);
					const results = await remote.methods.call('downloadUserscripts', [remoteUrl]);
					const r = results?.[0];
					if (r && r.success && r.path) {
						const installUrl = `http://localhost:${port}/api/local-userscript?path=${encodeURIComponent(r.path)}`;
						userscripts.push(installUrl);
						urlToItem.set(installUrl, item);
					} else {
						// 预下载失败：剔除并通知，不更新 lastInstalledVersion（下次重试）
						notify(
							'脚本下载失败',
							`${script.info?.name || remoteUrl} 下载失败：${r?.error || '未知原因'}，本次跳过，下次启动将重试`,
							'download-fail-' + remoteUrl,
							{ duration: 60 * 1000, type: 'warning', copy: true }
						);
					}
				}
			}

			// 接收 worker 回传的安装结果，按成功情况更新 lastInstalledVersion
			this.once('userscript-install-result', (results: InstallResult[]) => {
				for (const r of results || []) {
					const item = urlToItem.get(r.url);
					if (!item) continue;
					if (r.success) {
						item.script.lastInstalledVersion = item.latestVersion;
					} else {
						notify(
							'脚本安装失败',
							`${item.script.info?.name || r.url} 安装失败：${r.reason || ''}，下次启动将重试`,
							'install-fail-' + r.url,
							{ duration: 60 * 1000, type: 'warning', copy: true }
						);
					}
				}
				Status.clear();
			});
			this.shell?.once('exit', () => {
				Status.clear();
			});
			return { userscripts, enabledScriptCount: enabledUserScripts.length };
		} catch (err) {
			Message.error('浏览器路径读取错误 : ' + String(err));
		}
	}

	/** 启动文件 */
	launch() {
		return new Promise<void | number | null>((resolve, reject) => {
			this.status = 'launching';
			this.launchPreCheck()
				.then((result) => {
					if (result) {
						this.once('launched', () => {
							resolve();
						});
						this.shell?.once('exit', (code) => {
							resolve(code);
						});
						this.worker?.('launch', {
							userDataDir: this.browser.cachePath,
							enabledScriptCount: result.enabledScriptCount,
							userscripts: result.userscripts,
							...this.launchOptions
						});
					}
				})
				.catch(reject);
		});
	}

	/** 关闭进程 */
	async close() {
		// 标记为 closing ，使监控页面，以及操作栏的图标可以判断状态
		this.status = 'closing';
		return new Promise<void>((resolve) => {
			this.once('browser-closed', resolve);
			// 关闭进程
			this.worker?.('close');
		});
	}

	/** 显示当前的浏览器  */
	bringToFront() {
		if (this.status === 'launched' && this.launchOptions) {
			const action = `http://localhost:${store.server.port}/ocs-action_bring-to-top`;
			child_process.exec(
				`"${this.launchOptions.executablePath}" --user-data-dir="${this.browser.cachePath}" "${action}"`
			);
			this.worker?.('bringToFront');
			Message.warning('已置顶，如未生效，电脑底部任务栏闪烁的浏览器图标即为置顶浏览器。');
		} else {
			Message.warning('必须先启动文件');
		}
	}

	/**
	 * 设置截图预览（Page.startScreencast）启停，由卡片可见性驱动调用。
	 * 仅在已启动时生效；不可见时暂停推流释放资源，但保留最后一帧，
	 * 重新可见时立即显示旧帧占位，新帧到达后无缝衔接，避免重新等待。
	 */
	setScreencastActive(
		active: boolean,
		opts?: { everyNthFrame?: number; maxWidth?: number; maxHeight?: number; quality?: number }
	) {
		if (this.status !== 'launched') return;
		if (active) {
			this.worker?.('startScreencast', opts);
		} else {
			this.worker?.('pauseScreencast');
		}
	}

	/**
	 * 设置预览帧：base64 -> Blob URL，更新前 revoke 上一帧避免内存泄漏
	 */
	setFrame(base64: string) {
		if (this._blobUrl) URL.revokeObjectURL(this._blobUrl);
		const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
		this._blobUrl = URL.createObjectURL(new Blob([bytes], { type: 'image/jpeg' }));
		this.frameUrl = this._blobUrl;
	}

	/** 清理预览帧 */
	clearFrame() {
		if (this._blobUrl) {
			URL.revokeObjectURL(this._blobUrl);
			this._blobUrl = '';
		}
		this.frameUrl = '';
	}

	toString() {
		return '[Process]';
	}
}

export const processes: Process[] = reactive([]);

/**
 * 创建  ScriptWorker Shell 调用 APi
 * @param shell
 */
function createRemoteScriptWorker(shell: ChildProcess) {
	return <W extends keyof ScriptWorker, F extends ScriptWorker[W]>(
		event: W,
		...args: F extends { (...args: any[]): any } ? Parameters<F> : any[]
	) => {
		if (shell.connected) {
			shell.send({ event, args });
		}
	};
}
