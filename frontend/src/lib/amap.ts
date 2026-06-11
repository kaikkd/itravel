import AMapLoader from "@amap/amap-jsapi-loader";

// 高德 JS API 2.0 单例加载（参照 amap-skills security.md / map-init.md）。
// 安全密钥(jscode)必须在 load 前写入 window._AMapSecurityConfig，否则地图不出图。
// 不引入 @amap/amap-jsapi-types，运行时 API 用宽松类型，避免额外类型依赖。

/* eslint-disable @typescript-eslint/no-explicit-any */
export type AMapNamespace = any;

declare global {
  interface Window {
    _AMapSecurityConfig?: { securityJsCode: string };
  }
}

const KEY = import.meta.env.VITE_AMAP_JS_KEY ?? "";
const SECURITY = import.meta.env.VITE_AMAP_SECURITY_CODE ?? "";

let loadPromise: Promise<AMapNamespace> | null = null;

export class AMapNotConfigured extends Error {
  constructor() {
    super("未配置高德 JS API Key（VITE_AMAP_JS_KEY）");
    this.name = "AMapNotConfigured";
  }
}

export function isAMapConfigured(): boolean {
  return KEY.trim().length > 0;
}

export function loadAMap(): Promise<AMapNamespace> {
  if (!isAMapConfigured()) {
    return Promise.reject(new AMapNotConfigured());
  }
  if (loadPromise) return loadPromise;

  if (SECURITY.trim()) {
    window._AMapSecurityConfig = { securityJsCode: SECURITY.trim() };
  }
  loadPromise = AMapLoader.load({
    key: KEY.trim(),
    version: "2.0",
    plugins: ["AMap.Driving", "AMap.Walking", "AMap.Transfer", "AMap.MarkerCluster"],
  });
  return loadPromise;
}
