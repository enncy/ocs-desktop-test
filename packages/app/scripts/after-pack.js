/**
 * electron-builder afterPack 钩子。
 *
 * electron-builder 23.x 不支持 electronLanguages 选项（24+ 才有），
 * 这里在打包后删除多余的 Chromium 语言包，仅保留英文与简体中文，
 * locales 目录约 42MB -> 1MB。
 */

const fs = require('fs');
const path = require('path');

/** 保留的语言包文件名（Chromium locales 命名） */
const KEEP_LOCALES = new Set(['en-US.pak', 'en-GB.pak', 'zh-CN.pak']);

exports.default = async function afterPack(context) {
	const localesDir = path.join(context.appOutDir, 'locales');
	if (!fs.existsSync(localesDir)) {
		return;
	}

	let removed = 0;
	for (const file of fs.readdirSync(localesDir)) {
		if (file.endsWith('.pak') && !KEEP_LOCALES.has(file)) {
			fs.rmSync(path.join(localesDir, file), { force: true });
			removed++;
		}
	}
	console.log(`[after-pack] 已删除 ${removed} 个多余语言包，保留: ${[...KEEP_LOCALES].join(', ')}`);
};
