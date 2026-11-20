import Svg, { Circle, Defs, Ellipse, G, Path, RadialGradient, Stop } from "react-native-svg";
import { colors } from "../theme/colors";

export function Logo({ size = 180 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <RadialGradient id="logoPlanet" cx="35%" cy="30%" r="80%">
          <Stop offset="0" stopColor="#ffe08a" />
          <Stop offset="0.55" stopColor="#e2843a" />
          <Stop offset="1" stopColor="#5a1f3a" />
        </RadialGradient>
        <RadialGradient id="logoGlow" cx="50%" cy="50%" r="50%">
          <Stop offset="0.5" stopColor={colors.accent} stopOpacity="0.35" />
          <Stop offset="1" stopColor={colors.accent} stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Circle cx="50" cy="50" r="48" fill="url(#logoGlow)" />
      <Ellipse cx="50" cy="50" rx="46" ry="16" stroke={colors.human} strokeOpacity={0.5} strokeWidth={0.8} fill="none" transform="rotate(-20 50 50)" />
      <G transform="rotate(-20 50 50)">
        <Ellipse cx="50" cy="50" rx="36" ry="8" stroke="#ffd98a" strokeWidth={2.2} fill="none" strokeOpacity={0.55} />
      </G>
      <Circle cx="50" cy="50" r="24" fill="url(#logoPlanet)" />
      <G transform="rotate(-20 50 50)">
        <Path d="M 14 50 A 36 8 0 0 0 86 50" stroke="#ffd98a" strokeWidth={2.2} fill="none" strokeOpacity={0.95} />
      </G>
      <Circle cx="88" cy="38" r="3.2" fill={colors.human} />
      <Circle cx="13" cy="64" r="2.6" fill={colors.bot} />
    </Svg>
  );
}
