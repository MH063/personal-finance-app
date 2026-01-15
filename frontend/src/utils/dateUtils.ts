
import dayjs, { Dayjs } from 'dayjs';

/**
 * 禁用未来日期的函数，用于 Ant Design DatePicker 的 disabledDate 属性
 * @param current 当前遍历的日期
 * @returns 如果日期在今天之后，返回 true（禁用）
 */
export const disableFutureDate = (current: Dayjs): boolean => {
  return current && current > dayjs().endOf('day');
};
