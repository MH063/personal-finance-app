/**
 * 颜色处理工具函数
 * 提供符合 WCAG 2.1 标准的颜色对比度计算和文字颜色自动选择功能
 */

/**
 * 将十六进制颜色或 RGBA 颜色转换为 RGB 数值数组
 * @param color 颜色字符串 (如 #ffffff, #fff, rgba(255, 255, 255, 0.5))
 * @returns [r, g, b] 数组，数值范围 0-255
 */
export const parseToRgb = (color: string): [number, number, number] => {
  // 处理 rgba / rgb
  if (color.startsWith('rgb')) {
    const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (match) {
      return [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])];
    }
  }

  // 处理 hex
  let hex = color.replace('#', '');
  if (hex.length === 3) {
    hex = hex.split('').map(char => char + char).join('');
  }
  
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  
  return [isNaN(r) ? 255 : r, isNaN(g) ? 255 : g, isNaN(b) ? 255 : b];
};

/**
 * 计算颜色的相对亮度 (Relative Luminance)
 * 遵循 WCAG 标准公式: L = 0.2126 * R + 0.7152 * G + 0.0722 * B
 * @param r 红 (0-255)
 * @param g 绿 (0-255)
 * @param b 蓝 (0-255)
 */
export const getLuminance = (r: number, g: number, b: number): number => {
  const [rs, gs, bs] = [r, g, b].map(c => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
};

/**
 * 计算两个亮度之间的对比度
 * 公式: (L1 + 0.05) / (L2 + 0.05)
 */
export const getContrastRatio = (l1: number, l2: number): number => {
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
};

/**
 * 根据背景色自动选择最佳文字颜色
 * @param bgColor 背景色
 * @returns 'light' | 'dark'
 */
export const getBestTextColor = (bgColor: string): 'white' | 'black' => {
  const [r, g, b] = parseToRgb(bgColor);
  const luminance = getLuminance(r, g, b);
  
  // 白色亮度为 1，黑色亮度为 0
  const contrastWithWhite = getContrastRatio(luminance, 1);
  const contrastWithBlack = getContrastRatio(luminance, 0);
  
  // WCAG 2.1 AA 标准要求对比度至少为 4.5:1
  // 优先选择对比度更高的颜色
  return contrastWithWhite > contrastWithBlack ? 'white' : 'black';
};

/**
 * 获取适应背景的文字阴影，增强可读性
 * @param textColor 文字颜色
 * @returns CSS text-shadow 属性值
 */
export const getOptimalTextShadow = (textColor: 'white' | 'black'): string => {
  if (textColor === 'white') {
    return '0 1px 2px rgba(0, 0, 0, 0.5), 0 0 1px rgba(0, 0, 0, 0.3)';
  } else {
    return '0 1px 1px rgba(255, 255, 255, 0.5)';
  }
};
