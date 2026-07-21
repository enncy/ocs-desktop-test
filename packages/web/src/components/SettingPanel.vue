<template>
	<div class="setting container-md">
		<a-card>
			<template #title>
				<span class="card-title-icon"
					><img
						src="../../public/favicon.png"
						width="22px"
				/></span>
				OCS脚本配置
			</template>
			<template #extra>
				<a-button
					type="primary"
					size="small"
					@click="onSyncOCSConfig"
				>
					同步配置到各浏览器
				</a-button>
			</template>
			<div class="mt-2">
				<OCSConfigs v-model:store="store.render.setting.ocs.store"></OCSConfigs>
			</div>
		</a-card>

		<ResourcesCard />

		<a-card>
			<template #title>
				<span class="card-title-icon">⚙️</span>
				基本设置
			</template>
			<Description label="开机自启">
				<a-switch v-model="store.window.autoLaunch" />
			</Description>

			<Description label="窗口置顶">
				<a-switch v-model="store.window.alwaysOnTop" />
			</Description>
			<Description label="夜间模式">
				<a-switch
					v-model="store.render.setting.theme.dark"
					@click="changeTheme"
				/>
			</Description>
			<Description
				v-if="!simple"
				label="显示侧边栏文字"
			>
				<a-switch
					v-model="store.render.setting.showSideBarText"
					@click="changeTheme"
				/>
			</Description>
		</a-card>

		<a-card>
			<template #title>
				<span class="card-title-icon">🌐</span>
				浏览器设置
			</template>
			<BrowserPath v-if="!simple"></BrowserPath>

			<Description label="原生弹窗">
				<a-tooltip content="启用后，浏览器中的原版弹窗可能会影响脚本运行">
					<a-switch v-model="store.render.setting.browser.enableDialog" />
				</a-tooltip>
			</Description>

			<Description label="强制安装脚本">
				<a-tooltip content="启用后，启动浏览器时将跳过版本检查，强制安装所有启用的脚本">
					<a-switch v-model="store.render.setting.browser.forceUpdateScript" />
				</a-tooltip>
			</Description>

			<Description label="新建浏览器自动初始化">
				<a-tooltip
					content="启用后，点击新建浏览器将自动打开初始化弹窗并执行（新建浏览器、添加自动化程序），关闭则直接创建空浏览器"
				>
					<a-switch v-model="store.render.setting.browser.autoInitNewBrowser" />
				</a-tooltip>
			</Description>

			<Description label="显示截图预览">
				<a-tooltip
					content="启用后，浏览器卡片（简洁模式）与监控页面（专业模式）将定时显示浏览器运行界面截图预览。修改后需重启浏览器生效。"
				>
					<a-switch v-model="store.render.setting.browser.screenshotPreview" />
				</a-tooltip>
			</Description>

			<Description label="截图刷新间隔">
				<a-select
					v-model="store.render.setting.browser.screenshotInterval"
					style="width: 200px"
					:placeholder="''"
				>
					<a-option :value="2">2 秒</a-option>
					<a-option :value="5">5 秒</a-option>
					<a-option :value="10">10 秒</a-option>
					<a-option :value="15">15 秒</a-option>
					<a-option :value="30">30 秒</a-option>
				</a-select>
				<a-popover>
					<template #content>
						<div>设置运行时截图的定时刷新间隔，间隔越短越实时但占用更多资源。</div>
						<div>修改后需重启浏览器生效。</div>
					</template>
					<Icon
						class="ms-2"
						type="help_outline"
					/>
				</a-popover>
			</Description>

			<Description
				v-if="!simple"
				label="浏览器缓存预警阈值"
			>
				<a-input-number
					v-model="store.render.setting.browser.cachesSizeWarningPoint"
					style="width: 200px"
				>
					<template #append> GB </template>
				</a-input-number>
				<a-popover>
					<template #content>
						<div>当前浏览器缓存总大小超过此数字时则会弹出警告弹窗。</div>
						<div>也可在左上角工具中找到 "清除浏览器缓存" 功能</div>
					</template>
					<Icon
						class="ms-2"
						type="help_outline"
					/>
				</a-popover>
			</Description>
		</a-card>

		<a-card>
			<template #title>
				<span class="card-title-icon">📂</span>
				路径设置
			</template>
			<Path
				label="浏览器缓存路径"
				name="userDataDirsFolder"
				:setting="!simple"
				@on-path-change="onUserDataDirsFolderChange"
			/>
			<Path
				label="文件下载路径"
				name="downloadFolder"
			/>
			<Path
				label="软件存储"
				name="user-data-path"
			/>
			<Path
				label="软件路径"
				name="exe-path"
			/>
		</a-card>

		<div class="mt-4">
			<a-popconfirm
				content="确认重置您的设置，并重新启动软件吗？"
				ok-text="确认"
				cancel-text="取消"
				@ok="reset"
			>
				<a-button status="danger"> 重置设置 </a-button>
			</a-popconfirm>
		</div>
	</div>
</template>

<script setup lang="ts">
import Description from './Description.vue';
import Path from './Path.vue';
import { lang, store } from '../store';
import { remote } from '../utils/remote';
import BrowserPath from './setting/BrowserPath.vue';
import OCSConfigs from './OCSConfigs.vue';
import ResourcesCard from './ResourcesCard.vue';
import { changeTheme } from '../utils';
import Icon from './Icon.vue';
import { forceClearBrowserCache } from '../utils/browser';
import { Modal } from '@arco-design/web-vue';
import { Folder } from '../fs/folder';
import { Browser } from '../fs/browser';

interface SettingPanelProps {
	simple?: boolean;
}

withDefaults(defineProps<SettingPanelProps>(), {
	simple: false
});

/** 重置设置 */
async function reset() {
	// @ts-ignore
	store.version = undefined;
	remote.app.call('relaunch');
	remote.app.call('exit', 0);
}
async function onUserDataDirsFolderChange(previous: string, current: string) {
	// 更改全部浏览器缓存路径
	const browsers = Folder.from(store.render.browser.root.uid).findAll((e) => e.type === 'browser') as Browser[];
	if (browsers.length > 0) {
		for (const browser of browsers) {
			browser.cachePath = await remote.path.call('join', current, browser.uid);
		}
	}

	await forceClearBrowserCache('检测到浏览器缓存路径，正在清空之前的缓存数据...', previous);
}

/** 同步OCS配置到各浏览器 */
function onSyncOCSConfig() {
	store.render.setting.ocs.openSync = true;
	Modal.success({
		content: lang('setting_browser_ocs_config_sync_tip_v3', '已同步配置，请重启浏览器即可应用~')
	});
}
</script>

<style scoped lang="less">
.setting {
	min-height: 500px;
	max-width: 800px;
}

.arco-card + .arco-card {
	margin-top: 12px;
}

:deep(.arco-card-header-title) {
	display: flex;
	align-items: center;
}

.card-title-icon {
	margin-right: 6px;
	font-size: 22px;
	display: inline-flex;
	align-items: center;
}
</style>
