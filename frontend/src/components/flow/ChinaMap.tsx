import { useMemo } from "react";
import { CHINA_PROVINCES } from "../../assets/chinaGeo";

const WIDTH = 1000;
const PAD = 24;

interface ChinaMapProps {
  originProvince?: string;
  destinationProvinces?: string[];
  returnProvince?: string;
}

function roleClass(
  name: string,
  origin?: string,
  destinations?: string[],
  ret?: string,
): string {
  if (destinations?.includes(name)) return "province-path is-destination";
  if (origin === name) return "province-path is-origin";
  if (ret === name) return "province-path is-return";
  return "province-path";
}

export default function ChinaMap({
  originProvince,
  destinationProvinces = [],
  returnProvince,
}: ChinaMapProps) {
  const { paths, height } = useMemo(() => {
    let minLng = Infinity;
    let maxLng = -Infinity;
    let minLat = Infinity;
    let maxLat = -Infinity;
    for (const p of CHINA_PROVINCES) {
      for (const ring of p.rings) {
        for (const [lng, lat] of ring) {
          if (lng < minLng) minLng = lng;
          if (lng > maxLng) maxLng = lng;
          if (lat < minLat) minLat = lat;
          if (lat > maxLat) maxLat = lat;
        }
      }
    }
    const meanLat = ((minLat + maxLat) / 2) * (Math.PI / 180);
    const kx = Math.cos(meanLat);
    const spanX = (maxLng - minLng) * kx;
    const spanY = maxLat - minLat;
    const scale = (WIDTH - PAD * 2) / spanX;
    const h = spanY * scale + PAD * 2;

    const project = (lng: number, lat: number): [number, number] => {
      const x = PAD + (lng - minLng) * kx * scale;
      const y = PAD + (maxLat - lat) * scale; // 纬度向上，SVG y 向下，翻转
      return [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
    };

    const built = CHINA_PROVINCES.map((province) => {
      const d = province.rings
        .map((ring) => {
          const segs = ring.map(([lng, lat], i) => {
            const [x, y] = project(lng, lat);
            return `${i === 0 ? "M" : "L"}${x} ${y}`;
          });
          return `${segs.join(" ")} Z`;
        })
        .join(" ");
      return { name: province.name, d };
    });

    return { paths: built, height: Math.round(h) };
  }, []);

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${height}`}
      className="h-full w-full"
      role="img"
      aria-label="中国省份地图"
    >
      {paths.map((p) => (
        <path
          key={p.name}
          d={p.d}
          className={roleClass(
            p.name,
            originProvince,
            destinationProvinces,
            returnProvince,
          )}
        >
          <title>{p.name}</title>
        </path>
      ))}
    </svg>
  );
}
