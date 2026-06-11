import type { Airport, Flight } from "../types";
import { findCity } from "./cityCatalog";

// 机票/高铁为 mock 数据：仅用于交通优先流程演示。
const PLATFORMS = ["携程", "去哪儿", "飞猪"];
const AIRLINES = [
  ["国航", "CA"],
  ["东航", "MU"],
  ["南航", "CZ"],
  ["川航", "3U"],
  ["海航", "HU"],
];

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

// 默认出发日：今天 + 7 天（给用户留出预定提前量）。
export function defaultDepartDate(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 7);
  return d;
}

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dateLabel(d: Date): string {
  return `${d.getMonth() + 1}月${d.getDate()}日 ${WEEKDAYS[d.getDay()]}`;
}

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

function buildFlights(
  from: Airport,
  to: Airport,
  outbound: boolean,
  depDate: Date,
): Flight[] {
  const base = outbound
    ? [
        { dep: "08:15", arr: "11:20", dur: 185, price: 980, bag: "20kg 托运 + 7kg 手提", note: "上午到达，第一天可安排市区轻路线", dayShift: 0 },
        { dep: "13:45", arr: "16:55", dur: 190, price: 760, bag: "无免费托运，手提 7kg", note: "价格更低，第一天适合晚餐与夜游", dayShift: 0 },
        { dep: "20:40", arr: "23:50", dur: 190, price: 690, bag: "20kg 托运", note: "提前一晚出发，次日完整游玩更划算", dayShift: -1 },
      ]
    : [
        { dep: "19:30", arr: "22:30", dur: 180, price: 880, bag: "20kg 托运 + 7kg 手提", note: "玩满最后一天再返程", dayShift: 0 },
        { dep: "14:10", arr: "17:15", dur: 185, price: 720, bag: "无免费托运，手提 7kg", note: "下午返程，机场不赶时间", dayShift: 0 },
        { dep: "10:05", arr: "13:10", dur: 185, price: 650, bag: "20kg 托运", note: "上午返程，价格更低", dayShift: 0 },
      ];

  return base.map((b, i) => {
    const [airline, prefix] = AIRLINES[(i + (outbound ? 0 : 2)) % AIRLINES.length];
    const d = addDays(depDate, b.dayShift);
    return {
      id: `${outbound ? "out" : "ret"}-air-${i}`,
      kind: "flight" as const,
      platform: PLATFORMS[i % PLATFORMS.length],
      airline,
      flightNo: `${prefix}${1000 + i * 137}`,
      from,
      to,
      date: isoDate(d),
      dateLabel: dateLabel(d),
      departTime: b.dep,
      arriveTime: b.arr,
      durationMinutes: b.dur,
      duration: `${Math.floor(b.dur / 60)}h${String(b.dur % 60).padStart(2, "0")}m`,
      price: b.price,
      baggage: b.bag,
      dateNote: b.note,
    };
  });
}

// ---- 高铁 mock（与机票同结构，kind=train）----
const TRAIN_PLATFORMS = ["12306", "携程", "智行"];
const TRAIN_OPERATORS = ["复兴号", "和谐号"];
const SEATS = ["二等座", "一等座", "商务座"];

function trainStation(city: string): Airport {
  const info = findCity(city);
  return {
    code: `${city || "出发"}站`,
    name: `${city || "出发"}站`,
    city: city || "出发",
    lng: info?.lng ?? 104.066,
    lat: info?.lat ?? 30.657,
  };
}

function buildTrains(
  from: Airport,
  to: Airport,
  outbound: boolean,
  depDate: Date,
): Flight[] {
  const base = outbound
    ? [
        { dep: "07:30", arr: "12:10", dur: 280, price: 538, seat: SEATS[0], note: "早班高铁，到站即可开玩" },
        { dep: "10:20", arr: "15:05", dur: 285, price: 538, seat: SEATS[1], note: "一等座更宽敞，午后到达" },
        { dep: "14:00", arr: "18:36", dur: 276, price: 880, seat: SEATS[2], note: "商务座，舒适但价更高" },
      ]
    : [
        { dep: "18:40", arr: "23:15", dur: 275, price: 538, seat: SEATS[0], note: "玩满最后一天再返程" },
        { dep: "15:10", arr: "19:50", dur: 280, price: 538, seat: SEATS[1], note: "下午返程不慌不忙" },
        { dep: "11:05", arr: "15:40", dur: 275, price: 880, seat: SEATS[2], note: "商务座，上午出发" },
      ];

  return base.map((b, i) => {
    const d = depDate;
    return {
      id: `${outbound ? "out" : "ret"}-train-${i}`,
      kind: "train" as const,
      platform: TRAIN_PLATFORMS[i % TRAIN_PLATFORMS.length],
      airline: TRAIN_OPERATORS[i % TRAIN_OPERATORS.length],
      flightNo: `${i % 2 === 0 ? "G" : "D"}${1200 + i * 96}`,
      from,
      to,
      date: isoDate(d),
      dateLabel: dateLabel(d),
      departTime: b.dep,
      arriveTime: b.arr,
      durationMinutes: b.dur,
      duration: `${Math.floor(b.dur / 60)}h${String(b.dur % 60).padStart(2, "0")}m`,
      price: b.price,
      baggage: b.seat,
      dateNote: b.note,
    };
  });
}

export function outboundFlights(
  originCity: string,
  destCity: string,
  departDate: Date = defaultDepartDate(),
): Flight[] {
  const from = findCity(originCity)?.airport ?? fallbackAirport(originCity);
  const to = findCity(destCity)?.airport ?? fallbackAirport(destCity);
  return buildFlights(from, to, true, departDate);
}

export function returnFlights(
  originCity: string,
  destCity: string,
  returnDate: Date,
): Flight[] {
  const from = findCity(destCity)?.airport ?? fallbackAirport(destCity);
  const to = findCity(originCity)?.airport ?? fallbackAirport(originCity);
  return buildFlights(from, to, false, returnDate);
}

export function outboundTrains(
  originCity: string,
  destCity: string,
  departDate: Date = defaultDepartDate(),
): Flight[] {
  return buildTrains(trainStation(originCity), trainStation(destCity), true, departDate);
}

export function returnTrains(
  originCity: string,
  destCity: string,
  returnDate: Date,
): Flight[] {
  return buildTrains(trainStation(destCity), trainStation(originCity), false, returnDate);
}

// 行程概览的派生数据：几天几晚、总在途时长等。
export interface TripSummary {
  dayCount: number; // 几天
  nightCount: number; // 几晚
  departDateLabel: string;
  returnDateLabel: string;
  totalTransitMinutes: number;
}

export function formatMinutes(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m} 分钟`;
  return m === 0 ? `${h} 小时` : `${h} 小时 ${m} 分`;
}
