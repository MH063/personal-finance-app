import React, { useState, useEffect } from 'react';
import { MinusOutlined, BorderOutlined, CloseOutlined, FullscreenExitOutlined } from '@ant-design/icons';
import './WindowControls.css';

interface WindowControlsProps {
  backgroundColor?: string;
}

/**
 * Electron 窗口控制按钮组件
 * 提供缩小、放大/还原、关闭功能，并根据背景亮度自动调整颜色
 */
const WindowControls: React.FC<WindowControlsProps> = ({ backgroundColor }) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [brightness, setBrightness] = useState(0); // 0-100

  useEffect(() => {
    // 获取初始状态
    const checkMaximized = async () => {
      try {
        if (window.electronAPI?.isWindowMaximized) {
          const maximized = await window.electronAPI.isWindowMaximized();
          setIsMaximized(maximized);
        }
      } catch (error) {
        console.warn('[WindowControls] Failed to check maximized state:', error);
        // 如果调用失败，默认设为 false，防止页面崩溃
        setIsMaximized(false);
      }
    };
    checkMaximized();

    // 监听状态变化
    if (window.electronAPI?.onWindowMaximized) {
      const unsubscribe = window.electronAPI.onWindowMaximized((value: boolean) => {
        setIsMaximized(value);
      });
      return () => {
        if (typeof unsubscribe === 'function') {
          unsubscribe();
        }
      };
    }
  }, []);

  useEffect(() => {
    if (!backgroundColor) {
      setBrightness(0); // 默认深色
      return;
    }

    // 如果是颜色值，直接计算亮度
    if (backgroundColor.startsWith('#') || backgroundColor.startsWith('rgb')) {
      const rgb = parseToRgb(backgroundColor);
      const b = calculateBrightness(rgb[0], rgb[1], rgb[2]);
      setBrightness(b);
    } else if (backgroundColor.startsWith('http') || backgroundColor.startsWith('blob')) {
      // 如果是图片 URL，采样亮度
      sampleImageBrightness(backgroundColor).then(setBrightness);
    }
  }, [backgroundColor]);

  const parseToRgb = (color: string): [number, number, number] => {
    if (color.startsWith('rgb')) {
      const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      return match ? [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])] : [0, 0, 0];
    }
    let hex = color.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    return [
      parseInt(hex.substring(0, 2), 16) || 0,
      parseInt(hex.substring(2, 4), 16) || 0,
      parseInt(hex.substring(4, 6), 16) || 0
    ];
  };

  const calculateBrightness = (r: number, g: number, b: number): number => {
    // 使用简单的亮度公式 (0.299*R + 0.587*G + 0.114*B) / 255 * 100
    return ((0.299 * r + 0.587 * g + 0.114 * b) / 255) * 100;
  };

  const sampleImageBrightness = (url: string): Promise<number> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "Anonymous";
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(0);
          return;
        }
        canvas.width = 100; // 缩小采样
        canvas.height = 100;
        ctx.drawImage(img, 0, 0, 100, 100);
        const data = ctx.getImageData(0, 0, 100, 100).data;
        let r = 0, g = 0, b = 0;
        for (let i = 0; i < data.length; i += 4) {
          r += data[i];
          g += data[i+1];
          b += data[i+2];
        }
        const count = data.length / 4;
        resolve(calculateBrightness(r / count, g / count, b / count));
      };
      img.onerror = () => resolve(0);
      img.src = url;
    });
  };

  const isLight = brightness > 60;
  const themeClass = isLight ? 'light-bg' : 'dark-bg';

  const handleMinimize = () => window.electronAPI?.minimizeWindow();
  const handleMaximize = () => window.electronAPI?.maximizeWindow();
  const handleClose = () => window.electronAPI?.closeWindow();

  return (
    <div className={`window-controls ${themeClass}`}>
      <button 
        className="control-btn minimize" 
        onClick={handleMinimize}
        title="最小化"
      >
        <MinusOutlined />
      </button>
      <button 
        className="control-btn maximize" 
        onClick={handleMaximize}
        title={isMaximized ? "还原" : "最大化"}
      >
        {isMaximized ? <FullscreenExitOutlined /> : <BorderOutlined />}
      </button>
      <button 
        className="control-btn close" 
        onClick={handleClose}
        title="关闭"
      >
        <CloseOutlined />
      </button>
    </div>
  );
};

export default WindowControls;
