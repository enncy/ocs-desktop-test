import { Instance as Chalk } from 'chalk';
import { LoggerCore } from '../logger.core';
import path, { basename } from 'path';
import fs from 'fs';
import { chromium, BrowserContext, Page, LaunchOptions, Response, Request, CDPSession } from 'playwright-core';
import { AppStore } from '../../types';
import { AutomationScripts } from '../scripts/index';
import { Config } from '../scripts/interface';
import _get from 'lodash/get';
import child_process from 'child_process';
import { getBrowserMajorVersion, getExtensionPaths } from '../utils/browser';

const { bgRedBright, bgBlueBright, bgYellowBright, bgGray } = new Chalk({ level: 2 });

type AS = { name: string; configs: Record<string, Config> };

type BrowserInfo = { name: string; notes: string; tags: { color: string; name: string }[] };

type BrowserConfig = {
	/** 是否启用弹窗 */
	enable_dialog?: boolean;
	/** 是否启用浏览器界面预览（Page.startScreencast 推流） */
	screenshot_preview?: boolean;
};

interface Langs {
	error_when_executable_not_found?: string;
	error_when_browser_version_too_high?: string;
	error_when_browser_launch_failed_too_fast?: string;
	error_when_extension_version_too_low?: string;
	error_when_playwright_selector_timeout?: string;
}

/** 脚本工作线程 */
export class ScriptWorker {
	uid: string = '';
	browser?: BrowserContext;
	logger?: LoggerCore;
	/** 拓展路径 */
	extensionPaths: string[] = [];
	/** 执行的自动化程序列表 */
	automationScripts: AS[] = [];
	/** 可关闭的浏览器拓展主页 */
	store?: AppStore;
	/** 浏览器中软件设置的名字 */
	browserInfo?: BrowserInfo;
	config?: BrowserConfig;
	/** Screencast CDP 会话 */
	screencastSession?: CDPSession;
	/** Screencast 监控的目标页面 */
	screencastPage?: Page;
	/** Screencast 参数 */
	screencastParams?: { everyNthFrame: number; maxWidth: number; maxHeight: number; quality: number };
	static langs?: Langs;
	static lang: (key: keyof Langs, def?: string, replace?: Record<string, string>) => string = (key, def, replace) => {
		const result = _get(ScriptWorker.langs, key, def);
		return (replace ? result?.replace(/\{\{(\w+)\}\}/g, (_, k) => replace[k] || '') : result) as string;
	};

	static getTransformedErrorMessage = (error: string, extra_placeholder?: Record<string, string>) => {
		if (error.match(/Timeout .+ exceeded/)) {
			return ScriptWorker.lang(
				'error_when_playwright_selector_timeout',
				'页面元素查找超时，请检查元素是否存在/可见或选择器是否正确。',
				{ error: error, ...extra_placeholder }
			);
		}
		return error;
	};

	init({
		store,
		uid,
		cachePath,
		automationScripts,
		browserInfo,
		config,
		langs
	}: {
		store: AppStore;
		uid: string;
		cachePath: string;
		automationScripts: AS[];
		browserInfo: BrowserInfo;
		config: BrowserConfig;
		langs: Langs;
	}) {
		this.debug('正在初始化进程...');

		this.store = store;
		ScriptWorker.langs = langs;

		this.uid = uid;
		// 拓展文件夹路径
		this.extensionPaths = getExtensionPaths(store.paths.extensionsFolder);

		// 自动化程序
		this.automationScripts = automationScripts;

		// 初始化日志
		this.logger = new LoggerCore(store.paths['logs-path'], false, 'script', path.basename(cachePath));

		// 浏览器中软件设置的名字
		this.browserInfo = browserInfo;
		this.config = config;

		this.debug('初始化成功');
	}

	async launch(
		options: Required<Pick<LaunchOptions, 'executablePath' | 'headless' | 'args'>> & {
			userDataDir: string;
			userscripts: string[];
			/** 总共启用的用户脚本数量（用于区分"无脚本"和"无需更新"） */
			enabledScriptCount: number;
		}
	) {
		if (this.extensionPaths.length) {
			this.debug(
				'加载拓展：',
				this.extensionPaths.map((p) => basename(p))
			);
		} else {
			this.debug('浏览器拓展为空');
		}

		/** 添加拓展启动参数 */
		options.args = formatExtensionArguments(this.extensionPaths);
		const start_time = Date.now();

		/** =============================== 检测谷歌浏览器是否可用 =============================== */
		if (!fs.existsSync(options.executablePath)) {
			console.error(
				ScriptWorker.lang(
					'error_when_executable_not_found',
					`浏览器可执行文件不存在，请在设置中更换浏览器路径。：${options.executablePath}`,
					{ executablePath: options.executablePath }
				)
			);
			return await this.close();
		}

		if (process.platform === 'win32') {
			const major = getBrowserMajorVersion(options.executablePath);
			console.log('major', major);
			if (major && major > 137) {
				console.error(
					ScriptWorker.lang(
						'error_when_browser_version_too_high',
						'当前浏览器版本过高，无法自动加载脚本管理器，请在设置-浏览器路径中切换“软件内置”浏览器，如果没有内置浏览器，请重新在官网下载最新OCS软件并安装'
					)
				);
				return await this.close();
			}
		}

		/** =============================== 检测拓展是否可用 =============================== */
		for (const extensionPath of this.extensionPaths) {
			if (!fs.existsSync(extensionPath)) {
				console.error(`拓展不存在：${extensionPath}`);
				return await this.close();
			}

			if (!fs.existsSync(path.join(extensionPath, 'manifest.json'))) {
				console.error(`拓展格式不正确，缺少manifest.json：${extensionPath}`);
				return await this.close();
			}

			const manifest = JSON.parse(fs.readFileSync(path.join(extensionPath, 'manifest.json'), 'utf-8'));
			// 检查是否为 MV2 拓展，如果是则报错
			if (_get(manifest, 'manifest_version', 2) < 3) {
				const name = getExtensionName(extensionPath);
				console.error(
					ScriptWorker.lang(
						'error_when_extension_version_too_low',
						`该拓展版本较低：{{name}}，请尝试前往软件左侧-应用中心-卸载并重新安装。`,
						{ name }
					)
				);
				return await this.close();
			}
		}

		/** 启动浏览器 */
		try {
			await launchBrowser({
				onLaunch: (browser) => {
					this.browser = browser;

					/** URL事件解析器 */
					this.browser?.on('page', (page) => {
						const match = page.url().match(/ocs-action_(.+)/);
						if (match?.[1]) {
							const action = match[1];
							const actions: any = {
								'bring-to-top': () => {
									// 通过命令行打开此页面后会置顶浏览器，并自动关闭当前事件页面
									page.close();
								}
							};

							actions[action]();
						}
					});

					// 浏览器启动完成
					send('launched');
					// 截图预览的启停交由渲染进程按卡片可见性驱动（Page.startScreencast），
					// 此处不再自启动定时截图，避免不可见卡片浪费资源
				},

				automationScripts: this.automationScripts,
				bookmarksPageUrl: this.store
					? `http://localhost:${this.store?.server.port || 15319}/index.html#/bookmarks?uid=${this.uid}`
					: undefined,
				serverPort: this.store?.server.port || 15319,
				closeableExtensionHomepages: [
					'docs.scriptcat.org',
					'docs.scriptcat.org/docs/change',
					'docs.scriptcat.org/docs/use/open-dev',
					'tampermonkey.net/index.php',
					'tampermonkey.net/changelog.php'
				],
				authToken: this.store?.server.authToken || '',
				browserInfo: this.browserInfo,
				uid: this.uid,
				config: this.config,
				...options
			});
		} catch (err) {
			// 浏览器异常关闭
			if (err instanceof Error) {
				if (
					err.message.includes('browser has been closed') ||
					err.message.includes('Target closed') ||
					err.message.includes('Browser closed')
				) {
					// 5秒内异常关闭，可能是浏览器问题
					if (Date.now() - start_time < 5 * 1000) {
						console.error(
							ScriptWorker.lang(
								'error_when_browser_launch_failed_too_fast',
								'异常启动，请尝试重启浏览器，或者在设置中更换其他浏览器',
								{
									error: err.message.substring(0, 500)
								}
							)
						);
					} else {
						console.error('异常关闭，请尝试重启浏览器。', err.message.substring(0, 500));
					}
					this.close();
				} else {
					console.error('错误 : ', err.message.substring(0, 500));
				}
			} else {
				console.error('未知错误 : ', String(err).substring(0, 500));
			}
		}

		// 浏览器初始化完成
		send('init');
	}

	async close() {
		await this.stopScreencast();
		await this.browser?.close();
		this.browser = undefined;
		send('browser-closed');
		process.exit();
	}

	/**
	 * 选择当前 screencast 监控目标页面：倒序查找非内部页面（chrome:// / about:），
	 * 确保监控的是用户当前关注的页面
	 */
	private pickScreencastPage(): Page | undefined {
		const pages = this.browser?.pages();
		if (!pages || pages.length === 0) return undefined;
		return (
			[...pages].reverse().find((p) => !p.url().startsWith('chrome') && !p.url().startsWith('about:')) || pages.at(-1)
		);
	}

	/**
	 * 启动 Page.startScreencast 推流，帧写入磁盘后由本地服务器提供访问。
	 * 由渲染进程按卡片可见性驱动调用，替代旧的定时截图。
	 * 帧率自适应：页面活跃时按 everyNthFrame 推流，静止时浏览器不合成、自动停推。
	 */
	async startScreencast(opts?: { everyNthFrame?: number; maxWidth?: number; maxHeight?: number; quality?: number }) {
		if (!this.browser) return;

		// 合并参数：优先用 opts，其次沿用已存参数（用于 page 切换重选），最后默认值
		const params = {
			everyNthFrame: opts?.everyNthFrame ?? this.screencastParams?.everyNthFrame ?? 4,
			maxWidth: opts?.maxWidth ?? this.screencastParams?.maxWidth ?? 640,
			maxHeight: opts?.maxHeight ?? this.screencastParams?.maxHeight ?? 360,
			quality: opts?.quality ?? this.screencastParams?.quality ?? 35
		};
		this.screencastParams = params;

		// 先清理旧的 session（page 切换重选场景）
		await this.stopScreencastInternal();

		const page = this.pickScreencastPage();
		if (!page || page.url().startsWith('chrome')) return;

		try {
			const session = await page.context().newCDPSession(page);

			session.on('Page.screencastFrame', ({ data, sessionId }) => {
				// 先 ack，保证浏览器持续推帧（ack 延迟会导致停推）
				session.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
				// 帧直接 IPC 直传渲染进程（base64），不再写盘
				send('screencast-frame', this.uid, data);
			});

			await session.send('Page.startScreencast', {
				format: 'jpeg',
				quality: params.quality,
				maxWidth: params.maxWidth,
				maxHeight: params.maxHeight,
				everyNthFrame: params.everyNthFrame
			});

			this.screencastSession = session;
			this.screencastPage = page;

			// 监控目标页面关闭时自动重选，保证预览连续
			page.once('close', () => this.handleScreencastPageGone());
		} catch {
			// 静默忽略（页面不可截、session 创建失败等）
		}
	}

	/**
	 * 停止 screencast 推流、清理截图文件并通知渲染进程清理预览
	 */
	async stopScreencast() {
		await this.stopScreencastInternal();
		this.screencastParams = undefined; // 标记完全停止
		send('screencast-cleared', this.uid);
	}

	/**
	 * 仅停止 screencast session，不清理文件、不发事件（用于内部切换/重选）
	 */
	private async stopScreencastInternal() {
		if (this.screencastSession) {
			try {
				await this.screencastSession.detach();
			} catch {}
			this.screencastSession = undefined;
		}
		this.screencastPage = undefined;
	}

	/**
	 * 监控目标页面关闭后，延迟重选下一个页面继续推流
	 */
	private handleScreencastPageGone() {
		if (!this.screencastParams) return; // 已主动停止
		// session 随页面关闭已失效，无需 detach
		this.screencastSession = undefined;
		this.screencastPage = undefined;
		setTimeout(() => {
			// 仍在运行且未主动停止则沿用原参数重选
			if (this.screencastParams && this.browser) {
				this.startScreencast();
			}
		}, 500);
	}

	// TODO
	async bringToFront() {
		this.browser?.pages().at(-1)?.bringToFront();
	}

	kill() {
		process.exit();
	}

	debug(...msg: any[]) {
		console.log(bgGray(loggerPrefix()), ...msg);
	}

	warn(...msg: any[]) {
		console.log(bgYellowBright(loggerPrefix()), ...msg);
	}

	info(...msg: any[]) {
		console.log(bgBlueBright(loggerPrefix()), ...msg);
	}

	error(...msg: any[]) {
		console.error(bgRedBright(loggerPrefix()), ...msg);
	}
}

/** 格式化浏览器拓展启动参数 */
function formatExtensionArguments(extensionPaths: string[]) {
	const paths = extensionPaths.map((p) => p.replace(/\\/g, '/')).join(',');
	return paths.length === 0 ? [] : [`--load-extension=${paths}`];
}

function loggerPrefix() {
	return `[OCS] ${new Date().toLocaleTimeString()}`;
}

/**
 * 运行脚本
 */
export async function launchBrowser({
	executablePath,
	headless,
	args,
	userDataDir,
	userscripts,
	enabledScriptCount,
	automationScripts,
	closeableExtensionHomepages,
	bookmarksPageUrl,
	serverPort,
	authToken,
	browserInfo,
	uid,
	config,
	onLaunch
}: Required<Pick<LaunchOptions, 'executablePath' | 'headless' | 'args'>> & {
	/** 用户数据目录 */
	userDataDir: string;
	/** 自定义用户脚本URL */
	userscripts: string[];
	/** 总共启用的用户脚本数量（用于区分"无脚本"和"无需更新"） */
	enabledScriptCount: number;
	/** 可关闭的浏览器拓展主页 */
	closeableExtensionHomepages: string[];
	/** 自动化程序 */
	automationScripts: AS[];
	/** 初始导航页地址 */
	bookmarksPageUrl?: string;
	/** OCS服务器端口 */
	serverPort: number;
	/** 软件辅助权限认证 */
	authToken: string;
	/** 浏览器信息 */
	browserInfo?: BrowserInfo;
	uid: string;
	config?: BrowserConfig;
	onLaunch?: (browser: BrowserContext) => void;
}) {
	return new Promise<void>((resolve, reject) => {
		chromium
			.launchPersistentContext(userDataDir, {
				headless,
				viewport: null,
				executablePath,
				ignoreHTTPSErrors: true,
				acceptDownloads: true,
				ignoreDefaultArgs: ['--disable-extensions', '--enable-automation', '--no-sandbox'],
				args: [
					'--window-position=0,0',
					'--no-first-run',
					'--no-default-browser-check',
					'--allow-file-access-from-files',
					...args
				]
			})
			.then(async (browser) => {
				// 处理浏览器初始
				handleBrowserInit(browser, { enable_dialog: config?.enable_dialog, userDataDir });

				try {
					/**
					 * 显示步骤提示
					 */
					const step = async (tips: string | string[], opts?: { loading?: boolean; warn?: boolean }) => {
						const { loading = true, warn = false } = opts || {};
						await blankPage.evaluate(
							(state) => {
								// @ts-ignore OCS官方导航页自带的方法
								const setState = window.setBookmarkLoadingState;
								if (setState) {
									setState(state);
								} else {
									window.document.body.textContent = state.tips.join('\n');
								}
							},
							{ tips: Array.isArray(tips) ? tips : [tips], loading, warn }
						);
					};

					const [blankPage] = browser.pages();

					// 加载本地导航页
					await blankPage.goto(bookmarksPageUrl || 'about:blank');

					// 打开开发者模式
					await openExtensionDeveloperMode(browser, executablePath.includes('edge'));

					// 必须先打开开发者模式，才能关闭额外拓展页，否则打开开发者模式可能会重启插件，导致出现新的额外页面
					// 关闭拓展加载时弹出的首页
					waitAndCloseExtensionHomepage({ browser, closeableExtensionHomepages });

					// 安装用户脚本
					const warn = await setupUserScripts({ browser, userscripts, step, enabledScriptCount });

					// 监听网络请求
					browserNetworkRoute(authToken, browser);

					// 运行自动化程序
					await runAutomationScripts({ browser, automationScripts, serverPort, step });

					await step(['浏览器初始化完成。'].concat(warn), { loading: false, warn: !!warn.length });

					// 触发onLaunch事件
					onLaunch?.(browser);
					// 启动完成
					resolve();
				} catch (err) {
					reject(err);
				}
			})
			.catch((err) => {
				reject(err);
			});
	});
}

/**
 * 安装/更新脚本
 *
 */
async function initScripts(urls: string[], browser: BrowserContext) {
	console.log('install ', urls);
	let installCont = 0;
	let retryCount = 0;
	const maxRetries = 120;

	// 触发下载
	await (async () => {
		for (const url of urls) {
			const page = await browser.newPage();
			try {
				await Promise.race([page.goto(url).catch(() => {}), sleep(3 * 1000).then(() => page.close())]);
			} catch {}
		}
	})();

	// 检测脚本是否安装/更新完毕
	const tryInstall = async () => {
		if (browser.pages().length !== 0) {
			const installPage = browser.pages().find((p) => /extension:\/\//.test(p.url()));
			if (installPage) {
				// 置顶页面，防止点击安装失败
				await installPage.bringToFront();
				await sleep(1000);
				const closed = await installPage.evaluate(() => {
					const btn = (document.querySelector('[class*="primary"]') ||
						document.querySelector('[type*="button"]')) as HTMLElement;
					// （由渲染进程版本检查过滤），直接点击按钮安装/更新
					btn?.click();
					if (!btn) {
						return false;
					}
				});

				if (!closed) {
					await sleep(1000).then(() => installPage.close());
				}

				if (installPage.isClosed()) {
					installCont++;
				}
				if (installCont < urls.length) {
					retryCount = 0;
					await tryInstall();
				}
			} else if (installCont === urls.length) {
				//
			} else {
				retryCount++;
				if (retryCount > maxRetries) {
					console.error('脚本安装超时，跳过未安装的脚本');
					return;
				}
				await sleep(1000);
				await tryInstall();
			}
		}
	};

	await tryInstall();
}

function send(event: string, ...args: any[]) {
	process.send?.({ event, args });
}

function sleep(t: number) {
	return new Promise((resolve, reject) => setTimeout(resolve, t));
}

/**
 * 将脚本配置转换为可用的对象配置
 * @param configs
 */
function transformScriptConfigToRaw(configs: AS['configs']) {
	const raw = Object.create({});
	for (const key in configs) {
		if (Object.prototype.hasOwnProperty.call(configs, key)) {
			Reflect.set(raw, key, configs[key].value);
		}
	}
	return raw;
}

/**
 * 安装用户脚本
 */
async function setupUserScripts(opts: {
	browser: BrowserContext;
	userscripts: string[];
	step: (tips: string | string[], opts?: { loading?: boolean; warn?: boolean }) => Promise<void>;
	enabledScriptCount: number;
}) {
	const { userscripts, browser, step, enabledScriptCount } = opts;

	const warn: string[] = [];
	// 安装用户脚本
	if (userscripts.length) {
		await step('正在安装用户脚本...（如长时间未完成请尝试重启浏览器 ）');
		// 载入本地脚本
		try {
			await initScripts(userscripts, browser);
		} catch (e) {
			// @ts-ignore
			console.error('脚本安装失败：', e.message);
			// await html('脚本载入失败，请手动更新，或者忽略。' + e.message);
		}
	} else {
		if (enabledScriptCount === 0) {
			warn.push('检测到您的软件中并未开启任何用户脚本，可能会导致预期脚本不运行。');
		}
		// enabledScriptCount > 0 且 userscripts 为空 → 所有脚本均为最新，无需更新，无需提示
	}

	return warn;
}

/**
 * 运行自动化程序
 */
async function runAutomationScripts(opts: {
	browser: BrowserContext;
	serverPort: number;
	automationScripts: AS[];
	step: (tips: string | string[], opts?: { loading?: boolean; warn?: boolean }) => Promise<void>;
}) {
	const { automationScripts, browser, serverPort, step } = opts;

	if (automationScripts.length) {
		// 执行自动化程序
		for (const ps of automationScripts) {
			await step(`正在执行自动化程序 - ${ps.name} ...`);
			const configs = transformScriptConfigToRaw(ps.configs);

			for (const script of AutomationScripts) {
				if (script.name === ps.name) {
					script.on('script-data', (...msg) => console.log(...msg));
					script.on('script-error', (...msg) =>
						console.error('自动化程序错误：', ...msg.map((m) => ScriptWorker.getTransformedErrorMessage(m)))
					);
					try {
						await script.run(await browser.newPage(), configs, {
							ocrApiUrl: `http://localhost:${serverPort}/ocr`,
							ocrApiImageKey: 'image',
							detBackgroundKey: 'det_bg',
							detTargetKey: 'det_target'
						});
					} catch (err) {
						console.error(
							'自动化程序错误：',
							ScriptWorker.getTransformedErrorMessage(err instanceof Error ? err.message : String(err))
						);
					}
					break;
				}
			}
		}
	}
}

/**
 * 关闭浏览器拓展主页
 */
async function waitAndCloseExtensionHomepage(opts: { browser: BrowserContext; closeableExtensionHomepages: string[] }) {
	return new Promise<any>((resolve, reject) => {
		const timeout = setTimeout(() => {
			clearInterval(interval);
			reject(new Error('浏览器拓展加载超时，请尝试重启浏览器，或者查看网络情况。'));
		}, 60 * 1000);
		const interval = setInterval(async () => {
			const includes: Page[] = [];
			for (const page of opts.browser.pages()) {
				// 当拓展主页无法访问时，会跳转到chrome-error://chromewebdata/，此时获取的url为chrome-error://chromewebdata/，而不是拓展主页的url，但是title是拓展主页的host
				const title = page.url() === 'chrome-error://chromewebdata/' ? await page.title() : '';
				if (
					opts.closeableExtensionHomepages.some((homepage) =>
						page.url() === 'chrome-error://chromewebdata/' ? homepage.includes(title) : page.url().includes(homepage)
					)
				) {
					includes.push(page);
				}
			}
			if (includes.length) {
				clearInterval(interval);
				clearTimeout(timeout);
				Promise.all(includes.map(async (page) => page.close()))
					.then(resolve)
					.catch(reject);
			}
		}, 1000);
	});
}

function browserNetworkRoute(authToken: string, browser: BrowserContext) {
	browser.route(/ocs-environment/, async (route) => {
		await route.fulfill({
			status: 200,
			body: JSON.stringify({
				environment: 'playwright'
			})
		});
	});
	browser.route(/ocs-script-actions/, async (route) => {
		const req = route.request();
		if (req.method().toLocaleUpperCase() !== 'POST') {
			return;
		}
		const headerValue = await req.headerValue('auth-token');

		if (headerValue !== authToken) {
			return;
		}

		const { page: targetPageUrl, property, args }: { page: string; property: string; args: any[] } = req.postDataJSON();

		try {
			const page = browser?.pages().find((p) => p.url().includes(targetPageUrl));
			if (!page) {
				return;
			}

			const targetFunction: Function = _get(page, property);
			if (typeof targetFunction !== 'function') {
				return;
			}

			if (property === 'waitForResponse' || property === 'waitForRequest') {
				args[0] = new RegExp(args[0]);
			}

			const res = await targetFunction.apply(
				property.split('.').length > 1 ? _get(page, property.split('.')[0]) : page,
				args
			);
			if (typeof res === 'object') {
				if (property === 'screenshot') {
					const buffer: Buffer = res;
					await route.fulfill({
						status: 200,
						body: buffer.toString('base64')
					});
				} else if (property === 'waitForResponse') {
					const response: Response = res;

					await route.fulfill({
						status: 200,
						body: JSON.stringify({
							url: response.url(),
							status: response.status(),
							headers: response.headers(),
							body: await response.body().then((res) => res.toString('utf8'))
						})
					});
				} else if (property === 'waitForRequest') {
					const request: Request = res;
					await route.fulfill({
						status: 200,
						body: JSON.stringify({
							url: request.url(),
							method: request.method(),
							headers: request.headers(),
							postData: request.postData()
						})
					});
				} else {
					await route.fulfill({ status: 200, body: JSON.stringify(res) });
				}
			} else {
				await route.fulfill({ status: 200, body: res ?? 'OK' });
			}
		} catch (err) {
			await route.continue();
			console.error(
				'脚本软件辅助失败：',
				ScriptWorker.getTransformedErrorMessage(err instanceof Error ? err.message : String(err), {
					url: targetPageUrl,
					property:
						property === 'click' ? '点击' : property === 'fill' ? '填写' : property === 'check' ? '选中' : property,
					args: JSON.stringify(args)
				})
			);
		}
	});
}

function handleBrowserInit(browser: BrowserContext, config: { enable_dialog?: boolean; userDataDir: string }) {
	browser.addInitScript({
		content: 'Object.defineProperty(navigator, "webdriver", { get: () => false });console.log(navigator)'
	});

	// 关闭检测
	const interval = setInterval(async () => {
		if (browser.pages().length === 0) {
			clearInterval(interval);

			await browser.close({
				reason: 'no pages'
			});
		}
	}, 100);

	browser.once('close', () => {
		send('browser-closed');
		process.exit();
	});

	const pageHandle = (page: Page) => {
		// 按照文档的说法，如果不进行任何处理，则动作会和原版浏览器一致
		// 如果不进行监听 page.on('dialog') playwright 会自动处理弹窗
		page.on('dialog', async (dialog) => {
			if (config?.enable_dialog) {
				// 不进行任何处理
			} else {
				await dialog.accept(dialog.defaultValue());
			}
		});

		// 修改下载逻辑
		page.on('download', async (download) => {
			// 不处理脚本安装
			if (download.url().endsWith('.user.js')) {
				return;
			}

			download.cancel();
			// 调用电脑本地浏览器进行文件下载
			openUrl(download.url());
			await page.evaluate(() => alert('自动化浏览器无法下载文件，已使用本地浏览器进行下载任务。'));
		});
	};
	for (const page of browser.pages()) {
		pageHandle(page);
	}
	browser.on('page', pageHandle);
}

function openUrl(url: string) {
	let cmd = 'start';
	if (process.platform === 'darwin') {
		cmd = 'open';
	} else if (process.platform === 'linux') {
		cmd = 'xdg-open';
	}
	child_process.exec(`${cmd} ${url}`);
}

/**
 * 打开浏览器拓展开发者模式（由于 MV3 的限制，运行脚本需要打开开发者模式）
 */
async function openExtensionDeveloperMode(browser: BrowserContext, edge: boolean = false) {
	const page = await browser.newPage();
	await page.goto('chrome://extensions/');

	try {
		await page.bringToFront();
		await page.waitForTimeout(200);
		if (edge) {
			const els = await page.$$('[aria-label="扩展 菜单"]');
			await els[1]?.click();
			const element = await page.waitForSelector('#developer-mode', {
				timeout: 1000
			});
			if (await element.evaluate<boolean, HTMLInputElement>((el) => el.checked === false)) {
				await element.click();
			}
		} else {
			const element = await page.waitForSelector('#devMode', {
				timeout: 1000
			});
			// 如果没有开启开发者模式
			if (
				await element.evaluate<boolean, HTMLDivElement>((el) => el.getAttribute('aria-pressed')?.toString() === 'false')
			) {
				await element.click();
				// 重新加载拓展，否则需要重启浏览器才能使用
				const extensions = await page.$$('[id="dev-reload-button"]');
				for (const ext of extensions) {
					await ext.click();
					await page.waitForTimeout(200);
				}
			}
		}
	} catch {}
	await page.waitForTimeout(500);
	console.log('开发者模式已打开');
	await page.close();
}
function getExtensionName(filepath: string) {
	return filepath.toLocaleLowerCase().includes('tampermonkey')
		? '油猴'
		: filepath.toLocaleLowerCase().includes('scriptcat')
		? '脚本猫'
		: path.basename(filepath);
}
