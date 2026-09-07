<template>
	<div class="col-12 p-2 m-auto">
		<!-- 使用提示 -->
		<UsageAlertCollapse
			v-model:collapse="store.render.state.read_record.resources_usage"
			class="mb-2"
			banner
			title="使用提示"
			:html="t('notice_dashboard_monitor_page_usage', '')"
		/>

		<div class="d-flex mb-1 align-items-center">
			<a-space :size="0">
				<template #split>
					<a-divider
						class="ms-1 me-1"
						direction="vertical"
					/>
				</template>

				<a-switch v-model="store.render.dashboard.details.tags">
					<template #checked> 显示标签 </template>
					<template #unchecked> 显示标签 </template>
				</a-switch>

				<a-switch v-model="store.render.dashboard.details.notes">
					<template #checked> 显示备注 </template>
					<template #unchecked> 显示备注 </template>
				</a-switch>

				<a-select
					v-model="store.render.dashboard.num"
					size="mini"
					style="width: 96px"
					:options="[1, 2, 4, 6, 8].map((i) => ({ value: i, label: `显示${i}列` }))"
				>
				</a-select>
			</a-space>
		</div>

		<template v-if="processes.length === 0">
			<div
				class="d-flex"
				style="height: 50vh"
			>
				<a-empty
					class="m-auto"
					description="没有运行中的浏览器"
				></a-empty>
			</div>
		</template>
		<template v-else>
			<div
				class="dashboard mt-2"
				:style="{
					'grid-template-columns': `repeat(${store.render.dashboard.num}, 1fr)`
				}"
			>
				<template
					v-for="pro of runningProcesses"
					:key="pro.uid"
				>
					<div
						class="browser"
						:data-uid="pro.uid"
					>
						<!-- 头部操作按钮 -->
						<div class="browser-title">
							<a-row
								style="overflow: overlay"
								class="flex-nowrap"
							>
								<a-col flex="auto">
									<span
										class="text-secondary"
										style="font-size: 12px"
									>
										{{ pro.browser.name }}
									</span>
								</a-col>
								<a-col
									flex="120px"
									class="d-flex align-content-center justify-content-end text-end"
								>
									<a-space
										:size="0"
										class="justify-content-end"
									>
										<template #split>
											<a-divider
												direction="vertical"
												class="ms-1 me-1"
											/>
										</template>

										<BrowserOperators
											:space="false"
											:browser="pro.browser"
										>
											<template #split>
												<a-divider
													direction="vertical"
													class="ms-1 me-1"
												/>
											</template>
										</BrowserOperators>

										<EntityOperator
											type="browser"
											:entity="pro.browser"
											:permissions="['location', 'edit']"
										></EntityOperator>
									</a-space>
								</a-col>
							</a-row>
						</div>

						<!-- 截图区域 -->
						<a-tooltip
							content="点击置顶浏览器"
							position="bl"
						>
							<div
								class="browser-video"
								:style="{ aspectRatio: '16 / 9' }"
								@click="openBrowser(pro.uid)"
							>
								<img
									v-if="store.render.setting.browser.screenshotPreview && pro.frameUrl"
									:src="pro.frameUrl"
									alt="浏览器预览"
									class="screenshot-img"
								/>
								<div
									v-else
									class="screenshot-placeholder"
								>
									<template v-if="!store.render.setting.browser.screenshotPreview">
										<Icon type="image_not_supported" /> 截图预览未开启
									</template>
									<template v-else-if="pro.status === 'launching'">
										<Icon type="hourglass_top" /> 等待浏览器启动...
									</template>
									<template v-else> <Icon type="hourglass_top" /> 等待截图... </template>
								</div>
							</div>
						</a-tooltip>

						<!-- 显示浏览器信息 -->
						<a-row
							v-if="store.render.dashboard.details.notes || store.render.dashboard.details.tags"
							class="align-items-center"
						>
							<!-- 标签 -->
							<a-col
								v-if="store.render.dashboard.details.tags"
								style="width: 100px"
								flex="100px"
							>
								<Tags
									:tags="pro.browser.tags"
									:read-only="true"
									size="small"
								></Tags>
							</a-col>
							<!-- 备注 -->
							<a-col
								v-if="store.render.dashboard.details.notes"
								style="width: 100px"
								flex="100px"
								class="text-secondary notes"
							>
								<a-tooltip
									content="备注描述"
									position="tl"
								>
									<template #content>
										<div>备注描述{{ getDisplayNotes(pro.browser).isAuto ? '（来自自动化程序）' : '' }}</div>
										<a-divider class="mt-1 mb-1" />
										<div style="white-space: pre-line">
											{{ getDisplayNotes(pro.browser).text }}
										</div>
									</template>
									<span> {{ getDisplayNotes(pro.browser).text }} </span>
								</a-tooltip>
							</a-col>
						</a-row>
					</div>
				</template>
			</div>
		</template>
	</div>
</template>

<script setup lang="ts">
import { computed, watch, onMounted, nextTick } from 'vue';
import { Process, processes } from '../../utils/process';
import { useScreencastVisibility } from '../../composables/useScreencastVisibility';
import BrowserOperators from '../../components/browsers/BrowserOperators.vue';
import { t, store } from '../../store';
import Tags from '../../components/Tags.vue';
import EntityOperator from '../../components/EntityOperator.vue';
import Icon from '../../components/Icon.vue';
import UsageAlertCollapse from '../../components/UsageAlertCollapse.vue';
import { getDisplayNotes } from '../../utils/display-notes';

/** 运行中的进程（启动中 + 已启动） */
const runningProcesses = computed(() => processes.filter((p) => p.status === 'launched' || p.status === 'launching'));

/** 点击截图区域置顶浏览器 */
function openBrowser(uid: string) {
	Process.from(uid)?.bringToFront();
}

/** 卡片可见性驱动 Page.startScreencast 启停（仅可见卡片推流） */
const { refresh: refreshScreencast } = useScreencastVisibility({
	cardSelector: '.browser[data-uid]'
});

/** 进程状态快照，uid:status 变化时触发预览同步 */
const processesSnapshot = computed(() => processes.map((p) => `${p.uid}:${p.status}`).join('|'));

watch([processesSnapshot, () => store.render.dashboard.num], () => {
	nextTick(refreshScreencast);
});

onMounted(() => {
	nextTick(refreshScreencast);
});
</script>

<style scoped lang="less">
.dashboard {
	display: grid;
	gap: 2px;
	grid-template-columns: repeat(6, 1fr);
}

.browser {
	background-color: var(--theme-card-bg);
	padding: 4px;
	border-radius: 4px;

	&:hover {
		box-shadow: 0px 0px 4px -1px var(--theme-primary-color);
	}
}

.browser-video {
	position: relative;
	overflow: hidden;
	cursor: pointer;
	border-radius: 4px;
	background-color: #1d1d1f;
	display: flex;
	align-items: center;
	justify-content: center;
}

.screenshot-img {
	width: 100%;
	height: 100%;
	object-fit: cover;
	display: block;
}

.screenshot-placeholder {
	color: rgba(255, 255, 255, 0.7);
	font-size: 12px;
	text-align: center;
}

.browser-title {
	height: 26px;
}

.notes {
	font-size: 12px;
	text-overflow: ellipsis;
	white-space: nowrap;
	overflow: hidden;
}
</style>
