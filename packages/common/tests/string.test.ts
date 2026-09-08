import { describe, it, expect } from 'vitest';
import { StringUtils } from '../src/utils/string';

describe('StringUtils 静态方法', () => {
	describe('nowrap', () => {
		it('删除所有换行符', () => {
			expect(StringUtils.nowrap('a\nb\nc')).toBe('abc');
			expect(StringUtils.nowrap('line1\r\nline2')).toBe('line1\rline2');
		});

		it('undefined/空字符串返回空串', () => {
			expect(StringUtils.nowrap(undefined)).toBe('');
			expect(StringUtils.nowrap('')).toBe('');
		});

		it('无换行符时原样返回', () => {
			expect(StringUtils.nowrap('hello')).toBe('hello');
		});
	});

	describe('noSpecialChar', () => {
		it('删除特殊字符，保留字母数字下划线空白', () => {
			expect(StringUtils.noSpecialChar('hello world!')).toBe('hello world');
			expect(StringUtils.noSpecialChar('a@b#c_1')).toBe('abc_1');
		});

		it('中文等非 w 字符会被一并清除（w 不含 CJK，记录现有行为）', () => {
			expect(StringUtils.noSpecialChar('中文测试')).toBe('');
			expect(StringUtils.noSpecialChar('abc中文')).toBe('abc');
		});

		it('undefined 返回空串', () => {
			expect(StringUtils.noSpecialChar(undefined)).toBe('');
		});
	});

	describe('max', () => {
		it('超长时截断并追加省略号', () => {
			expect(StringUtils.max('1234567890', 5)).toBe('12345...');
		});

		it('长度恰好等于上限时不截断', () => {
			expect(StringUtils.max('12345', 5)).toBe('12345');
		});

		it('未超限时原样返回', () => {
			expect(StringUtils.max('abc', 10)).toBe('abc');
		});
	});

	describe('hide', () => {
		it('start 到 end 区间替换为 replacer', () => {
			expect(StringUtils.hide('13800138000', 3, 7)).toBe('138****8000');
		});

		it('自定义 replacer', () => {
			expect(StringUtils.hide('13800138000', 3, 7, '#')).toBe('138####8000');
		});

		it('start=0 隐藏前段', () => {
			expect(StringUtils.hide('abcdef', 0, 3)).toBe('***def');
		});
	});
});

describe('StringUtils 链式调用', () => {
	it('of 创建实例并支持链式', () => {
		const result = StringUtils.of('hello\nworld!').nowrap().noSpecialChar().toString();
		expect(result).toBe('helloworld');
	});

	it('链式 max', () => {
		expect(StringUtils.of('1234567890').max(4).toString()).toBe('1234...');
	});

	it('实例方法返回 this 支持连续调用', () => {
		const su = StringUtils.of('a b');
		expect(su.noSpecialChar()).toBe(su);
	});
});
