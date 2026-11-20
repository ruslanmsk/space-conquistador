import { memo, useMemo } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Circle, Rect } from "react-native-svg";
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
    r: rnd() < 0.1 ? 0.28 : 0.1 + rnd() * 0.1,
    o: 0.2 + rnd() * 0.5,
    warm: rnd() < 0.25,
  }));
}

/** Flat ink sky with sparse stars — no nebula glows: the planets carry the colour. */
export const SpaceBackground = memo(function SpaceBackground() {
  const stars = useMemo(() => makeStars(90, 7), []);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">
        <Rect x="0" y="0" width="100" height="100" fill={colors.bg} />
        {stars.map((st, i) => (
          <Circle key={i} cx={st.x} cy={st.y} r={st.r} fill={st.warm ? colors.star : colors.text} opacity={st.o} />
        ))}
      </Svg>
    </View>
  );
});
