/**
 * 应用启动初始化状态共享模块。
 *
 * 用于在主进程 initChrome 阶段记录初始化进度，供渲染进程的 loading 闪屏页
 * 通过本地服务器 `GET /api/init/status` 轮询拉取展示。
 *
 * 每次调用 setInitStatus 会在 logs 中追加一条日志条目（前一条 active 自动转为 done），
 * 这样弹窗可以展示完整流程日志（准备、解压、查找、移动、清理、配置、重启等）。
 */

export type InitStatus = 'idle' | 'loading' | 'done' | 'error' | 'restart';
export type InitLogState = 'done' | 'active' | 'error';

export interface InitLogEntry {
	text: string;
	state: InitLogState;
	/** 序号，便于前端去重/排序 */
	index: number;
}

interface InitStatusState {
	status: InitStatus;
	message: string;
	logs: InitLogEntry[];
}

const initStatus: InitStatusState = {
	status: 'idle',
	message: '',
	logs: []
};

let logIndex = 0;

/**
 * 更新初始化状态，并把 message 作为一条日志追加到 logs。
 * 已存在的 active 日志自动转为 done（表示该步骤已完成）。
 */
export function setInitStatus(partial: { status: InitStatus; message: string }): void {
	// 前一条 active 转为 done（表示该步骤已完成）
	const last = initStatus.logs[initStatus.logs.length - 1];
	if (last && last.state === 'active') {
		last.state = 'done';
	}
	if (partial.message) {
		initStatus.logs.push({
			text: partial.message,
			state: partial.status === 'error' ? 'error' : 'active',
			index: ++logIndex
		});
	}
	initStatus.status = partial.status;
	initStatus.message = partial.message;
}

/** 读取初始化状态（返回副本，避免外部直接修改） */
export function getInitStatus(): InitStatusState {
	return {
		status: initStatus.status,
		message: initStatus.message,
		logs: initStatus.logs.map((l) => ({ ...l }))
	};
}

/** 重置为初始状态 */
export function resetInitStatus(): void {
	initStatus.status = 'idle';
	initStatus.message = '';
	initStatus.logs = [];
	logIndex = 0;
}
