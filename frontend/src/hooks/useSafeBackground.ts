import { useEffect, useState } from 'react';

/**
 * 安全加载背景图片的 Hook
 * 通过 fetch 预加载图片并转换为 Blob URL，以绕过 ORB 拦截并消除控制台错误
 * @param imageUrl 原始图片 URL
 * @returns blobUrl 处理后的 URL 或 null
 */
export const useSafeBackground = (imageUrl: string | null) => {
  const [safeUrl, setSafeUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!imageUrl) {
      setSafeUrl(null);
      return;
    }

    let isMounted = true;
    const controller = new AbortController();
    let currentObjectUrl: string | null = null;

    const loadImage = async () => {
      // 如果是 picsum.photos 或本地资源，跳过 fetch 过程
      if (imageUrl.includes('picsum.photos') || imageUrl.startsWith('local-resource://')) {
        setSafeUrl(imageUrl);
        return;
      }

      try {
        // 使用 fetch 加载，这会触发 CORS 请求
        // 增加 cache: 'force-cache' 优先使用缓存
        const response = await fetch(imageUrl, {
          signal: controller.signal,
          mode: 'cors',
          credentials: 'omit',
          cache: 'force-cache'
        });

        if (!response.ok) throw new Error(`Network response was not ok: ${response.status}`);
        
        const blob = await response.blob();
        
        // 检查是否真的是图片
        if (!blob.type.startsWith('image/')) {
          throw new Error('Response is not an image');
        }

        const objectUrl = URL.createObjectURL(blob);
        currentObjectUrl = objectUrl;
        
        if (isMounted) {
          setSafeUrl(objectUrl);
        } else {
          // 如果组件已卸载，立即释放
          URL.revokeObjectURL(objectUrl);
        }
      } catch (error) {
        // 如果失败（被拦截或网络错误），回退到原始 URL
        if (isMounted) {
          if (error instanceof Error && error.name !== 'AbortError') {
            // 降低日志级别为 debug，避免干扰控制台
            console.debug(`[SafeBackground] Info: Image fallback to original URL for ${imageUrl}. Reason: ${error.message}`);
          }
          setSafeUrl(imageUrl);
        }
      }
    };

    loadImage();

    return () => {
      isMounted = false;
      controller.abort();
      if (currentObjectUrl) {
        URL.revokeObjectURL(currentObjectUrl);
      }
    };
  }, [imageUrl]);

  return safeUrl;
};
