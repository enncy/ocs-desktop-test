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

			<Description label="后台运行">
				<a-tooltip
					content="启用后，关闭软件窗口时将自动隐藏到系统托盘后台运行（浏览器与自动化任务保持运行）。左键单击托盘图标可重新打开，右键托盘图标可选择「退出」完全关闭。"
				>
					<a-switch v-model="store.window.hideToTrayOnClose" />
				</a-tooltip>
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

			<Description label="显示浏览器预览">
				<a-tooltip
					content="启用后，浏览器卡片（简洁模式）与监控页面（专业模式）将实时显示浏览器运行界面预览。仅可见卡片推流，滚出视口自动停止以节省资源。开关实时生效。"
				>
					<a-switch v-model="store.render.setting.browser.screenshotPreview" />
				</a-tooltip>
			</Description>

			<Description
				v-if="store.render.setting.browser.screenshotPreview"
				label="预览帧率"
			>
				<a-select
					v-model="store.render.setting.browser.screenshotFramerate"
					style="width: 200px"
					:placeholder="''"
				>
					<a-option value="high">高（约 30 帧/秒）</a-option>
					<a-option value="medium">中（约 15 帧/秒）</a-option>
					<a-option value="low">低（约 6 帧/秒）</a-option>
				</a-select>
				<a-popover>
					<template #content>
						<div>控制预览帧率，越高越流畅但占用更多资源。</div>
						<div>实际帧率随页面内容动态变化（静止画面自动停止推流），实时生效。</div>
					</template>
					<Icon
						class="ms-2"
						type="help_outline"
					/>
				</a-popover>
			</Description>

			<Description
				v-if="store.render.setting.browser.screenshotPreview"
				label="预览画质"
			>
				<a-select
					v-model="store.render.setting.browser.screenshotQuality"
					style="width: 200px"
					:placeholder="''"
				>
					<a-option value="high">高（1280×720）</a-option>
					<a-option value="medium">中（640×360）</a-option>
					<a-option value="low">低（480×270）</a-option>
				</a-select>
				<a-popover>
					<template #content>
						<div>控制预览画质（分辨率与压缩率），越高越清晰但占用更多资源，实时生效。</div>
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

		<div class="mt-4 mb-5">
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
import { lang, store, DEFAULT_RENDER } from '../store';
import { remote } from '../utils/remote';
import cloneDeep from 'lodash/cloneDeep';
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
	// 仅重置软件设置为默认值，保留浏览器分身、脚本、路径等用户数据
	store.render.setting = cloneDeep(DEFAULT_RENDER.setting);
	store.window = { alwaysOnTop: false, autoLaunch: false, hideToTrayOnClose: true };
	// 同步保存，确保重置落盘后再重启（不依赖关闭流程的保存时序，避免强制退出时丢失）
	const shouldEncrypt = remote.methods.callSync('isEncryptionAvailable');
	remote.methods.callSync('saveStore', JSON.stringify(store), shouldEncrypt);
	remote.methods.call('resetApp');
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
