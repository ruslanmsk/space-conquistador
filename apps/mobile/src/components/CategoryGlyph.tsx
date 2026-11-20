import { memo } from "react";
import Svg, { Circle, G, Line, Path, Rect } from "react-native-svg";

/**
 * Hand-built line glyphs for question categories (24×24 grid, 2px strokes).
 * Usable standalone (<CategoryGlyph/>) or inside a parent SVG (<CategoryGlyphG/>).
 */
function Shapes({ category, color }: { category: string; color: string }) {
  const s = { stroke: color, strokeWidth: 2, fill: "none", strokeLinecap: "round", strokeLinejoin: "round" } as const;
  switch (category) {
    case "История": // column
      return (
        <G {...s}>
          <Path d="M4 6 L12 3 L20 6 Z" />
          <Line x1="5" y1="20" x2="19" y2="20" />
          <Line x1="7" y1="9" x2="7" y2="17" />
          <Line x1="12" y1="9" x2="12" y2="17" />
          <Line x1="17" y1="9" x2="17" y2="17" />
        </G>
      );
    case "География": // globe with meridians
      return (
        <G {...s}>
          <Circle cx="12" cy="12" r="8.5" />
          <Path d="M12 3.5 C8 7 8 17 12 20.5 C16 17 16 7 12 3.5" />
          <Line x1="3.5" y1="12" x2="20.5" y2="12" />
        </G>
      );
    case "Наука": // flask
      return (
        <G {...s}>
          <Path d="M9 3 L15 3 M10 3 L10 9 L5 19 C4.5 20 5 21 6 21 L18 21 C19 21 19.5 20 19 19 L14 9 L14 3" />
          <Line x1="7" y1="15" x2="17" y2="15" />
        </G>
      );
    case "Природа": // leaf
      return (
        <G {...s}>
          <Path d="M5 19 C5 9 11 4 20 4 C20 13 15 19 5 19 Z" />
          <Path d="M5 19 L14 10" />
        </G>
      );
    case "Космос": // ringed planet
      return (
        <G {...s}>
          <Circle cx="12" cy="12" r="5.5" />
          <Path d="M3 15 C1 18 7 17.5 13 14.5 C19 11.5 23 7 20.5 6.5" />
        </G>
      );
    case "Искусство": // palette
      return (
        <G {...s}>
          <Path d="M12 3.5 C6.5 3.5 3 7.5 3 12 C3 16.5 6.5 20.5 11 20.5 C12.5 20.5 13 19.5 12.5 18.5 C11.8 17 12.5 15.5 14.5 15.5 L17 15.5 C19.5 15.5 21 13.8 21 11.5 C21 7 17 3.5 12 3.5 Z" />
          <Circle cx="8" cy="10" r="1" fill={color} />
          <Circle cx="12" cy="7.5" r="1" fill={color} />
          <Circle cx="16" cy="9.5" r="1" fill={color} />
        </G>
      );
    case "Литература": // open book
      return (
        <G {...s}>
          <Path d="M12 6 C9.5 4.5 6.5 4 3 4.5 L3 18.5 C6.5 18 9.5 18.5 12 20 C14.5 18.5 17.5 18 21 18.5 L21 4.5 C17.5 4 14.5 4.5 12 6 Z" />
          <Line x1="12" y1="6" x2="12" y2="20" />
        </G>
      );
    case "Кино и ТВ": // clapperboard
      return (
        <G {...s}>
          <Rect x="3" y="9" width="18" height="11" rx="1" />
          <Path d="M3 9 L20 4.5 L21 8 Z" />
          <Line x1="8" y1="7.5" x2="9.5" y2="5.8" />
          <Line x1="13" y1="6.2" x2="14.5" y2="4.6" />
        </G>
      );
    case "Музыка": // note
      return (
        <G {...s}>
          <Path d="M9 18 L9 5 L19 3 L19 16" />
          <Circle cx="6.5" cy="18" r="2.5" />
          <Circle cx="16.5" cy="16" r="2.5" />
        </G>
      );
    case "Спорт": // ball
      return (
        <G {...s}>
          <Circle cx="12" cy="12" r="8.5" />
          <Path d="M5 6.5 C9 9 9 15 5 17.5 M19 6.5 C15 9 15 15 19 17.5" />
        </G>
      );
    case "Язык": // speech bubble with letters
      return (
        <G {...s}>
          <Path d="M4 5 L20 5 L20 16 L11 16 L6 20 L6 16 L4 16 Z" />
          <Path d="M8.5 13 L10.5 8 L12.5 13 M9.2 11.5 L11.8 11.5" />
          <Line x1="14.5" y1="11" x2="16.5" y2="11" />
        </G>
      );
    case "Технологии": // chip
      return (
        <G {...s}>
          <Rect x="6" y="6" width="12" height="12" rx="1.5" />
          <Rect x="9.5" y="9.5" width="5" height="5" />
          <Path d="M9 3 L9 6 M15 3 L15 6 M9 18 L9 21 M15 18 L15 21 M3 9 L6 9 M3 15 L6 15 M18 9 L21 9 M18 15 L21 15" />
        </G>
      );
    case "Еда": // bowl with steam
      return (
        <G {...s}>
          <Path d="M3 12 L21 12 C21 16.5 17 20 12 20 C7 20 3 16.5 3 12 Z" />
          <Path d="M9 9 C8 7.5 10 6.5 9 5 M14 9 C13 7.5 15 6.5 14 5" />
        </G>
      );
    default: // Разное: four-point star
      return (
        <G {...s}>
          <Path d="M12 3 L14 10 L21 12 L14 14 L12 21 L10 14 L3 12 L10 10 Z" />
        </G>
      );
  }
}

export const CategoryGlyph = memo(function CategoryGlyph({
  category,
  size = 20,
  color,
}: {
  category: string;
  size?: number;
  color: string;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Shapes category={category} color={color} />
    </Svg>
  );
});

/** Glyph inside a parent SVG, centred at (x, y) with the given size in parent units. */
export function CategoryGlyphG({ category, x, y, size, color }: { category: string; x: number; y: number; size: number; color: string }) {
  const k = size / 24;
  return (
    <G transform={`translate(${x - size / 2}, ${y - size / 2}) scale(${k})`}>
      <Shapes category={category} color={color} />
    </G>
  );
}

/** Short labels where the full category name does not fit. */
export const CATEGORY_SHORT: Record<string, string> = {
  "Кино и ТВ": "Кино",
  Технологии: "Техника",
  Литература: "Литература",
};
