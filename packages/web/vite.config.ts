import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { visualizer } from 'rollup-plugin-visualizer';
import commonjs from 'vite-plugin-commonjs';

import path from 'path';
// https://vitejs.dev/config/
export default defineConfig({
	build: {
		outDir: '../app/public',
		rollupOptions: {
			output: {
				manualChunks(id) {
					if (id.includes('node_modules')) {
						return id.toString().split('node_modules/')[1].split('/')[0].toString();
					}
				}
			}
		},
		/** 是否压缩代码， 这里写 false，不然打包后类名会发生变化 */
		minify: false
	},
	server: {
		open: false
	},
	base: '',
	resolve: {
		alias: [
			// monorepo 源码别名：直接编译 common 的 web 安全入口源码，
			// 避免引用 common/lib（CJS 产物）导致的浏览器兼容问题，同时保证类型与代码实时一致
			{ find: '@ocs-desktop/common/web', replacement: path.resolve(__dirname, '../common/web.ts') },
			{ find: '@', replacement: path.resolve(__dirname, './src') },
			{ find: 'root', replacement: path.resolve(__dirname) },
			{ find: 'app', replacement: path.resolve(__dirname, './app') }
		]
	},
	plugins: [commonjs({ filter: (id) => (id.includes('xlsx') ? undefined : false) }), vue(), visualizer()]
});
