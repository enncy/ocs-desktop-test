<template>
	<div class="setting container-md">
		<a-card>
			<template #title>
				<span class="card-title-icon"
					><img
						src="../../public/favicon.png"
						width="22px"
				/></span>
				<a-space>
					OCS脚本配置
					<a-tag
						v-if="store.render.setting.ocs.openSync"
						color="green"
					>
						<a-space> <IconCheckCircleFill /> 同步中 </a-space>
					</a-tag>
				</a-space>
			</template>
			<template #extra>
				<a-space>
					<a-tooltip
						v-if="store.render.setting.ocs.openSync"
						content="取消配置同步、每个浏览器可手动调整OCS脚本的设置"
					>
						<a-button
							size="small"
							@click="
								() => {
									store.render.setting.ocs.openSync = false;
								}
							"
						>
							<IconClose /> 取消配置同步
						</a-button>
					</a-tooltip>
					<a-button
						v-else
						type="primary"
						size="small"
						@click="onSyncOCSConfig"
					>
						<IconSync />同步配置到各浏览器
					</a-button>
				</a-space>
			</template>
			<div>
				<OCSConfigs v-model:store="store.render.setting.ocs.store"></OCSConfigs>
			</div>
		</a-card>

		<ResourcesCard />

		<a-card>
			<template #title>
				<span class="card-title-icon">⚙️</span>
				基本设置
			</template>
			<Description label="软件布局">
				<a-select
					v-model="store.render.setting.mode"
					style="width: 160px"
					@change="changeMode"
				>
					<a-option value="simple">简洁模式</a-option>
					<a-option value="professional">专业模式</a-option>
				</a-select>
				<a-popover>
					<template #content>
						<div style="max-width: 300px">
							<div>专业模式相比简洁模式的差异：</div>
							<div>【额外软件设置】</div>
							<div>显示侧边栏文字、浏览器路径设置、浏览器缓存预警阈值</div>
							<div>【浏览器列表页】</div>
							<div>文件夹层级管理与路径导航、按名称/备注/标签搜索筛选、批量启动/关闭/删除/移动等批量操作、右侧浏览器面板（运行日志/备注/自动化程序配置）</div>
							<div>【监控页】</div>
							<div>可同时查看多个浏览器的实时画面</div>
							<div>【简洁模式】</div>
							<div>浏览器以卡片平铺展示（可设置 1-4 列），无文件夹与批量操作，适合简单场景</div>
						</div>
					</template>
					<Icon
						class="ms-2"
						type="help_outline"
					/>
				</a-popover>
			</Description>

			<Description label="开机自启">
				<a-switch v-model="store.window.autoLaunch" />
			</Description>

			<Description label="后台运行">
				<a-tooltip
					content="启用后，关闭窗口将自动隐藏到系统托盘后台运行；未启用时，若有浏览器运行，将询问关闭并退出或移动至托盘。左键单击托盘图标可重新打开，右键选择「退出」完全关闭。"
				>
					<a-switch v-model="store.window.hideToTrayOnClose" />
				</a-tooltip>
			</Description>

			<Description label="窗口置顶">
				<a-switch v-model="store.window.alwaysOnTop" />
			</Description>
			<Description label="主题样式">
				<a-select
					v-model="store.render.setting.theme.mode"
					style="width: 160px"
					@change="changeTheme"
				>
					<a-option value="auto">自动（跟随系统）</a-option>
					<a-option value="light">白天</a-option>
					<a-option value="dark">夜间</a-option>
				</a-select>
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

			<Description
				v-if="simple"
				label="简洁模式卡片布局"
			>
				<a-select
					v-model="store.render.setting.simpleCardColumns"
					style="width: 160px"
				>
					<a-option :value="1">1 列</a-option>
					<a-option :value="2">2 列</a-option>
					<a-option :value="3">3 列</a-option>
					<a-option :value="4">4 列</a-option>
				</a-select>
			</Description>
		</a-card>

		<a-card>
			<template #title>
				<span class="card-title-icon">🌐</span>
				浏览器设置
			</template>
			<BrowserPath v-if="!simple"></BrowserPath>

			<Description label="浏览器增强（实验性）">
				<a-tooltip content="防休眠/防冻结：浏览器最小化或处于后台时仍可长时间运行 JS。仅对新启动的浏览器生效。">
					<a-switch v-model="store.render.setting.browser.browserEnhancement" />
				</a-tooltip>
				<a-popover>
					<template #content>
						<div>开启后浏览器将以"防休眠/防冻结"模式运行，请注意：</div>
						<div>1. CPU / 内存 / 功耗显著上升，笔记本请注意电量；</div>
						<div>2. 最多同时运行 4 个浏览器，超出将直接拒绝启动（需先关闭其他浏览器，或关闭浏览器增强功能）；</div>
						<div>3. 会向所有页面注入一段静音音频以保持页面活跃（隐身实现，不暴露任何函数/全局变量）；</div>
						<div>4. 仅对之后新启动的浏览器生效，已运行的浏览器需重启后生效；</div>
						<div>5. ⚠️ 该功能为实验性功能，正在测试中，可能存在未知BUG，请谨慎使用。</div>
					</template>
					<Icon
						class="ms-2"
						type="help_outline"
					/>
				</a-popover>
			</Description>

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

			<Description label="标签页-搜索引擎">
				<a-tooltip content="关闭后，浏览器导航页（标签页）将不再显示搜索引擎，重启浏览器后生效">
					<a-switch v-model="store.render.setting.browser.bookmarkPage.enableSearch" />
				</a-tooltip>
			</Description>

			<Description label="标签页-快捷平台访问">
				<a-tooltip content="关闭后，浏览器导航页（标签页）将不再显示快捷访问平台列表，重启浏览器后生效">
					<a-switch v-model="store.render.setting.browser.bookmarkPage.enableQuickAccess" />
				</a-tooltip>
			</Description>

			<Description label="标签页-自定义网站">
				<a-button
					size="small"
					@click="openCustomSiteModal"
				>
					管理自定义网站
				</a-button>
			</Description>
		</a-card>

		<!-- 自定义标签页网站管理弹窗 -->
		<a-modal
			v-model:visible="customSiteModalVisible"
			title="自定义标签页网站"
			:footer="false"
			width="560px"
			unmount-on-close
		>
			<div class="custom-site-modal">
				<div
					v-if="store.render.setting.browser.bookmarkPage.customSites.length === 0"
					class="custom-site-empty"
				>
					暂无自定义网站，请在下方添加。
				</div>
				<div
					v-for="(site, index) of store.render.setting.browser.bookmarkPage.customSites"
					:key="site.url + index"
					class="custom-site-item"
				>
					<div class="custom-site-info">
						<div class="custom-site-name">{{ site.name }}</div>
						<div class="custom-site-url">{{ site.url }}</div>
					</div>
					<a-button
						size="mini"
						@click="editCustomSite(index)"
					>
						修改
					</a-button>
					<a-button
						size="mini"
						status="danger"
						@click="removeCustomSite(index)"
					>
						删除
					</a-button>
				</div>

				<a-divider style="margin: 12px 0" />

				<div class="custom-site-form">
					<a-input
						v-model="customSiteForm.name"
						placeholder="网站名称"
						allow-clear
					/>
					<a-input
						v-model="customSiteForm.url"
						placeholder="网址，如 https://www.example.com"
						allow-clear
						@keyup.enter="saveCustomSite"
					/>
					<a-button
						type="primary"
						@click="saveCustomSite"
					>
						{{ customSiteForm.editingIndex === -1 ? '添加' : '保存修改' }}
					</a-button>
					<a-button
						v-if="customSiteForm.editingIndex !== -1"
						@click="resetCustomSiteForm"
					>
						取消修改
					</a-button>
				</div>
			</div>
		</a-modal>

		<a-card>
			<template #title>
				<span class="card-title-icon">📂</span>
				软件路径
			</template>
			<Path
				label="浏览器缓存"
				name="userDataDirsFolder"
				:setting="!simple"
				@on-path-change="onUserDataDirsFolderChange"
			/>
			<Path
				label="文件下载"
				name="downloadFolder"
			/>
			<Path
				label="软件存储"
				name="user-data-path"
			/>
			<Path
				label="可执行文件"
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
import { reactive, ref } from 'vue';
import Description from './Description.vue';
import Path from './Path.vue';
import { t, store, DEFAULT_RENDER } from '../store';
import { remote } from '../utils/remote';
import cloneDeep from 'lodash/cloneDeep';
import BrowserPath from './setting/BrowserPath.vue';
import OCSConfigs from './OCSConfigs.vue';
import ResourcesCard from './ResourcesCard.vue';
import { changeTheme } from '../utils';
import Icon from './Icon.vue';
import { forceClearBrowserCache } from '../utils/browser';
import { Message, Modal } from '@arco-design/web-vue';
import { Folder } from '../fs/folder';
import { Browser } from '../fs/browser';
import { IconCheckCircleFill } from '@arco-design/web-vue/es/icon';
import { router } from '../route';

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
	store.window = { alwaysOnTop: false, autoLaunch: false, hideToTrayOnClose: false };
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
		content: t('setting_browser_ocs_config_sync_tip_v3', '已同步配置，请重启浏览器即可应用~')
	});
}

/** 切换软件布局模式（简洁/专业），并跳转到对应页面 */
function changeMode() {
	router.push(store.render.setting.mode === 'professional' ? '/browsers' : '/simple');
}

/** 自定义标签页网站管理 */
const customSiteModalVisible = ref(false);
const customSiteForm = reactive({ name: '', url: '', editingIndex: -1 });

function openCustomSiteModal() {
	resetCustomSiteForm();
	customSiteModalVisible.value = true;
}

function resetCustomSiteForm() {
	customSiteForm.name = '';
	customSiteForm.url = '';
	customSiteForm.editingIndex = -1;
}

function normalizeSiteUrl(url: string): string {
	const trimmed = url.trim();
	return trimmed && !/^https?:\/\//i.test(trimmed) ? `https://${trimmed}` : trimmed;
}

function saveCustomSite() {
	const name = customSiteForm.name.trim();
	const url = normalizeSiteUrl(customSiteForm.url);
	if (!name) {
		Message.error('请输入网站名称');
		return;
	}
	if (!url || !/^https?:\/\/.+\..+/i.test(url)) {
		Message.error('请输入正确的网址');
		return;
	}
	const list = store.render.setting.browser.bookmarkPage.customSites;
	if (customSiteForm.editingIndex === -1) {
		list.push({ name, url });
		Message.success('添加成功');
	} else {
		list[customSiteForm.editingIndex] = { name, url };
		Message.success('修改成功');
	}
	resetCustomSiteForm();
}

function editCustomSite(index: number) {
	const site = store.render.setting.browser.bookmarkPage.customSites[index];
	if (!site) return;
	customSiteForm.name = site.name;
	customSiteForm.url = site.url;
	customSiteForm.editingIndex = index;
}

function removeCustomSite(index: number) {
	store.render.setting.browser.bookmarkPage.customSites.splice(index, 1);
	if (customSiteForm.editingIndex === index) {
		resetCustomSiteForm();
	}
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

.custom-site-empty {
	padding: 16px 0;
	text-align: center;
	color: var(--color-text-3);
	font-size: 13px;
}

.custom-site-item {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 8px 0;

	& + .custom-site-item {
		border-top: 1px solid var(--color-border-2);
	}
}

.custom-site-info {
	flex: 1;
	min-width: 0;
}

.custom-site-name {
	font-size: 14px;
	font-weight: 500;
}

.custom-site-url {
	font-size: 12px;
	color: var(--color-text-3);
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.custom-site-form {
	display: flex;
	flex-direction: column;
	gap: 8px;
}
</style>
