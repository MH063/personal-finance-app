
import { describe, it, expect } from 'vitest';
import dayjs from 'dayjs';
import { disableFutureDate } from './dateUtils';

describe('dateUtils', () => {
  describe('disableFutureDate', () => {
    it('应禁用明天及以后的日期', () => {
      const tomorrow = dayjs().add(1, 'day');
      expect(disableFutureDate(tomorrow)).toBe(true);

      const nextMonth = dayjs().add(1, 'month');
      expect(disableFutureDate(nextMonth)).toBe(true);
    });

    it('不应禁用今天', () => {
      const today = dayjs();
      expect(disableFutureDate(today)).toBe(false);
    });

    it('不应禁用昨天及以前的日期', () => {
      const yesterday = dayjs().subtract(1, 'day');
      expect(disableFutureDate(yesterday)).toBe(false);

      const lastMonth = dayjs().subtract(1, 'month');
      expect(disableFutureDate(lastMonth)).toBe(false);
    });
  });
});
