import type { Airport, Flight } from "../types";
import { findCity } from "./cityCatalog";

// 机票为 mock 数据：仅用于交通优先流程与飞行动画演示。
const PLATFORMS = ["携程", "去哪儿", "飞猪"];
const AIRLINES = [
  ["国航", "CA"],
  ["东航", "MU"],
  ["南航", "CZ"],
  ["川航", "3U"],
  ["海航", "HU"],
];

function fallbackAirport(city: string): Airport {
  const info = findCity(city);
  return {
    code: "---",
    name: `${city || "出发"}机场`,
    city: city || "出发",
    lng: info?.lng ?? 104.066,
    lat: info?.lat ?? 30.657,
  };
}

function buildFlights(from: Airport, to: Airport, outbound: boolean): Flight[] {
  const base = outbound
    ? [
        { dep: "08:15", arr: "11:20", dur: "3h05m", price: 980, bag: "20kg 托运 + 7kg 手提", note: "上午到达，第一天可安排市区轻路线" },
        { dep: "13:45", arr: "16:55", dur: "3h10m", price: 760, bag: "无免费托运，手提 7kg", note: "价格更低，第一天适合晚餐与夜游" },
        { dep: "前一晚 20:40", arr: "23:50", dur: "3h10m", price: 690, bag: "20kg 托运", note: "提前一天出发，次日完整游玩更划算" },
      ]
    : [
        { dep: "19:30", arr: "22:30", dur: "3h00m", price: 880, bag: "20kg 托运 + 7kg 手提", note: "玩满最后一天再返程" },
        { dep: "14:10", arr: "17:15", dur: "3h05m", price: 720, bag: "无免费托运，手提 7kg", note: "下午返程，机场不赶时间" },
        { dep: "10:05", arr: "13:10", dur: "3h05m", price: 650, bag: "20kg 托运", note: "上午返程，价格更低" },
      ];

  return base.map((b, i) => {
    const [airline, prefix] = AIRLINES[(i + (outbound ? 0 : 2)) % AIRLINES.length];
    return {
      id: `${outbound ? "out" : "ret"}-${i}`,
      platform: PLATFORMS[i % PLATFORMS.length],
      airline,
      flightNo: `${prefix}${1000 + i * 137}`,
      from,
      to,
      departTime: b.dep,
      arriveTime: b.arr,
      duration: b.dur,
      price: b.price,
      baggage: b.bag,
      dateNote: b.note,
    };
  });
}

export function outboundFlights(originCity: string, destCity: string): Flight[] {
  const from = findCity(originCity)?.airport ?? fallbackAirport(originCity);
  const to = findCity(destCity)?.airport ?? fallbackAirport(destCity);
  return buildFlights(from, to, true);
}

export function returnFlights(originCity: string, destCity: string): Flight[] {
  const from = findCity(destCity)?.airport ?? fallbackAirport(destCity);
  const to = findCity(originCity)?.airport ?? fallbackAirport(originCity);
  return buildFlights(from, to, false);
}
