import type { Airport } from "../types";

// 离线城市目录：省份名与 DataV GeoJSON 的 properties.name 保持一致，用于地图按省高亮。
export interface CityInfo {
  name: string;
  province: string;
  lng: number;
  lat: number;
  airport?: Airport;
}

const A = (
  code: string,
  name: string,
  city: string,
  lng: number,
  lat: number,
): Airport => ({ code, name, city, lng, lat });

export const CITY_CATALOG: CityInfo[] = [
  { name: "北京", province: "北京市", lng: 116.405, lat: 39.905, airport: A("PEK", "北京首都", "北京", 116.597, 40.078) },
  { name: "上海", province: "上海市", lng: 121.473, lat: 31.23, airport: A("PVG", "上海浦东", "上海", 121.805, 31.143) },
  { name: "广州", province: "广东省", lng: 113.264, lat: 23.129, airport: A("CAN", "广州白云", "广州", 113.307, 23.392) },
  { name: "深圳", province: "广东省", lng: 114.057, lat: 22.543, airport: A("SZX", "深圳宝安", "深圳", 113.811, 22.639) },
  { name: "成都", province: "四川省", lng: 104.066, lat: 30.657, airport: A("CTU", "成都双流", "成都", 103.947, 30.578) },
  { name: "重庆", province: "重庆市", lng: 106.551, lat: 29.563, airport: A("CKG", "重庆江北", "重庆", 106.642, 29.719) },
  { name: "杭州", province: "浙江省", lng: 120.155, lat: 30.274, airport: A("HGH", "杭州萧山", "杭州", 120.434, 30.235) },
  { name: "西安", province: "陕西省", lng: 108.94, lat: 34.341, airport: A("XIY", "西安咸阳", "西安", 108.752, 34.447) },
  { name: "昆明", province: "云南省", lng: 102.833, lat: 24.88, airport: A("KMG", "昆明长水", "昆明", 102.929, 25.101) },
  { name: "三亚", province: "海南省", lng: 109.508, lat: 18.247, airport: A("SYX", "三亚凤凰", "三亚", 109.412, 18.303) },
  { name: "厦门", province: "福建省", lng: 118.089, lat: 24.479, airport: A("XMN", "厦门高崎", "厦门", 118.128, 24.544) },
  { name: "南京", province: "江苏省", lng: 118.797, lat: 32.06, airport: A("NKG", "南京禄口", "南京", 118.862, 31.742) },
  { name: "武汉", province: "湖北省", lng: 114.305, lat: 30.593, airport: A("WUH", "武汉天河", "武汉", 114.208, 30.784) },
  { name: "长沙", province: "湖南省", lng: 112.939, lat: 28.228, airport: A("CSX", "长沙黄花", "长沙", 113.221, 28.189) },
  { name: "桂林", province: "广西壮族自治区", lng: 110.29, lat: 25.274, airport: A("KWL", "桂林两江", "桂林", 110.039, 25.218) },
  { name: "丽江", province: "云南省", lng: 100.233, lat: 26.872, airport: A("LJG", "丽江三义", "丽江", 100.246, 26.68) },
  { name: "青岛", province: "山东省", lng: 120.383, lat: 36.067, airport: A("TAO", "青岛胶东", "青岛", 120.097, 36.366) },
  { name: "哈尔滨", province: "黑龙江省", lng: 126.642, lat: 45.756, airport: A("HRB", "哈尔滨太平", "哈尔滨", 126.234, 45.623) },
  { name: "拉萨", province: "西藏自治区", lng: 91.172, lat: 29.652, airport: A("LXA", "拉萨贡嘎", "拉萨", 90.912, 29.298) },
  { name: "乌鲁木齐", province: "新疆维吾尔自治区", lng: 87.617, lat: 43.793, airport: A("URC", "乌鲁木齐地窝堡", "乌鲁木齐", 87.474, 43.907) },
  { name: "贵阳", province: "贵州省", lng: 106.713, lat: 26.578, airport: A("KWE", "贵阳龙洞堡", "贵阳", 106.801, 26.539) },
  { name: "天津", province: "天津市", lng: 117.19, lat: 39.125, airport: A("TSN", "天津滨海", "天津", 117.346, 39.124) },
  { name: "郑州", province: "河南省", lng: 113.625, lat: 34.747, airport: A("CGO", "郑州新郑", "郑州", 113.841, 34.527) },
  { name: "沈阳", province: "辽宁省", lng: 123.431, lat: 41.805, airport: A("SHE", "沈阳桃仙", "沈阳", 123.483, 41.64) },
];

export const POPULAR_CITIES = ["成都", "北京", "上海", "西安", "重庆"];

const BY_NAME = new Map(CITY_CATALOG.map((c) => [c.name, c]));

export function findCity(name: string): CityInfo | undefined {
  return BY_NAME.get(name);
}

export function cityProvince(name: string): string | undefined {
  return BY_NAME.get(name)?.province;
}

export function searchCities(query: string): CityInfo[] {
  const q = query.trim();
  if (!q) {
    return POPULAR_CITIES.map((n) => BY_NAME.get(n)).filter(
      (c): c is CityInfo => Boolean(c),
    );
  }
  return CITY_CATALOG.filter(
    (c) => c.name.includes(q) || c.province.includes(q),
  ).slice(0, 8);
}
