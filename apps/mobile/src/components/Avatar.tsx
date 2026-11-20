import { memo } from "react";
import Svg, { Circle, ClipPath, Defs, G, Path, Rect } from "react-native-svg";
import { colors } from "../theme/colors";

/**
 * Geometric helmet portraits. Each commander gets a distinct visor and crest so they read as
 * characters, not as coloured dots. The player is "you" — an open-visor pilot in vermilion.
 */
type Look = { helmet: string; visor: string; crest: "none" | "antenna" | "fin" | "crown" | "goggles" | "star" };

const LOOKS: Record<string, Look> = {
  you: { helmet: colors.human, visor: colors.ink, crest: "fin" },
  cadet: { helmet: "#9FB7D9", visor: colors.ink, crest: "antenna" },
  navigator: { helmet: colors.bot, visor: colors.ink, crest: "star" },
  archivist: { helmet: "#B9A27A", visor: colors.ink, crest: "goggles" },
  engineer: { helmet: "#6FA9A0", visor: colors.ink, crest: "antenna" },
  admiral: { helmet: "#2F5E99", visor: colors.ink, crest: "crown" },
};

export const Avatar = memo(function Avatar({
  id,
  size = 44,
  ring,
  uid = "",
}: {
  id: string;
  size?: number;
  /** Frame colour (usually the player's colour). */
  ring?: string;
  uid?: string;
}) {
  const look = LOOKS[id] ?? LOOKS.cadet!;
  const clip = `av-${uid}${id}`;
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Defs>
        <ClipPath id={clip}>
          <Rect x="2" y="2" width="44" height="44" rx="6" />
        </ClipPath>
      </Defs>
      <Rect x="2" y="2" width="44" height="44" rx="6" fill={colors.paper} />
      <G clipPath={`url(#${clip})`}>
        {/* shoulders */}
        <Path d="M6 48 C6 38 14 34 24 34 C34 34 42 38 42 48 Z" fill={look.helmet} />
        <Path d="M6 48 C6 38 14 34 24 34" stroke={colors.ink} strokeWidth="2" fill="none" />
        {/* helmet */}
        <Circle cx="24" cy="22" r="13" fill={look.helmet} stroke={colors.ink} strokeWidth="2" />
        {/* visor */}
        {look.crest === "goggles" ? (
          <G>
            <Circle cx="19" cy="23" r="4.2" fill={look.visor} />
            <Circle cx="29" cy="23" r="4.2" fill={look.visor} />
            <Circle cx="18" cy="22" r="1.3" fill={colors.paper} />
            <Circle cx="28" cy="22" r="1.3" fill={colors.paper} />
          </G>
        ) : (
          <G>
            <Rect x="14" y="18" width="20" height="10" rx="5" fill={look.visor} />
            <Rect x="16.5" y="20" width="6" height="2.4" rx="1.2" fill={colors.paper} opacity={0.85} />
          </G>
        )}
        {look.crest === "antenna" && (
          <G stroke={colors.ink} strokeWidth="2">
            <Path d="M31 10 L35 3" />
            <Circle cx="35.5" cy="3" r="2" fill={colors.gold} />
          </G>
        )}
        {look.crest === "fin" && <Path d="M18 10 L24 3 L30 10 Z" fill={colors.paper} stroke={colors.ink} strokeWidth="2" />}
        {look.crest === "crown" && (
          <Path d="M15 11 L18 5 L21 9 L24 4 L27 9 L30 5 L33 11 Z" fill={colors.gold} stroke={colors.ink} strokeWidth="2" />
        )}
        {look.crest === "star" && (
          <Path d="M24 4 L25.6 8 L30 8.3 L26.6 11 L27.8 15 L24 12.8 L20.2 15 L21.4 11 L18 8.3 L22.4 8 Z" fill={colors.gold} stroke={colors.ink} strokeWidth="1.5" />
        )}
      </G>
      <Rect x="2" y="2" width="44" height="44" rx="6" fill="none" stroke={ring ?? colors.ink} strokeWidth={ring ? 3.5 : 2} />
    </Svg>
  );
});
