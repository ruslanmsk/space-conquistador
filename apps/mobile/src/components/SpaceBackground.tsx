import { memo, useMemo } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Circle, Defs, Rect, RadialGradient, Stop } from "react-native-svg";
import { colors } from "../theme/colors";

function makeStars(count: number, seed: number) {
  let s = seed;
  const rnd = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  return Array.from({ length: count }, () => ({
    x: rnd() * 100,
    y: rnd() * 100,
    r: rnd() < 0.08 ? 0.32 : 0.12 + rnd() * 0.14,
    o: 0.25 + rnd() * 0.65,
  }));
}

/** Static starfield with a couple of nebula glows, drawn behind every screen. */
export const SpaceBackground = memo(function SpaceBackground() {
  const stars = useMemo(() => makeStars(140, 42), []);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">
        <Defs>
          <RadialGradient id="nebA" cx="15%" cy="20%" r="55%">
            <Stop offset="0" stopColor="#3b2a8a" stopOpacity="0.55" />
            <Stop offset="1" stopColor={colors.bg} stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id="nebB" cx="90%" cy="85%" r="60%">
            <Stop offset="0" stopColor="#0f5d7a" stopOpacity="0.45" />
            <Stop offset="1" stopColor={colors.bg} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100" height="100" fill={colors.bg} />
        <Rect x="0" y="0" width="100" height="100" fill="url(#nebA)" />
        <Rect x="0" y="0" width="100" height="100" fill="url(#nebB)" />
        {stars.map((st, i) => (
          <Circle key={i} cx={st.x} cy={st.y} r={st.r} fill="#ffffff" opacity={st.o} />
        ))}
      </Svg>
    </View>
  );
});
