import { memo } from "react";
import Svg, { Circle, ClipPath, Defs, Ellipse, G, Path, Pattern, Rect } from "react-native-svg";
import { colors } from "../theme/colors";
import { planetLook, type PlanetLook } from "../theme/planets";

/** Halftone dot pattern used for planets' night side. Put once in a parent <Defs>. */
export function HalftoneDefs({ id = "halftone", size = 1.1, color = colors.ink }: { id?: string; size?: number; color?: string }) {
  return (
    <Pattern id={id} patternUnits="userSpaceOnUse" width={size} height={size}>
      <Circle cx={size / 2} cy={size / 2} r={size * 0.28} fill={color} />
    </Pattern>
  );
}

type Props = {
  id: string;
  cx: number;
  cy: number;
  /** Override radius (defaults to the look's radius). */
  r?: number;
  /** Unique prefix for SVG ids when the same planet is drawn twice on one page. */
  uid?: string;
  halftoneId?: string;
};

function ringArc(cx: number, cy: number, rx: number, ry: number, front: boolean) {
  return front
    ? `M ${cx + rx} ${cy} A ${rx} ${ry} 0 0 1 ${cx - rx} ${cy}`
    : `M ${cx - rx} ${cy} A ${rx} ${ry} 0 0 1 ${cx + rx} ${cy}`;
}

function Details({ look, cx, cy, r }: { look: PlanetLook; cx: number; cy: number; r: number }) {
  const st = look.style;
  switch (st.kind) {
    case "banded": {
      const n = st.bands.length;
      return (
        <G transform={`rotate(-15 ${cx} ${cy})`}>
          {st.bands.map((c, i) => {
            const y = cy - r + ((i + 1) * 2 * r) / (n + 1);
            return <Rect key={i} x={cx - r * 1.3} y={y - r * 0.16} width={r * 2.6} height={r * 0.3} fill={c} />;
          })}
          {st.spot && <Ellipse cx={cx + r * 0.3} cy={cy + r * 0.32} rx={r * 0.26} ry={r * 0.15} fill={st.spot} />}
        </G>
      );
    }
    case "cratered":
      return (
        <G>
          <Circle cx={cx - r * 0.35} cy={cy - r * 0.25} r={r * 0.26} fill={st.crater} />
          <Circle cx={cx + r * 0.3} cy={cy + r * 0.1} r={r * 0.17} fill={st.crater} />
          <Circle cx={cx - r * 0.05} cy={cy + r * 0.5} r={r * 0.12} fill={st.crater} />
        </G>
      );
    case "earth":
      return (
        <G>
          <Path
            d={`M ${cx - r * 0.7} ${cy - r * 0.35} q ${r * 0.35} ${-r * 0.45} ${r * 0.8} ${-r * 0.25} q ${r * 0.2} ${r * 0.3} ${-r * 0.1} ${r * 0.55} q ${-r * 0.45} ${r * 0.25} ${-r * 0.7} ${-r * 0.3} z`}
            fill={st.land}
          />
          <Path
            d={`M ${cx + r * 0.15} ${cy + r * 0.15} q ${r * 0.45} ${-r * 0.2} ${r * 0.6} ${r * 0.2} q ${-r * 0.05} ${r * 0.45} ${-r * 0.4} ${r * 0.45} q ${-r * 0.3} ${-r * 0.25} ${-r * 0.2} ${-r * 0.65} z`}
            fill={st.land}
          />
        </G>
      );
    case "lined":
      return (
        <G stroke={st.line} strokeWidth={r * 0.07} fill="none" strokeLinecap="round">
          <Path d={`M ${cx - r} ${cy - r * 0.3} Q ${cx} ${cy - r * 0.6} ${cx + r} ${cy + r * 0.1}`} />
          <Path d={`M ${cx - r * 0.8} ${cy + r * 0.4} Q ${cx - r * 0.1} ${cy} ${cx + r * 0.6} ${cy + r * 0.7}`} />
          <Path d={`M ${cx - r * 0.2} ${cy - r} L ${cx + r * 0.2} ${cy + r}`} />
        </G>
      );
    case "heart":
      return (
        <Path
          d={`M ${cx + r * 0.1} ${cy + r * 0.55} C ${cx - r * 0.6} ${cy + r * 0.1} ${cx - r * 0.35} ${cy - r * 0.45} ${cx + r * 0.1} ${cy - r * 0.15} C ${cx + r * 0.5} ${cy - r * 0.5} ${cx + r * 0.85} ${cy} ${cx + r * 0.1} ${cy + r * 0.55} z`}
          fill={st.patch}
          opacity={0.9}
        />
      );
  }
}

/** One planet drawn inside a parent <Svg>. The parent must include <HalftoneDefs/>. */
export const PlanetArt = memo(function PlanetArt({ id, cx, cy, r: rOverride, uid = "", halftoneId = "halftone" }: Props) {
  const look = planetLook(id);
  const r = rOverride ?? look.r;
  const clip = `clip-${uid}${id}`;
  const rx = r * 1.85;
  const ry = r * 0.5;
  return (
    <G>
      <Defs>
        <ClipPath id={clip}>
          <Circle cx={cx} cy={cy} r={r} />
        </ClipPath>
      </Defs>
      {look.ring && (
        <G transform={`rotate(-15 ${cx} ${cy})`}>
          <Path d={ringArc(cx, cy, rx, ry, false)} stroke={look.ring} strokeWidth={r * 0.22} fill="none" />
        </G>
      )}
      {/* misregistered print layer */}
      <Circle cx={cx + r * 0.12} cy={cy + r * 0.12} r={r} fill={look.shade} opacity={0.55} />
      <G clipPath={`url(#${clip})`}>
        <Circle cx={cx} cy={cy} r={r} fill={look.base} />
        <Details look={look} cx={cx} cy={cy} r={r} />
        <Circle cx={cx + r * 0.38} cy={cy + r * 0.38} r={r * 1.05} fill={`url(#${halftoneId})`} opacity={0.38} />
        <Circle cx={cx + r * 0.75} cy={cy + r * 0.75} r={r * 1.0} fill={look.shade} opacity={0.75} />
      </G>
      {look.ring && (
        <G transform={`rotate(-15 ${cx} ${cy})`}>
          <Path d={ringArc(cx, cy, rx, ry, true)} stroke={look.ring} strokeWidth={r * 0.22} fill="none" />
        </G>
      )}
    </G>
  );
});

/** Standalone planet icon with its own <Svg>. */
export function PlanetIcon({ id, size, uid }: { id: string; size: number; uid?: string }) {
  const look = planetLook(id);
  const pad = look.ring ? 2.1 : 1.25;
  const half = look.r * pad;
  const ht = `ht-${uid ?? id}`;
  return (
    <Svg width={size} height={size} viewBox={`${-half} ${-half} ${half * 2} ${half * 2}`}>
      <Defs>
        <HalftoneDefs id={ht} size={look.r / 5} />
      </Defs>
      <PlanetArt id={id} cx={0} cy={0} uid={`i-${uid ?? id}`} halftoneId={ht} />
    </Svg>
  );
}
