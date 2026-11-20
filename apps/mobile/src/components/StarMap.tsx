import { KIND_VALUE, type MatchState, type PlanetId } from "@space-conquistador/game-core";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from "react-native";
import Svg, { Circle, Defs, G, Line, Path, Rect, Text as SvgText } from "react-native-svg";
import { useProgress } from "../hooks/useProgress";
import { colors, playerColor, svgFont } from "../theme/colors";
import { planetLook } from "../theme/planets";
import { CategoryGlyphG } from "./CategoryGlyph";
import { HalftoneDefs, PlanetArt } from "./PlanetArt";

type Props = {
  state: MatchState;
  /** Planets the human can act on right now. */
  selectable: PlanetId[];
  selectKind: "pick" | "attack" | null;
  /** Planet the human tapped and is about to confirm. */
  selected?: PlanetId | null;
  onTap: (id: PlanetId) => void;
  /** Planet under attack right now. */
  battleTarget?: PlanetId | null;
  /** Show category glyphs on planets. */
  showSectors?: boolean;
};

const PAD = 6;

const easeOut = (t: number) => 1 - (1 - t) * (1 - t);

/** Rotating dashed ring around planets you can act on. */
function SelectRing({ x, y, r, color }: { x: number; y: number; r: number; color: string }) {
  const t = useProgress(6000, true);
  const pulse = 0.5 + 0.5 * Math.sin(t * Math.PI * 2 * 4);
  return (
    <G transform={`rotate(${t * 360} ${x} ${y})`}>
      <Circle cx={x} cy={y} r={r + 0.6 * pulse} stroke={color} strokeWidth={0.7} strokeDasharray="1.6 1.2" fill="none" />
    </G>
  );
}

/** Crosshair on the planet under attack. */
function TargetMark({ x, y, r, color }: { x: number; y: number; r: number; color: string }) {
  const t = easeOut(useProgress(1400, true));
  const R = r + 2.5 + 1.5 * (1 - t);
  return (
    <G stroke={color} strokeWidth={0.7} opacity={0.4 + 0.6 * (1 - t)}>
      <Circle cx={x} cy={y} r={R} fill="none" />
      <Line x1={x - R - 1.5} y1={y} x2={x - R + 1.2} y2={y} />
      <Line x1={x + R - 1.2} y1={y} x2={x + R + 1.5} y2={y} />
      <Line x1={x} y1={y - R - 1.5} x2={x} y2={y - R + 1.2} />
      <Line x1={x} y1={y + R - 1.2} x2={x} y2={y + R + 1.5} />
    </G>
  );
}

/** Ink splash expanding once when a planet changes owner. */
function CaptureFlash({ x, y, r, color, onDone }: { x: number; y: number; r: number; color: string; onDone: () => void }) {
  const t = easeOut(useProgress(800, false, onDone));
  return (
    <G>
      <Circle cx={x} cy={y} r={r + 14 * t} stroke={color} strokeWidth={1.6 * (1 - t) + 0.2} fill="none" opacity={1 - t} />
      <Circle cx={x} cy={y} r={r + 7 * t} fill={color} opacity={0.35 * (1 - t)} />
    </G>
  );
}

/** Shield pips above a capital: filled = intact. */
function Shields({ x, y, total, left, color }: { x: number; y: number; total: number; left: number; color: string }) {
  return (
    <G>
      {Array.from({ length: total }, (_, i) => {
        const cx = x + (i - (total - 1) / 2) * 3.2;
        return (
          <Path
            key={i}
            d={`M ${cx - 1.1} ${y - 1.2} L ${cx + 1.1} ${y - 1.2} L ${cx + 1.1} ${y + 0.2} Q ${cx} ${y + 1.6} ${cx - 1.1} ${y + 0.2} Z`}
            fill={i < left ? color : "none"}
            stroke={color}
            strokeWidth={0.4}
          />
        );
      })}
    </G>
  );
}

export const StarMap = memo(function StarMap({
  state,
  selectable,
  selectKind,
  selected,
  onTap,
  battleTarget,
  showSectors = true,
}: Props) {
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

  const vbW = map.width + PAD * 2;
  const vbH = map.height + PAD * 2;
  const scale = Math.min(box.w / vbW, box.h / vbH);
  const svgW = vbW * scale;
  const svgH = vbH * scale;
  const selColor = selectKind === "attack" ? colors.human : colors.gold;

  return (
    <View style={styles.wrap} onLayout={onLayout}>
      {scale > 0 && (
        <Svg width={svgW} height={svgH} viewBox={`${-PAD} ${-PAD} ${vbW} ${vbH}`}>
          <Defs>
            <HalftoneDefs id="halftone" size={0.9} />
          </Defs>

          {/* star-chart frame: faint orbits around the centre */}
          <G stroke={colors.line} strokeWidth={0.25} fill="none" opacity={0.7}>
            <Circle cx={50} cy={70} r={22} strokeDasharray="0.6 1.4" />
            <Circle cx={50} cy={70} r={42} strokeDasharray="0.6 1.4" />
            <Circle cx={50} cy={70} r={62} strokeDasharray="0.6 1.4" />
          </G>

          {/* hyperlanes */}
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
                    stroke={same ? playerColor(owners[p.id]) : colors.lineHi}
                    strokeOpacity={same ? 0.85 : 0.7}
                    strokeWidth={same ? 0.8 : 0.35}
                    strokeDasharray={same ? undefined : "0.8 1"}
                  />
                );
              }),
          )}

          {map.planets.map((p) => {
            const look = planetLook(p.id);
            const owner = owners[p.id];
            const oc = playerColor(owner);
            const ringR = look.r + 1.5;
            const isSel = selectableSet.has(p.id);
            const isPicked = selected === p.id;
            const sector = state.sectors[p.id];
            const value = owner ? state.planetValue[p.id] : KIND_VALUE[p.kind];
            const label = `${p.name}`;
            const labelW = label.length * 1.75 + 3;
            const ly = p.y + look.r + 4.2;
            return (
              <G key={p.id}>
                <PlanetArt id={p.id} cx={p.x} cy={p.y} />
                {owner ? (
                  <Circle
                    cx={p.x}
                    cy={p.y}
                    r={ringR}
                    stroke={oc}
                    strokeWidth={owner === "bot" ? 1.1 : 1.3}
                    strokeDasharray={owner === "bot" ? "2 0.8" : undefined}
                    fill="none"
                  />
                ) : (
                  <Circle cx={p.x} cy={p.y} r={ringR} stroke={colors.neutral} strokeWidth={0.35} fill="none" />
                )}
                {isSel && !isPicked && <SelectRing x={p.x} y={p.y} r={ringR + 1.3} color={selColor} />}
                {isPicked && <Circle cx={p.x} cy={p.y} r={ringR + 1.4} stroke={colors.gold} strokeWidth={1.1} fill="none" />}
                {battleTarget === p.id && <TargetMark x={p.x} y={p.y} r={ringR} color={colors.gold} />}

                {p.capitalOf && (
                  <Shields
                    x={p.x}
                    y={p.y - look.r - 3.6}
                    total={state.config.capitalShields}
                    left={state.shields[p.capitalOf]}
                    color={colors.gold}
                  />
                )}

                {showSectors && sector && (
                  <G>
                    <Circle cx={p.x + look.r * 0.85} cy={p.y - look.r * 0.85} r={2.1} fill={colors.paper} stroke={colors.ink} strokeWidth={0.35} />
                    <CategoryGlyphG category={sector} x={p.x + look.r * 0.85} y={p.y - look.r * 0.85} size={2.9} color={colors.ink} />
                  </G>
                )}

                {/* name tag: owner colour when owned */}
                <Rect
                  x={p.x - labelW / 2}
                  y={ly - 2.3}
                  width={labelW}
                  height={3.6}
                  rx={0.5}
                  fill={owner ? oc : colors.bg}
                  stroke={owner ? colors.ink : colors.line}
                  strokeWidth={0.25}
                />
                <SvgText
                  x={p.x}
                  y={ly + 0.25}
                  fill={owner ? (owner === "human" ? colors.humanInk : colors.botInk) : colors.muted}
                  fontSize={2.4}
                  fontWeight="700"
                  fontFamily={svgFont}
                  textAnchor="middle"
                >
                  {label}
                </SvgText>
                <SvgText
                  x={p.x}
                  y={ly + 3.9}
                  fill={p.kind === "giant" ? colors.gold : colors.dim}
                  fontSize={2.1}
                  fontWeight="700"
                  fontFamily={svgFont}
                  textAnchor="middle"
                >
                  {p.kind === "outpost" ? `${value} · бонус` : `${value}`}
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
          {map.planets.map((p) => {
            const size = Math.max((planetLook(p.id).r + 4) * 2 * scale, 48);
            return (
              <Pressable
                key={p.id}
                accessibilityRole="button"
                accessibilityLabel={p.name}
                onPress={() => onTap(p.id)}
                style={{
                  position: "absolute",
                  left: (p.x + PAD) * scale - size / 2,
                  top: (p.y + PAD) * scale - size / 2,
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
