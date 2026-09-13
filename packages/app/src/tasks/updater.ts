import { app, dialog, clipboard } from 'electron';
import { autoUpdater } from 'electron-updater';
import axios from 'axios';
import { gt, lte } from 'semver';
import { Logger } from '../logger';
import { store } from '../store';
import { getCurrentWebContents, moveWindowToTop } from '../utils';
import { UpdateInformationResource } from '@ocs-desktop/common';

const logger = Logger('updater');

/** 默认更新源目录（与 electron.builder.json publish.url 一致），CHANGELOG.md 随构建一并上传至此目录 */
const DEFAULT_FEED_URL = 'https://cdn.ocsjs.com/app/test/electron-updater/';

/** 保持“用户确认后才下载”的交互，由渲染层弹窗触发 downloadUpdate */
autoUpdater.autoDownload = false;
/** 下载完成后由 update-downloaded 统一提示并 quitAndInstall，避免退出时静默安装 */
autoUpdater.autoInstallOnAppQuit = false;
autoUpdater.logger = logger;

let listening = false;

function listenUpdaterEvents() {
	if (listening) {
		return;
	}
	listening = true;

	autoUpdater.on('update-available', async (info) => {
		logger.info('检测到新版本', info.version);
		/** 更新日志取自随三件套上传的 CHANGELOG.md，按版本区间截取为 markdown */
		const markdown = await resolveChangelogMarkdown(info.version, app.getVersion());
		moveWindowToTop();
		const newVersion: UpdateInformationResource = {
			tag: info.version,
			markdown,
			description: { feat: [], fix: [], other: [] },
			url: ''
		};
		getCurrentWebContents().send('detect-new-app-version', newVersion);
	});

	autoUpdater.on('download-progress', (progress) => {
		/** 对齐旧 IPC 参数格式 (rate, totalLength, chunkLength)，渲染层无需改动 */
		getCurrentWebContents().send('update-download', progress.bytesPerSecond, progress.total, progress.transferred);
	});

	autoUpdater.on('update-downloaded', () => {
		dialog.showMessageBox({
			title: 'OCS更新程序',
			message: '更新完毕，即将重启软件...',
			type: 'warning',
			noLink: true
		});
		setTimeout(() => {
			autoUpdater.quitAndInstall();
		}, 1000);
	});

	autoUpdater.on('error', (err) => {
		logger.error('更新失败', err);
		dialog
			.showMessageBox({
				title: 'OCS更新程序',
				message: 'OCS更新失败:\n' + err,
				type: 'error',
				noLink: true,
				defaultId: 1,
				buttons: ['继续使用', '复制错误日志']
			})
			.then(({ response }) => {
				if (response === 1) {
					clipboard.writeText(String(err));
				}
			});
	});
}

/** 当前生效的更新源目录（测试模式可在设置中覆盖），保证以 / 结尾 */
function effectiveFeedUrl() {
	return (store.store.updater?.feedUrl || DEFAULT_FEED_URL).replace(/\/?$/, '/');
}

/**
 * 拉取更新源目录下的 CHANGELOG.md，截取 (current, latest] 区间的所有版本段落，
 * 拼接为 markdown 文本供渲染层展示。例如 2.9.xx 升级到 3.0.0，会包含期间所有版本的日志。
 */
async function resolveChangelogMarkdown(latest: string, current: string): Promise<string> {
	const changelogUrl = effectiveFeedUrl() + 'CHANGELOG.md';
	try {
		const { data } = await axios.get(changelogUrl + '?t=' + Date.now(), { timeout: 15_000 });
		const sections = extractVersionSections(String(data), current, latest);
		if (sections.length === 0) {
			return `## ${latest}\n\n暂无详细更新日志`;
		}
		return sections.join('\n\n');
	} catch (e) {
		logger.error('获取更新日志失败', e);
		return `## ${latest}\n\n更新日志获取失败，可前往 https://docs.ocsjs.com 查看`;
	}
}

/** 从 CHANGELOG 全文中截取 (current, latest] 范围内的版本段落，并将标题规范化为 ## x.y.z（date） */
function extractVersionSections(changelog: string, current: string, latest: string): string[] {
	const sections: string[] = [];
	// 按二级标题切分，形如：## [2.11.0](https://.../compare/...) (2026-06-10)
	for (const block of changelog.split(/^(?=## )/m)) {
		const verMatch = block.match(/^## \[?(\d+\.\d+\.\d+)\]?/);
		if (!verMatch) {
			continue;
		}
		const ver = verMatch[1];
		if (gt(ver, current) && lte(ver, latest)) {
			const dateMatch = block.match(/\((\d{4}-\d{2}-\d{2})\)/);
			const body = block.slice(block.indexOf('\n')).trim();
			sections.push(`## ${ver}${dateMatch ? `（${dateMatch[1]}）` : ''}\n\n${body}`);
		}
	}
	return sections;
}

/** 应用设置中的更新测试配置（自定义更新源 / 允许降级），正式用户默认留空不影响线上 */
function applyUpdaterConfig() {
	const config = store.store.updater;
	if (config?.feedUrl) {
		autoUpdater.setFeedURL({ provider: 'generic', url: config.feedUrl });
		logger.info('使用自定义更新源', config.feedUrl);
	}
	autoUpdater.allowDowngrade = config?.allowDowngrade === true;
	if (autoUpdater.allowDowngrade) {
		logger.info('已开启允许降级安装（测试模式）');
	}
}

export async function updater() {
	listenUpdaterEvents();
	applyUpdaterConfig();
	logger.info('检查更新', { version: app.getVersion() });
	try {
		const result = await autoUpdater.checkForUpdates();
		const latest = result?.updateInfo?.version || app.getVersion();
		const hasUpdate =
			!!result?.updateInfo && (autoUpdater.allowDowngrade ? latest !== app.getVersion() : gt(latest, app.getVersion()));
		logger.info('检查更新结果', { current: app.getVersion(), latest, hasUpdate });
		return { current: app.getVersion(), latest, hasUpdate };
	} catch (e) {
		logger.error('检查更新失败', e);
		return undefined;
	}
}

/**
 * 渲染层“确认更新”后调用：开始下载更新包。
 * IPC 方法名保持 updateApp 不变，内部由“下载zip+删目录+解压”改为 electron-updater 安装包下载。
 */
export async function updateApp() {
	await autoUpdater.downloadUpdate();
}
