import { describe, it, expect, vi, beforeAll } from 'vitest';
import crypto from 'crypto';

// ── 隔离 Electron / keytar / Logger，使 crypto.ts 的 AES-256-GCM 纯逻辑可在 Node 下测试 ──

// 测试用固定密钥（32 字节 = AES-256）
const TEST_KEY_HEX = crypto.randomBytes(32).toString('hex');

vi.mock('electron', () => ({
	safeStorage: {
		// AES 可用时不会走 safeStorage 分支，仅兜底
		encryptString: () => {
			throw new Error('safeStorage should not be used in AES tests');
		},
		decryptString: () => {
			throw new Error('safeStorage should not be used in AES tests');
		}
	}
}));

vi.mock('keytar', () => ({
	default: {
		getPassword: vi.fn(async () => TEST_KEY_HEX), // 直接返回测试密钥
		setPassword: vi.fn(async () => undefined)
	}
}));

vi.mock('../src/logger', () => ({
	Logger: () => ({
		info: () => undefined,
		warn: () => undefined,
		error: () => undefined,
		debug: () => undefined
	})
}));

// 动态导入，确保 mock 先生效（vitest 会提升 vi.mock 至顶部，此 import 语义上依赖其在前）
// eslint-disable-next-line import/first
import {
	initAesKey,
	isAesAvailable,
	encryptAes,
	decryptAes,
	encryptRenderString,
	decryptRenderString,
	getDecryptedRenderData
} from '../src/crypto';

describe('AES-256-GCM 加解密', () => {
	beforeAll(async () => {
		await initAesKey();
	});

	it('keytar 可用时 isAesAvailable 为 true', () => {
		expect(isAesAvailable()).toBe(true);
	});

	it('加密格式为 iv:authTag:ciphertext（三段 base64）', () => {
		const encrypted = encryptAes('hello');
		const parts = encrypted.split(':');
		expect(parts).toHaveLength(3);
		parts.forEach((p) => expect(() => Buffer.from(p, 'base64')).not.toThrow());
	});

	it('相同明文每次加密结果不同（随机 iv）', () => {
		expect(encryptAes('same')).not.toBe(encryptAes('same'));
	});

	it('round-trip：加密后可解密还原', () => {
		const cases = ['', 'a', 'hello world', '中文测试', '{"key":123,"arr":[1,2]}', 'a'.repeat(1000)];
		for (const plain of cases) {
			expect(decryptAes(encryptAes(plain))).toBe(plain);
		}
	});

	it('篡改密文导致解密失败（GCM 完整性校验）', () => {
		const encrypted = encryptAes('important data');
		const parts = encrypted.split(':');
		// 篡改 ciphertext 段
		const tampered = parts[0] + ':' + parts[1] + ':' + Buffer.from('tampered-bytes').toString('base64');
		expect(() => decryptAes(tampered)).toThrow();
	});
});

describe('渲染进程数据加解密（AES 方案）', () => {
	it('encryptRenderString/decryptRenderString round-trip', () => {
		const json = JSON.stringify({ token: 'abc123', browsers: [{ name: 'chrome' }] });
		expect(decryptRenderString(encryptRenderString(json))).toBe(json);
	});

	it('getDecryptedRenderData 解析加密后的 render 字符串', () => {
		const data = { theme: 'dark', port: 15319 };
		const store = { store: { render: encryptRenderString(JSON.stringify(data)) } };
		expect(getDecryptedRenderData(store)).toEqual(data);
	});

	it('getDecryptedRenderData 兼容明文对象', () => {
		const store = { store: { render: { theme: 'light' } } };
		expect(getDecryptedRenderData(store)).toEqual({ theme: 'light' });
	});

	it('getDecryptedRenderData 空值回退为空对象', () => {
		expect(getDecryptedRenderData({ store: { render: undefined } })).toEqual({});
	});
});
