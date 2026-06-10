import { useEffect, useState } from "react";
import { getCandidates, regenerateCandidates } from "../api/client";
import { useItineraryStore } from "../store/itineraryStore";
import type { Category, POI } from "../types";
import { Alert, Badge, Button, SkeletonLine } from "./ui";

const GROUPS: { category: Category; label: string; hint: string }[] = [
  { category: "play", label: "玩", hint: "景点与体验" },
  { category: "eat", label: "吃", hint: "餐厅与小吃" },
  { category: "stay", label: "住", hint: "住宿区域" },
];

interface GroupState {
  pois: POI[];
  loading: boolean;
  degraded: boolean;
  seen: string[];
}

const emptyGroup = (): GroupState => ({
  pois: [],
  loading: false,
  degraded: false,
  seen: [],
});

function CandidateCard({
  poi,
  onAdd,
  onRemove,
}: {
  poi: POI;
  onAdd: () => void;
  onRemove: () => void;
}) {
  return (
    <article className="candidate-card">
      <div>
        <div className="candidate-meta">
          {poi.address || (poi.lng != null && poi.lat != null ? "坐标可用" : "待补坐标")}
        </div>
        <h3>{poi.name}</h3>
        <p className="candidate-reason">
          {poi.rec_reason || "适合加入当前行程，后续可拖拽调整顺序。"}
        </p>
        {poi.sources.length > 0 && (
          <div className="candidate-meta">
            来源：
            <a href={poi.sources[0].url} target="_blank" rel="noreferrer">
              {poi.sources[0].summary || "公开链接"}
            </a>
          </div>
        )}
      </div>
      <div className="card-actions">
        <Button variant="primary" onClick={onAdd} style={{ flex: 1 }}>
          加入
        </Button>
        <Button variant="ghost" onClick={onRemove}>
          剔除
        </Button>
      </div>
    </article>
  );
}

function SkeletonCard() {
  return (
    <article className="candidate-card" aria-hidden="true">
      <div>
        <SkeletonLine width="44%" height={10} />
        <div style={{ marginTop: 14 }}>
          <SkeletonLine width="78%" height={16} />
        </div>
        <div style={{ marginTop: 12 }}>
          <SkeletonLine width="96%" />
        </div>
        <div style={{ marginTop: 8 }}>
          <SkeletonLine width="68%" />
        </div>
      </div>
    </article>
  );
}

export default function Feed() {
  const itinerary = useItineraryStore((s) => s.itinerary);
  const selectCandidate = useItineraryStore((s) => s.selectCandidate);
  const city = itinerary?.city ?? "";

  const [groups, setGroups] = useState<Record<Category, GroupState>>({
    play: emptyGroup(),
    eat: emptyGroup(),
    stay: emptyGroup(),
  });
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (!city) return;
    let cancelled = false;
    for (const { category } of GROUPS) {
      setGroups((g) => ({
        ...g,
        [category]: { ...g[category], loading: true, degraded: false },
      }));
      getCandidates(city, category)
        .then((res) => {
          if (cancelled) return;
          setGroups((g) => ({
            ...g,
            [category]: {
              pois: res.pois,
              loading: false,
              degraded: res.degraded,
              seen: res.pois.map((p) => p.name),
            },
          }));
        })
        .catch(() => {
          if (cancelled) return;
          setGroups((g) => ({ ...g, [category]: { ...emptyGroup() } }));
        });
    }
    return () => {
      cancelled = true;
    };
  }, [city]);

  function handleRemove(category: Category, name: string) {
    const excludeSnapshot = [...new Set([...groups[category].seen, name])];
    setGroups((g) => {
      return {
        ...g,
        [category]: {
          ...g[category],
          pois: g[category].pois.filter((p) => p.name !== name),
          loading: true,
        },
      };
    });
    regenerateCandidates(city, category, excludeSnapshot)
      .then((res) => {
        setGroups((g) => ({
          ...g,
          [category]: {
            pois: res.pois,
            loading: false,
            degraded: res.degraded,
            seen: [...new Set([...g[category].seen, ...res.pois.map((p) => p.name)])],
          },
        }));
      })
      .catch(() => {
        setGroups((g) => ({
          ...g,
          [category]: { ...g[category], loading: false, degraded: true },
        }));
      });
  }

  if (!itinerary) return null;

  return (
    <section className="feed-drawer" aria-label="候选卡片流">
      <div className="feed-header">
        <div>
          <p className="section-kicker">Carousel Feed</p>
          <h2>候选卡片流</h2>
        </div>
        <div className="topbar-actions">
          <Badge>{city || "未选择城市"}</Badge>
          <Button variant="ghost" onClick={() => setCollapsed((c) => !c)}>
            {collapsed ? "展开" : "收起"}
          </Button>
        </div>
      </div>

      {!collapsed && (
        <div className="feed-content">
          {GROUPS.map(({ category, label, hint }) => {
            const g = groups[category];
            return (
              <div key={category} className="feed-group">
                <div className="feed-group-title">
                  <div>{label}</div>
                  <span>{hint}</span>
                </div>
                <div>
                  {g.degraded && (
                    <div style={{ marginBottom: 8 }}>
                      <Alert tone="warning">该类目已使用兜底推荐。</Alert>
                    </div>
                  )}
                  <div className="card-row">
                    {g.pois.map((poi) => (
                      <CandidateCard
                        key={`${category}-${poi.name}`}
                        poi={poi}
                        onAdd={() => selectCandidate(poi)}
                        onRemove={() => handleRemove(category, poi.name)}
                      />
                    ))}
                    {g.loading && (
                      <>
                        <SkeletonCard />
                        <SkeletonCard />
                      </>
                    )}
                    {!g.loading && g.pois.length === 0 && (
                      <div className="alert">暂无候选，试试重新规划或更换偏好。</div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
