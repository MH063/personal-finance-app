/**
 * 图标系统规范文档
 * 
 * Personal Finance App Icon System Guidelines
 * 
 * ========================================
 * 1. 图标命名规范
 * ========================================
 * 
 * 使用 kebab-case 命名法，格式：[category]-[name]-[state]
 * 
 * 分类前缀：
 * - nav-      导航图标
 * - action-   操作图标
 * - finance-  财务相关图标
 * - status-   状态图标
 * - ui-       通用UI图标
 * 
 * 状态后缀（可选）：
 * - filled    填充样式
 * - outlined  描边样式
 * - active    激活状态
 * - disabled  禁用状态
 * 
 * ========================================
 * 2. 图标分类
 * ========================================
 * 
 * 导航图标 (Navigation)
 * ----------------
 * nav-dashboard        仪表板
 * nav-transaction      交易
 * nav-income           收入
 * nav-expense          支出
 * nav-statistics       统计
 * nav-debt             债务
 * nav-backup           备份
 * nav-settings         设置
 * nav-profile          个人中心
 * 
 * 操作图标 (Actions)
 * -----------------
 * action-add           添加
 * action-edit          编辑
 * action-delete        删除
 * action-search        搜索
 * action-filter        筛选
 * action-export        导出
 * action-import        导入
 * action-refresh       刷新
 * action-download      下载
 * action-upload        上传
 * action-save          保存
 * action-cancel        取消
 * action-confirm       确认
 * action-close         关闭
 * action-back          返回
 * action-more          更多
 * action-setting       设置
 * action-help          帮助
 * 
 * 财务图标 (Finance)
 * -----------------
 * finance-wallet       钱包
 * finance-income       收入
 * finance-expense      支出
 * finance-transfer     转账
 * finance-category     分类
 * finance-chart        图表
 * finance-trend        趋势
 * finance-balance      余额
 * finance-budget       预算
 * finance-goal         目标
 * finance-investment   投资
 * finance-loan         贷款
 * finance-credit       信用
 * finance-reward       奖励
 * finance-bill         账单
 * finance-tax          税务
 * 
 * 状态图标 (Status)
 * ----------------
 * status-success       成功
 * status-error         错误
 * status-warning       警告
 * status-info          信息
 * status-pending       待处理
 * status-complete      已完成
 * status-failed        失败
 * status-active        激活
 * status-inactive      未激活
 * status-verified      已验证
 * status-rejected      已拒绝
 * 
 * 通用UI图标 (UI)
 * --------------
 * ui-menu              菜单
 * ui-search            搜索
 * ui-notification      通知
 * ui-message           消息
 * ui-user              用户
 * ui-calendar          日历
 * ui-clock             时钟
 * ui-location          位置
 * ui-phone             电话
 * ui-email             邮件
 * ui-link              链接
 * ui-image             图片
 * ui-file              文件
 * ui-folder            文件夹
 * ui-download          下载
 * ui-upload            上传
 * ui-eye               查看
 * ui-eye-invisible     隐藏
 * ui-lock              锁定
 * ui-unlock            解锁
 * ui-star              收藏
 * ui-heart            心形
 * ui-share            分享
 * ui-copy             复制
 * ui-cut              剪切
 * ui-paste            粘贴
 * ui-print            打印
 * ui-sort             排序
 * ui-filter           过滤
 * ui-grid             网格
 * ui-list             列表
 * ui-expand           展开
 * ui-collapse         折叠
 * ui-fullscreen       全屏
 * ui-exit-fullscreen  退出全屏
 * ui-loading          加载
 * ui-empty            空状态
 * ui-check            勾选
 * ui-uncheck          未勾选
 * ui-radio            单选
 * ui-chevron-up       上箭头
 * ui-chevron-down     下箭头
 * ui-chevron-left     左箭头
 * ui-chevron-right    右箭头
 * ui-angle-up         上角度
 * ui-angle-down       下角度
 * ui-angle-left       左角度
 * ui-angle-right      右角度
 * ui-arrow-up         上箭头（粗）
 * ui-arrow-down       下箭头（粗）
 * ui-arrow-left       左箭头（粗）
 * ui-arrow-right      右箭头（粗）
 * 
 * ========================================
 * 3. 图标尺寸规范
 * ========================================
 * 
 * 标准尺寸：
 * - xs:  12px  用于标签、徽章
 * - sm:  16px  用于紧凑场景
 * - md:  20px  用于按钮、导航（默认）
 * - lg:  24px  用于卡片头部
 * - xl:  32px  用于统计卡片图标
 * - 2xl: 48px  用于空状态、大图标
 * - 3xl: 64px  用于登录页面
 * 
 * 使用场景：
 * - 按钮内图标: 16px-20px
 * - 导航菜单图标: 20px
 * - 列表项图标: 24px
 * - 卡片图标: 32px-48px
 * - 页面大图标: 48px-64px
 * 
 * ========================================
 * 4. 图标交互规范
 * ========================================
 * 
 * 悬停状态
 * --------
 * - 轻微放大: transform: scale(1.1)
 * - 颜色变化: 过渡到主色
 * - 背景变化: 可选圆形背景
 * - 动画时长: 150ms-250ms
 * 
 * 点击状态
 * --------
 * - 缩放反馈: scale(0.95)
 * - 波纹效果（可选）
 * - 动画时长: 100ms
 * 
 * 加载状态
 * --------
 * - 旋转动画: spin 1s linear infinite
 * - 占位符: 骨架图标或脉冲点
 * 
 * 禁用状态
 * --------
 * - 透明度: 0.4
 * - 无交互反馈
 * 
 * ========================================
 * 5. 图标颜色规范
 * ========================================
 * 
 * 默认颜色: var(--color-text-tertiary)
 * 悬停颜色: var(--color-primary-500)
 * 激活颜色: var(--color-primary-500)
 * 成功状态: var(--color-success)
 * 警告状态: var(--color-warning)
 * 错误状态: var(--color-error)
 * 信息状态: var(--color-info)
 * 
 * ========================================
 * 6. 图标间距规范
 * ========================================
 * 
 * 图标与文字间距:
 * - 水平: var(--space-2) = 8px
 * - 垂直居中: 自动
 * 
 * 图标容器:
 * - 宽高: 与字体大小匹配
 * - 内边距: var(--space-1) = 4px（可增加点击区域）
 * 
 * ========================================
 * 7. 图标使用示例
 * ========================================
 * 
 * 基本用法:
 * ```tsx
 * import { HomeOutlined } from '@ant-design/icons';
 * 
 * <HomeOutlined className="nav-icon" />
 * ```
 * 
 * 带尺寸:
 * ```tsx
 * <HomeOutlined className="nav-icon nav-icon-lg" />
 * ```
 * 
 * 带交互:
 * ```tsx
 * <HomeOutlined 
 *   className="nav-icon interactive"
 *   onClick={handleClick}
 * />
 * ```
 * 
 * 自定义颜色:
 * ```tsx
 * <HomeOutlined style={{ color: 'var(--color-success)' }} />
 * ```
 * 
 * ========================================
 * 8. 性能优化
 * ========================================
 * 
 * 1. 使用 SVG Sprite（推荐）
 * 2. 按需加载图标组件
 * 3. 避免过多的图标动画
 * 4. 使用 CSS transform 代替改变宽高
 * 5. 考虑使用 iconfont 或 SVG 图标字体
 * 
 * ========================================
 * 9. 可访问性
 * ========================================
 * 
 * 1. 纯图标必须添加 aria-label
 * 2. 使用 title 元素提供提示
 * 3. 确保颜色对比度 ≥ 4.5:1
 * 4. 点击区域 ≥ 44px × 44px
 * 5. 支持键盘导航
 * 
 * ========================================
 * 10. 推荐图标库
 * ========================================
 * 
 * 主要图标库: Ant Design Icons
 * 补充图标库: 
 * - Phosphor Icons (现代风格)
 * - Heroicons (简洁风格)
 * - Lucide React (一致性)
 * 
 * ========================================
 */

/**
 * 图标尺寸类名
 */
export const iconSizeClasses = {
  xs: 'icon-xs',
  sm: 'icon-sm',
  md: 'icon-md',
  lg: 'icon-lg',
  xl: 'icon-xl',
  '2xl': 'icon-2xl',
  '3xl': 'icon-3xl',
} as const;

/**
 * 图标变体类名
 */
export const iconVariantClasses = {
  filled: 'icon-filled',
  outlined: 'icon-outlined',
  active: 'icon-active',
  disabled: 'icon-disabled',
} as const;

export type IconSize = keyof typeof iconSizeClasses;
export type IconVariant = keyof typeof iconVariantClasses;

/**
 * 图标辅助函数
 */
export function getIconClassName(
  baseClass: string,
  size: IconSize = 'md',
  variant?: IconVariant
): string {
  const classes = [baseClass, iconSizeClasses[size]];
  if (variant) {
    classes.push(iconVariantClasses[variant]);
  }
  return classes.join(' ');
}
