<template>
	<CommonEditActionDropdown
		trigger="contextMenu"
		align-point
		position="bl"
		:style="{ display: 'block' }"
	>
		<div class="simple-mode-container">
			<div class="p-2 d-flex justify-content-center tabs">
				<a-tabs
					v-model:active-key="state.activeTab"
					type="rounded"
					hide-content
					size="small"
				>
					<a-tab-pane key="browsers">
						<template #title>
							<Icon type="web"> {{ allBrowsers.length > 0 ? `浏览器 - ${allBrowsers.length}` : '浏览器' }} </Icon>
						</template>
					</a-tab-pane>
					<a-tab-pane key="scripts">
						<template #title>
							<Icon type="code">
								{{ store.render.scripts.length > 0 ? `用户脚本 - ${store.render.scripts.length}` : '脚本' }}
							</Icon>
						</template>
					</a-tab-pane>
					<a-tab-pane key="setting">
						<template #title> <Icon type="settings">软件设置 </Icon> </template>
					</a-tab-pane>
				</a-tabs>
			</div>

			<div
				class="container-md"
				:style="{ maxWidth: cardGridMaxWidth }"
			>
				<!-- 浏览器面板 -->
				<div
					v-if="state.activeTab === 'browsers'"
					class="overflow-aut mb-3o"
				>
					<!-- 环境检测提示 -->
					<EnvironmentAlert class="mb-3" />
					<!-- Banner 提示 -->
					<NotificationBanner class="mb-3" />

					<BeginnerGuide class="mb-2" />

					<div class="cards-area entities">
						<template v-if="allBrowsers.length === 0">
							<a-card class="h-100 d-flex justify-content-center flex-wrap align-items-center pb-5">
								<EmptyBrowserCard />
							</a-card>
						</template>
						<template v-else>
							<div
								class="cards-grid"
								:style="{
									'--simple-card-columns': store.render.setting.simpleCardColumns,
									'--card-max-width': cardGridMaxWidth
								}"
							>
								<!-- 浏览器卡片 -->
								<template
									v-for="browser in allBrowsers"
									:key="browser.uid"
								>
									<a-card
										:data-uid="browser.uid"
										class="browser-card entity"
										:class="cardClass(browser)"
										@click="selectBrowser(browser)"
									>
										<!-- 截图封面区域（运行中推流 或 浏览器关闭后保留预览图时独占整个卡片） -->
										<div
											v-if="showCover(browser.uid)"
											class="card-screenshot"
										>
											<img
												v-if="getCoverUrl(browser.uid)"
												:src="getCoverUrl(browser.uid)"
												alt="浏览器预览"
												class="screenshot-img"
											/>
											<div
												v-else
												class="screenshot-placeholder"
											>
												<Icon type="hourglass_top" /> 等待截图...
											</div>
											<!-- 中心查看大图按钮 -->
											<div
												v-if="getCoverUrl(browser.uid)"
												class="card-screenshot-view"
												@click.stop="openPreview(browser)"
											>
												<Icon
													type="visibility"
													class="view-icon"
												/>
												<span class="view-text">点击查看</span>
											</div>
											<!-- 标题浮于截图上方 -->
											<div class="card-screenshot-overlay">
												<div class="card-name-text card-name-white">
													<Icon type="web">
														{{ browser.name }}
													</Icon>
												</div>
												<div class="overlay-actions">
													<BrowserOperators
														:browser="browser"
														icon-class="fs-5"
													/>
													<!-- 关闭"关闭后的预览图"：恢复正常显示（提示或者备注和标签） -->
													<a-tooltip
														v-if="showClosedPreview(browser.uid)"
														content="关闭预览图"
													>
														<a-button
															type="text"
															size="mini"
															@click.stop="dismissClosedPreview(browser.uid)"
														>
															<template #icon>
																<Icon type="close" />
															</template>
														</a-button>
													</a-tooltip>
												</div>
											</div>
										</div>

										<template #extra>
											<div
												v-if="!showCover(browser.uid)"
												class="d-flex align-items-end"
											>
												<BrowserOperators
													:browser="browser"
													icon-class="fs-5"
												/>
											</div>
										</template>

										<template #title>
											<div
												v-if="!showCover(browser.uid)"
												class="card-name-text"
											>
												<Icon type="web">
													<!-- 重命名状态 -->
													<template v-if="getBrowserInstance(browser.uid)?.renaming">
														<a-input
															v-model="renameValue"
															size="mini"
															@click.stop
															@blur="handleRenameFinish(browser)"
															@keyup.enter="handleRenameFinish(browser)"
														/>
													</template>
													<template v-else>
														{{ browser.name }}
													</template>
												</Icon>
											</div>
										</template>

										<a-card-meta v-if="!showCover(browser.uid)">
											<template #description>
												<!-- 备注/描述：为空时回退为自动化程序信息（敏感信息掩码） -->
												<div
													v-if="getDisplayNotes(browser).text"
													class="card-notes"
													:title="getDisplayNotes(browser).text"
												>
													<span
														v-if="getDisplayNotes(browser).isAuto"
														class="card-notes-autoflag"
													>
														自动
													</span>
													{{ getDisplayNotes(browser).text }}
												</div>
												<div
													v-else
													style="font-size: 12px"
													class="text-center text-secondary"
												>
													<IconInfoCircleFill /> 点击 启动 运行浏览器。<br />
													单击 设置浏览器
												</div>
											</template>

											<template #avatar>
												<!-- 标签 -->
												<div
													v-if="browser.tags.length"
													class="card-tags"
												>
													<Tags
														:tags="browser.tags"
														:read-only="true"
														size="small"
													/>
												</div>
											</template>
										</a-card-meta>
									</a-card>
								</template>

								<!-- 新增浏览器卡片 -->
								<div
									class="browser-card add-card"
									@click="handleAddBrowser"
								>
									<Icon
										type="add_circle_outline"
										class="add-icon"
									/>
									<span class="add-text">新建浏览器</span>
									<span
										class="text-secondary"
										style="font-size: 11px"
									>
										<a-tag>数据隔离</a-tag>
										<a-tag>账号多开</a-tag>
									</span>
								</div>
							</div>
						</template>
					</div>
				</div>

				<!-- 脚本面板 -->
				<div
					v-if="state.activeTab === 'scripts'"
					class="overflow-auto p-2"
				>
					<UserScriptListPage />
				</div>

				<!-- 软件设置面板 -->
				<div
					v-if="state.activeTab === 'setting'"
					class="overflow-auto"
				>
					<SettingPanel simple />
				</div>
			</div>
		</div>
		<!-- 截图大图预览弹窗 -->
		<a-modal
			v-model:visible="previewVisible"
			:footer="false"
			width="auto"
			:mask-closable="true"
			unmount-on-close
			:fullscreen="true"
		>
			<template #title>
				<div class="preview-title">
					<span class="d-flex align-items-center gap-2">
						<Icon type="web" /> {{ previewBrowserName }} - {{ previewIsLive ? '预览中' : '上一次关闭前截图' }}
					</span>
					<BrowserOperators
						v-if="previewBrowser"
						:browser="previewBrowser"
						tooltip-position="bottom"
						icon-class="fs-5"
						class="me-3"
						:actions="['front']"
					/>
				</div>
			</template>
			<img
				v-if="getCoverUrl(previewUid)"
				:src="getCoverUrl(previewUid)"
				alt="浏览器预览"
				class="screenshot-preview-img"
			/>
		</a-modal>
	</CommonEditActionDropdown>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch, nextTick } from 'vue';
import Icon from '../../components/Icon.vue';
import Tags from '../../components/Tags.vue';
import BrowserOperators from '../../components/browsers/BrowserOperators.vue';
import CommonEditActionDropdown from '../../components/CommonEditActionDropdown.vue';
import { store } from '../../store';
import { root } from '../../fs/folder';
import { Browser } from '../../fs/browser';
import { Process, processes, closedPreviews, restoreClosedPreviews } from '../../utils/process';
import { useScreencastVisibility } from '../../composables/useScreencastVisibility';
import { BrowserOptions } from '../../fs/interface';
import { newBrowserOrInit } from '../../utils/browser';
import EmptyBrowserCard from '../../components/EmptyBrowserCard.vue';
import SettingPanel from '../../components/SettingPanel.vue';
import BeginnerGuide from '../../components/BeginnerGuide.vue';
import UserScriptListPage from '../../components/UserScriptListPage.vue';
import EnvironmentAlert from '../../components/EnvironmentAlert.vue';
import NotificationBanner from '../../components/NotificationBanner.vue';
import { getDisplayNotes } from '../../utils/display-notes';

const state = reactive({
	activeTab: 'browsers'
});

/** 获取所有浏览器（递归） */
const allBrowsers = computed(() => {
	return root().findAll((e) => e.type === 'browser') as BrowserOptions[];
});

/** 获取浏览器实例 */
function getBrowserInstance(uid: string): Browser | undefined {
	return Browser.from(uid);
}

/** 获取浏览器运行进程 */
function getProcess(uid: string): Process | undefined {
	return Process.from(uid);
}

/** 浏览器是否已启动 */
function isLaunched(uid: string): boolean {
	return getProcess(uid)?.status === 'launched';
}

/** 是否显示截图预览（已启动且用户开启了截图预览） */
function showScreenshot(uid: string): boolean {
	return isLaunched(uid) && store.render.setting.browser.screenshotPreview;
}

/** 用户手动关闭"关闭后预览图"的记录（uid -> 被关闭时的预览图 URL，新一轮启动+关闭产生新帧后重新展示） */
const dismissedClosedPreviews = reactive(new Map<string, string>());

/** 浏览器关闭后保留的预览图 URL */
function getClosedPreviewUrl(uid: string): string | undefined {
	return closedPreviews.get(uid);
}

/**
 * 是否显示"浏览器关闭后的预览图"：
 * 开启预览图显示、浏览器未在运行、存在保留帧且未被用户手动关闭。
 * 覆盖卡片上的提示信息以及备注和标签。
 */
function showClosedPreview(uid: string): boolean {
	if (!store.render.setting.browser.screenshotPreview) return false;
	if (getProcess(uid)) return false;
	const url = closedPreviews.get(uid);
	if (!url) return false;
	return dismissedClosedPreviews.get(uid) !== url;
}

/** 关闭"关闭后的预览图"，恢复正常的显示（提示或者备注和标签） */
function dismissClosedPreview(uid: string) {
	const url = closedPreviews.get(uid);
	if (url) {
		dismissedClosedPreviews.set(uid, url);
	}
}

/** 是否显示截图封面（运行中推流 或 浏览器关闭后保留的预览图） */
function showCover(uid: string): boolean {
	return showScreenshot(uid) || showClosedPreview(uid);
}

/** 封面图 URL：运行中取实时帧，关闭后取保留的最后一帧 */
function getCoverUrl(uid: string): string | undefined {
	return getProcess(uid)?.frameUrl || getClosedPreviewUrl(uid);
}

/** 计算浏览器卡片的 class */
function cardClass(browser: BrowserOptions) {
	return {
		'has-screenshot': showCover(browser.uid)
	};
}

/** 选中浏览器，显示操作面板 */
function selectBrowser(browser: BrowserOptions) {
	store.render.browser.currentBrowserUid = browser.uid;
}

/** 新增浏览器 */
function handleAddBrowser() {
	newBrowserOrInit();
}

/** 截图大图预览弹窗状态 */
const previewVisible = ref(false);
const previewUid = ref('');
const previewBrowserName = ref('');

/** 当前预览的浏览器对象（用于弹窗内操作按钮） */
const previewBrowser = computed(() => allBrowsers.value.find((b) => b.uid === previewUid.value));

/** 预览弹窗展示的帧是否为实时推流（浏览器运行中），否则为关闭前保留的截图 */
const previewIsLive = computed(() => !!getProcess(previewUid.value));

/** 卡片网格最大宽度：3/4 列时加宽，避免卡片被挤得太小 */
const cardGridMaxWidth = computed(() => {
	const cols = store.render.setting.simpleCardColumns;
	if (cols >= 4) return '1500px';
	if (cols === 3) return '1200px';
	return '800px';
});

/** 打开截图大图预览（运行中实时帧 或 关闭后保留的预览图） */
function openPreview(browser: BrowserOptions) {
	if (getCoverUrl(browser.uid)) {
		previewUid.value = browser.uid;
		previewBrowserName.value = browser.name;
		previewVisible.value = true;
	}
}

/** 重命名临时值 */
const renameValue = ref('');

/** 处理重命名完成 */
function handleRenameFinish(browser: BrowserOptions) {
	const instance = Browser.from(browser.uid);
	if (instance) {
		instance.rename(renameValue.value || browser.name);
	}
}

/** 监听重命名状态，初始化值并自动聚焦输入框 */
watch(
	() => allBrowsers.value.find((b) => getBrowserInstance(b.uid)?.renaming),
	(renamingBrowser) => {
		if (renamingBrowser) {
			renameValue.value = renamingBrowser.name;
			nextTick(() => {
				const input = document.querySelector('.browser-card .arco-input') as HTMLInputElement;
				if (input) {
					input.focus();
					input.select();
				}
			});
		}
	}
);

/** 卡片可见性驱动 Page.startScreencast 启停（仅可见卡片推流，滚出视口自动停止） */
const { refresh: refreshScreencast } = useScreencastVisibility({
	cardSelector: '.browser-card[data-uid]',
	root: () => document.querySelector('.simple-mode-container')
});

/** 进程状态快照，uid:status 变化时触发预览同步 */
const processesSnapshot = computed(() => processes.map((p) => `${p.uid}:${p.status}`).join('|'));

watch([() => state.activeTab, () => allBrowsers.value.length, processesSnapshot], () => {
	nextTick(refreshScreencast);
});

onMounted(() => {
	// 确保专业模式的面板已关闭
	store.render.browser.currentBrowserUid = '';
	// 从磁盘恢复上次软件退出前保留的"浏览器关闭后预览图"
	restoreClosedPreviews(allBrowsers.value);
	nextTick(refreshScreencast);
});
</script>

<style lang="less" scoped>
.simple-mode-container {
	height: calc(100vh - var(--title-height));
	display: flex;
	flex-direction: column;
	overflow: auto;
	background-color: var(--theme-bg-color-deep);
}

.cards-area {
	padding: 4px 20px 20px 16px;
}

.cards-grid {
	display: grid;
	grid-template-columns: repeat(var(--simple-card-columns, 2), 1fr);
	gap: 16px;
	max-width: var(--card-max-width, 900px);
	margin: 0 auto;
}

.browser-card {
	background: transparent;
	border: 1px solid var(--theme-border-color-light);
	border-radius: 8px;
	cursor: pointer;
	transition: all 0.2s ease;
	background-color: var(--theme-card-bg);

	&:hover {
		border-color: var(--theme-primary-color);
		box-shadow: 0 4px 12px var(--theme-shadow-color);
		transform: translateY(-2px);
	}

	&:active {
		transform: translateY(0);
	}

	// 有截图时：隐藏 header，body 零内边距，截图铺满卡片
	// 卡片自身 overflow:hidden 配合圆角统一裁剪截图，避免 body 圆角小于
	// 卡片内圆角时截图背景溢出、遮挡卡片 border 四个角（hover 激活边框）
	&.has-screenshot {
		overflow: hidden;

		:deep(.arco-card-header) {
			display: none;
		}

		:deep(.arco-card-body) {
			padding: 0;
			overflow: hidden;
		}
	}

	.card-name-text {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		max-width: 300px;
		font-size: 14px;
	}

	.card-name-white {
		color: var(--theme-text-color-strong);
	}

	.card-icon {
		font-size: 18px;
		color: var(--theme-primary-color);
		flex-shrink: 0;
	}

	.card-operators {
		flex-shrink: 0;
	}

	.card-tags {
		margin-bottom: 6px;
	}

	.card-notes {
		font-size: 12px;
		color: var(--theme-text-color-secondary);
		line-height: 1.5;
		overflow: hidden;
		text-overflow: ellipsis;
		display: -webkit-box;
		// 加高显示行数，保证自动化程序信息（账号/学校/学号等多行）可见，超出仍省略
		-webkit-line-clamp: 5;
		-webkit-box-orient: vertical;
		// 任意位置允许断行，防止长链接/长账号/长中文串不换行导致备注区域超出卡片界面
		overflow-wrap: anywhere;
		word-break: break-all;
		white-space: pre-line;
		cursor: default;
		// 约束最大宽度不超过卡片内容区，避免溢出
		max-width: 100%;

		.card-notes-autoflag {
			display: inline-block;
			padding: 0 5px;
			margin-right: 4px;
			border-radius: 4px;
			font-size: 11px;
			line-height: 16px;
			color: var(--theme-primary-color);
			background-color: var(--theme-primary-bg, rgba(var(--primary-6), 0.12));
			vertical-align: 1px;
		}
	}
}

.card-screenshot {
	position: relative;
	overflow: hidden;
	background-color: var(--theme-card-bg);
	// 固定宽高比，不会超出界面
	aspect-ratio: 16 / 9;

	display: flex;
	align-items: center;
	justify-content: center;
}

.screenshot-img {
	width: 100%;
	height: 100%;
	object-fit: cover;
}

.card-screenshot-overlay {
	position: absolute;
	top: 0;
	left: 0;
	right: 0;
	padding: 8px 12px;
	// 底层浅白色，防止与截图颜色重合
	background: rgba(255, 255, 255, 0.591);
	color: #1d2129;
	display: flex;
	align-items: center;
	justify-content: space-between;

	.overlay-actions {
		display: flex;
		align-items: center;
		gap: 4px;
		flex-shrink: 0;
	}

	:deep(.arco-btn-text) {
		color: rgba(29, 33, 41, 0.75);

		&:hover {
			color: #1d2129;
		}
	}
}

.screenshot-placeholder {
	color: var(--theme-text-color-secondary);
	font-size: 12px;
}

/* 中心查看大图按钮：hover 截图区域时显示，图标文案蓝色、背景透明 */
.card-screenshot-view {
	position: absolute;
	top: 50%;
	left: 50%;
	transform: translate(-50%, -50%);
	z-index: 2;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 6px;
	padding: 14px 22px;
	border-radius: var(--border-radius-medium);
	background-color: transparent;
	color: var(--theme-primary-color);
	cursor: pointer;
	opacity: 0;
	pointer-events: none;
	transition: opacity 0.2s ease, transform 0.2s ease;
	user-select: none;
	text-shadow: 0 1px 4px rgba(0, 0, 0, 0.45);

	.view-icon {
		font-size: 30px;
		line-height: 1;
	}

	.view-text {
		font-size: 12px;
		line-height: 1;
		letter-spacing: 0.5px;
	}

	&:hover {
		transform: translate(-50%, -50%) scale(1.05);
	}
}

/* 鼠标移入截图区域时显示查看按钮 */
.card-screenshot:hover .card-screenshot-view {
	opacity: 1;
	pointer-events: auto;
}

.add-card {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	min-height: 120px;
	border: 1px dashed var(--theme-border-color-strong);
	background-color: transparent;

	&:hover {
		border-color: var(--theme-primary-color);
		background-color: var(--theme-hover-bg);
	}

	.add-icon {
		font-size: 32px;
		margin-bottom: 8px;
	}
}

/** 暗色主题适配：截图浮层为半透明覆盖层，需单独处理（其余由主题变量自动适配） */
body[arco-theme='dark'] & {
	.card-screenshot-overlay {
		background: rgba(40, 40, 42, 0.72);
		color: #ffffff71;

		:deep(.arco-btn-text) {
			color: rgba(255, 255, 255, 0.75);

			&:hover {
				color: #ffffffd9;
			}
		}
	}
}

/** 响应式：小屏幕单列 */
@media (max-width: 600px) {
	.cards-grid {
		grid-template-columns: 1fr;
	}
}

.tabs {
	position: sticky;
	top: 0px;
	z-index: 999;

	:deep(.arco-tabs-tab) {
		border: 1px solid var(--theme-border-color-light);
		background-color: var(--theme-card-bg);
		box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04), 0 4px 12px rgba(0, 0, 0, 0.06) !important;
		margin: 4px;
	}
}

:deep(.arco-card-meta-footer) {
	align-items: start !important;
}

// 备注与标签并排布局时，约束内容区不超出卡片，防止宽内容溢出
::deep(.arco-card-meta-content) {
	flex: 1;
	min-width: 0;
}

/* 弹窗标题：浏览器名 + 操作按钮 */
.preview-title {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	width: 100%;
}

/* 截图大图预览弹窗 */
.screenshot-preview-img {
	display: block;
	width: 100%;
	max-height: 80vh;
	object-fit: contain;
	background-color: #000;
}
</style>
