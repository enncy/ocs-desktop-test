const { series, src, dest } = require('gulp');
const zip = require('gulp-zip');

// 打包“强制升级引导包” upgrader.zip：
// 旧版客户端（zip 热更新机制）通过 ocs-app-infos.json 中新版本条目的 url 下载此 zip，
// 经旧逻辑替换 resources/app 并重启后变成升级引导器，引导用户安装最新安装包。
// 产物：upgrader-stub/dist/upgrader.zip（zip 根目录即 resources/app 内容：package.json + main.js）
function packUpgraderStub() {
	return src(['../upgrader-stub/package.json', '../upgrader-stub/main.js'])
		.pipe(zip('upgrader.zip'))
		.pipe(dest('../upgrader-stub/dist'));
}

exports.default = series(packUpgraderStub);
