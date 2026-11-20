import type { MatchState, PlanetId } from "@space-conquistador/game-core";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from "react-native";
import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  Line,
  RadialGradient,
  Stop,
  Text as SvgText,
} from "react-native-svg";
import { colors, playerColor, svgFont } from "../theme/colors";
import { planetLook } from "../theme/planets";

type Props = {
  state: MatchState;
  /** Planets the human can tap right now. */
  selectable: PlanetId[];
  selectKind: "pick" | "attack" | null;
  onSelect: (id: PlanetId) => void;
  /** Planet currently under attack (highlighted during a battle question). */
  battleTarget?: PlanetId | null;
};

/**
 * Animation progress 0..1 driven by requestAnimationFrame (~30 fps). Only the component using it
 * re-renders, and it works the same on native and web (Animated SVG props warn on web).
 */
function useProgress(durationMs: number, loop: boolean, onDone?: () => void) {
  const [t, setT] = useState(0);
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    const start = Date.now();
    let last = 0;
    let raf = 0;
    const frame = () => {
      const now = Date.now();
      const p = (now - start) / durationMs;
      if (!loop && p >= 1) {
        done.current?.();
        return;
      }
      if (now - last > 33) {
        last = now;
        setT(loop ? p % 1 : p);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [durationMs, loop]);
  return t;
}

const easeOut = (t: number) => 1 - (1 - t) * (1 - t);

function PulseRing({ x, y, r, color }: { x: number; y: number; r: number; color: string }) {
  const t = easeOut(useProgress(1300, true));
  return <Circle cx={x} cy={y} r={r + 5 * t} stroke={color} strokeWidth={0.9} fill="none" opacity={1 - t} />;
}

/** Expanding ring shown once when a planet changes owner. */
function CaptureFlash({ x, y, r, color, onDone }: { x: number; y: number; r: number; color: string; onDone: () => void }) {
  const t = easeOut(useProgress(900, false, onDone));
  return <Circle cx={x} cy={y} r={r + 12 * t} stroke={color} strokeWidth={1.2} fill="none" opacity={0.9 * (1 - t)} />;
}

export const StarMap = memo(function StarMap({ state, selectable, selectKind, onSelect, battleTarget }: Props) {
  const { map, owners } = state;
  const [box, setBox] = useState({ w: 0, h: 0 });
  const selectableSet = useMemo(() => new Set(selectable), [selectable]);

  const prevOwners = useRef(owners);
  const [flashes, setFlashes] = useState<{ id: PlanetId; key: number }[]>([]);
  useEffect(() => {
    const changed = map.planets
      .filter((p) => owners[p.id] && prevOwners.current[p.id] !== owners[p.id])
      .map((p) => ({ id: p.id, key: Date.now() + Math.random() }));
    prevOwners.current = owners;
    if (changed.length) setFlashes((f) => [...f, ...changed]);
  }, [owners, map.planets]);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setBox({ w: width, h: height });
  };

  const scale = Math.min(box.w / map.width, box.h / map.height);
  const svgW = map.width * scale;
  const svgH = map.height * scale;
  const pulseColor = selectKind === "attack" ? colors.bot : colors.accent;

  return (
    <View style={styles.wrap} onLayout={onLayout}>
      {scale > 0 && (
        <Svg width={svgW} height={svgH} viewBox={`-4 -4 ${map.width + 8} ${map.height + 8}`}>
          <Defs>
            {map.planets.map((p) => {
              const look = planetLook(p.id);
              return (
                <RadialGradient key={p.id} id={`g-${p.id}`} cx="35%" cy="32%" r="75%">
                  <Stop offset="0" stopColor={look.light} />
                  <Stop offset="1" stopColor={look.dark} />
                </RadialGradient>
              );
            })}
          </Defs>

          {map.planets.flatMap((p) =>
            p.neighbors
              .filter((n) => p.id < n)
              .map((n) => {
                const q = map.planets.find((x) => x.id === n)!;
                const same = owners[p.id] && owners[p.id] === owners[n];
                return (
                  <Line
                    key={`${p.id}-${n}`}
                    x1={p.x}
                    y1={p.y}
                    x2={q.x}
                    y2={q.y}
                    stroke={same ? playerColor(owners[p.id]) : "#3a4280"}
                    strokeOpacity={same ? 0.55 : 0.6}
                    strokeWidth={same ? 0.7 : 0.4}
                    strokeDasharray={same ? undefined : "1.2 1.2"}
                  />
                );
              }),
          )}

          {map.planets.map((p) => {
            const look = planetLook(p.id);
            const owner = owners[p.id];
            const oc = playerColor(owner);
            const isSel = selectableSet.has(p.id);
            const isTarget = battleTarget === p.id;
            const ringR = look.r + 1.6;
            return (
              <G key={p.id}>
                {owner && <Circle cx={p.x} cy={p.y} r={look.r + 4} fill={oc} opacity={0.16} />}
                {look.ring && (
                  <Ellipse cx={p.x} cy={p.y} rx={look.r * 1.9} ry={look.r * 0.6} stroke={look.light} strokeOpacity={0.7} strokeWidth={0.7} fill="none" />
                )}
                <Circle cx={p.x} cy={p.y} r={look.r} fill={`url(#g-${p.id})`} />
                <Circle
                  cx={p.x}
                  cy={p.y}
                  r={ringR}
                  stroke={owner ? oc : colors.neutral}
                  strokeWidth={owner ? 1.1 : 0.5}
                  strokeDasharray={owner ? undefined : "1 1"}
                  fill="none"
                />
                {(isSel || isTarget) && (
                  <PulseRing x={p.x} y={p.y} r={ringR} color={isTarget ? colors.bot : pulseColor} />
                )}
                {isSel && <Circle cx={p.x} cy={p.y} r={ringR + 0.9} stroke={pulseColor} strokeWidth={0.6} fill="none" />}
                {p.capitalOf &&
                  Array.from({ length: state.config.capitalShields }, (_, i) => {
                    const n = state.config.capitalShields;
                    const left = state.shields[p.capitalOf!];
                    return (
                      <Circle
                        key={i}
                        cx={p.x + (i - (n - 1) / 2) * 3}
                        cy={p.y - look.r - 4}
                        r={1}
                        fill={i < left ? colors.accent : "transparent"}
                        stroke={colors.accent}
                        strokeWidth={0.35}
                      />
                    );
                  })}
                <SvgText
                  x={p.x}
                  y={p.y + look.r + 5}
                  fill={owner ? oc : colors.muted}
                  fontSize={3.3}
                  fontWeight="700"
                  fontFamily={svgFont}
                  textAnchor="middle"
                >
                  {p.name}
                </SvgText>
              </G>
            );
          })}

          {flashes.map((f) => {
            const p = map.planets.find((x) => x.id === f.id)!;
            return (
              <CaptureFlash
                key={f.key}
                x={p.x}
                y={p.y}
                r={planetLook(p.id).r}
                color={playerColor(owners[p.id])}
                onDone={() => setFlashes((all) => all.filter((x) => x.key !== f.key))}
              />
            );
          })}
        </Svg>
      )}
      {scale > 0 && (
        <View
          style={[styles.hitLayer, { left: (box.w - svgW) / 2, top: (box.h - svgH) / 2, width: svgW, height: svgH }]}
          pointerEvents="box-none"
        >
          {map.planets
            .filter((p) => selectableSet.has(p.id))
            .map((p) => {
              const k = svgW / (map.width + 8);
              const size = Math.max(planetLook(p.id).r + 5, 8) * 2 * k;
              return (
                <Pressable
                  key={p.id}
                  accessibilityRole="button"
                  accessibilityLabel={p.name}
                  onPress={() => onSelect(p.id)}
                  style={{
                    position: "absolute",
                    left: (p.x + 4) * k - size / 2,
                    top: (p.y + 4) * k - size / 2,
                    width: size,
                    height: size,
                    borderRadius: size / 2,
                  }}
                />
              );
            })}
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  hitLayer: { position: "absolute" },
});
