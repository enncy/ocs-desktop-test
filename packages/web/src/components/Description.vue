<template>
	<a-row class="row flex-nowrap mb-2">
		<a-col
			flex="160px"
			class="desc-label"
		>
			<slot name="label">{{ label }}</slot>
		</a-col>

		<a-col
			flex="auto"
			class="d-inline-flex align-items-center justify-content-end"
		>
			<span
				v-if="desc"
				class="desc"
				:class="textClass"
				:style="textStyle"
			>
				{{ String(desc) }}
			</span>
			<slot />
		</a-col>
	</a-row>
</template>

<script setup lang="ts">
import { CSSProperties, toRefs } from 'vue';
interface DescriptionProps {
	label?: string;
	desc?: any;
	textClass?: any;
	textStyle?: CSSProperties;
}
const props = withDefaults(defineProps<DescriptionProps>(), {
	label: '',
	desc: '',
	textClass: '',
	textStyle: undefined
});
const { label, desc, textClass } = toRefs(props);
</script>

<style scoped lang="less">
.desc {
	word-wrap: break-word;
	word-break: break-all;
}

.desc-label {
	white-space: nowrap;
}
</style>
