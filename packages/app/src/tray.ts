import { app, BrowserWindow, Menu, Tray, nativeImage } from 'electron';
import path from 'path';

let tray: Tray | null = null;
let mainWindow: BrowserWindow | null = null;

/** 本次会话是否已展示过「最小化到托盘」气泡提示（避免反复打扰） */
let balloonShown = false;

/**
 * 是否正在「程序化退出」（由 quitApp / before-quit 置位）。
 *
 * 用于区分「用户点击窗口关闭按钮」与「应用真正退出」：
 * - 用户点关闭按钮：未置位，交由渲染层按「后台运行」开关决定隐藏到托盘或退出。
 * - 程序化退出（重置/导入/托盘退出/重启/关机）：置位，绕过「隐藏到托盘」逻辑，走完整退出流程。
 * 退出被用户取消（拒绝关闭浏览器）时由 cancelQuit 复位。
 */
let isQuitting = false;

/**
 * 创建系统托盘。
 *
 * 托盘提供「显示主窗口」「退出」两个菜单项；左键单击托盘图标同样会显示主窗口。
 * 配合 `hideToTray()` 实现「关闭窗口时后台运行」。
 */
export function createTray(win: BrowserWindow) {
	mainWindow = win;
	const icon = nativeImage.createFromPath(path.resolve('./public/favicon.ico'));
	tray = new Tray(icon.isEmpty() ? nativeImage.createFromPath(path.resolve('./public/favicon.png')) : icon);
	tray.setToolTip('OCS Desktop');

	const menu = Menu.buildFromTemplate([
		{ label: '显示主窗口', click: () => showMainWindow() },
		{ type: 'separator' },
		{ label: '退出', click: () => quitFromTray() }
	]);
	tray.setContextMenu(menu);

	// 左键单击托盘图标：显示主窗口
	tray.on('click', () => showMainWindow());
}

/** 显示并聚焦主窗口（从托盘恢复） */
export function showMainWindow() {
	if (!mainWindow) return;
	if (!mainWindow.isVisible()) mainWindow.show();
	if (mainWindow.isMinimized()) mainWindow.restore();
	mainWindow.focus();
}

/**
 * 隐藏到系统托盘（用户点击关闭按钮且开启后台运行时调用）。
 *
 * 仅隐藏主窗口，不关闭浏览器、不退出应用，浏览器与自动化任务保持后台运行。
 * 首次隐藏时弹出气泡提示，告知用户软件仍在后台运行。
 */
export function hideToTray() {
	mainWindow?.hide();
	if (tray && !balloonShown && process.platform === 'win32') {
		balloonShown = true;
		tray.displayBalloon({
			icon: nativeImage.createFromPath(path.resolve('./public/favicon.ico')),
			title: 'OCS Desktop',
			content:
				'正在后台运行，已最小化到系统托盘，浏览器与自动化任务保持运行。点击托盘图标可重新打开；右键选择「退出」可完全关闭。'
		});
	}
}

/** 是否正在程序化退出 */
export function isAppQuitting() {
	return isQuitting;
}

/**
 * 程序化退出应用：置位 isQuitting 后调用 app.exit。
 *
 * 必须通过本方法（而非直接 `app.exit`）触发退出，使 `window.on('close')` 走完整退出流程
 * （关闭浏览器 + 保存数据），而非「隐藏到托盘」。
 */
export function quitApp(code = 0) {
	isQuitting = true;
	app.exit(code);
}

/** 取消程序化退出（用户在「还有浏览器正在运行」弹窗中拒绝关闭时调用），复位 isQuitting */
export function cancelQuit() {
	isQuitting = false;
}

/** 销毁托盘图标（即将退出时调用，避免 Windows 上残留图标） */
export function destroyTray() {
	tray?.destroy();
	tray = null;
}

/**
 * 从托盘完全退出应用。
 *
 * 先显示主窗口（以便渲染层弹出「还有浏览器正在运行」确认弹窗），
 * 再通过 `quit` 事件交给渲染层执行完整的退出流程（关闭浏览器 + 保存数据 + 退出），
 * 从而绕过 `close` 事件中的「隐藏到托盘」逻辑。
 */
function quitFromTray() {
	showMainWindow();
	mainWindow?.webContents.send('quit');
}

// app.quit（重启 / 系统关机）路径会触发 before-quit，置位程序化退出标记以绕过「隐藏到托盘」
app.on('before-quit', () => {
	isQuitting = true;
});
