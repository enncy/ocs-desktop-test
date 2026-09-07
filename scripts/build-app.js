const { series, src, dest } = require('gulp');
const del = require('del');
const zip = require('gulp-zip');
const { execOut } = require('./utils');
const { readFileSync } = require('fs');
const { version } = JSON.parse(readFileSync('../packages/app/package.json').toString());

function buildWeb() {
	return execOut('pnpm build', { cwd: '../packages/web' });
}

function buildApp() {
	return execOut('pnpm dist', { cwd: '../packages/app' });
}

function cleanOutput() {
	return del([`../packages/app/dist/app${version}.zip`], { force: true });
}

function packResource() {
	const platform = process.env.PLATFORM || 'win';
	const unpackedDirs = {
		win: '../packages/app/dist/win-unpacked',
		mac: '../packages/app/dist/mac-unpacked',
		linux: '../packages/app/dist/linux-unpacked'
	};
	const unpackedDir = unpackedDirs[platform] || unpackedDirs.win;
	return src(`${unpackedDir}/resources/app/**/*`)
		.pipe(zip(`app${version}.zip`))
		.pipe(dest('../packages/app/dist'));
}

// 精简版构建：安装包不再内置浏览器压缩包，首次启动时由 init.chrome.ts 从远程下载源拉取
exports.default = series(cleanOutput, buildWeb, buildApp, packResource);
