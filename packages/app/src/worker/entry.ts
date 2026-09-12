// @ts-check
/**
 * worker 子进程入口（由渲染进程/主进程 fork 为纯 Node 子进程运行）。
 * 经 electron-vite 打包为 out/main/script.js，替代原 app 根目录的 script.js CJS 壳。
 * 注意：本进程非 Electron 环境，依赖链必须保持 electron-free。
 */
import { ScriptWorker } from './index';

const worker = new ScriptWorker();

// 监听消息
process.on('message', (message: { event: any; args: any }) => {
	/** 根据 event 名直接调用方法 */
	(worker as any)[message.event](...message.args);
});
