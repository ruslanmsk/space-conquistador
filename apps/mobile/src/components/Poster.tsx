import { memo } from "react";
import Svg, { Circle, Defs, G, Line, Path, Rect } from "react-native-svg";
import { colors } from "../theme/colors";
import { HalftoneDefs, PlanetArt } from "./PlanetArt";

/**
 * Title-screen illustration: a retro poster composition — a sun disc, a 15° signal band, two planets
 * on orbits, and the players' two colours meeting in the middle.
 */
export const Poster = memo(function Poster({ width, height }: { width: number; height: number }) {
  return (
    <Svg width={width} height={height} viewBox="0 0 100 70" preserveAspectRatio="xMidYMid meet">
      <Defs>
        <HalftoneDefs id="poster-ht" size={1.3} />
        <HalftoneDefs id="poster-ht-gold" size={1.6} color={colors.goldDeep} />
      </Defs>
      {/* sun disc with halftone */}
      <Circle cx={68} cy={30} r={24} fill={colors.gold} />
      <Circle cx={68} cy={30} r={24} fill="url(#poster-ht-gold)" opacity={0.6} />
      {/* signal band */}
      <G transform="rotate(-15 50 35)">
        <Rect x={-20} y={38} width={140} height={7} fill={colors.human} />
        <Rect x={-20} y={45} width={140} height={2.2} fill={colors.ink} />
        <Rect x={-20} y={47.2} width={140} height={5} fill={colors.bot} />
      </G>
      {/* orbits */}
      <G stroke={colors.text} strokeWidth={0.35} fill="none" opacity={0.55}>
        <Path d="M 2 58 Q 40 20 98 10" strokeDasharray="1 1.4" />
        <Path d="M 2 66 Q 50 34 98 26" strokeDasharray="1 1.4" />
      </G>
      <PlanetArt id="saturn" cx={30} cy={30} r={11} uid="poster-" halftoneId="poster-ht" />
      <PlanetArt id="earth" cx={80} cy={56} r={6.5} uid="poster-" halftoneId="poster-ht" />
      <PlanetArt id="moon" cx={91} cy={47} r={2.2} uid="poster-" halftoneId="poster-ht" />
      {/* tiny rocket on the orbit */}
      <G transform="translate(52 31) rotate(-28)">
        <Path d="M 0 -3.2 Q 1.4 -1 1.2 2 L -1.2 2 Q -1.4 -1 0 -3.2 Z" fill={colors.paper} stroke={colors.ink} strokeWidth={0.35} />
        <Path d="M -1.2 1 L -2.2 2.8 L -1.1 2.2 Z M 1.2 1 L 2.2 2.8 L 1.1 2.2 Z" fill={colors.human} />
        <Line x1={0} y1={2.3} x2={0} y2={4.2} stroke={colors.gold} strokeWidth={0.8} strokeLinecap="round" />
      </G>
      {/* sparse stars */}
      {[
        [8, 8],
        [18, 50],
        [44, 6],
        [92, 4],
        [58, 64],
        [6, 30],
      ].map(([x, y], i) => (
        <Circle key={i} cx={x} cy={y} r={0.45} fill={colors.text} opacity={0.7} />
      ))}
    </Svg>
  );
});
