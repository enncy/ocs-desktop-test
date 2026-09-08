const { series } = require('gulp');
const { execOut } = require('./utils');

// web 产物由 vite 构建（见 build-app.js 的 buildWeb），此处仅需编译 common 与 app 两个 Node 包。
// app 的 lib 产物被 electron-builder 直接打包，必须先于 dist 编译一次。
exports.default = series(
	series(
		() => execOut('tsc', { cwd: '../packages/common' }),
		() => execOut('tsc', { cwd: '../packages/app' })
	)
);
