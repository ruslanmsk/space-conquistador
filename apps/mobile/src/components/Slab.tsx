import type { ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { colors } from "../theme/colors";

type Props = {
  children?: ReactNode;
  /** Face colour. */
  color?: string;
  /** Colour of the hard offset shadow plate. */
  shadow?: string;
  border?: string;
  /** Shadow offset in px (poster-style hard shadow, no blur). */
  depth?: number;
  radius?: number;
  /** Pressed state: the face sinks onto its shadow. */
  pressed?: boolean;
  style?: StyleProp<ViewStyle>;
  faceStyle?: StyleProp<ViewStyle>;
};

/**
 * A block with a hard offset shadow, like a print with misregistered layers. The shadow is a real
 * view (not `shadow*` props) so it looks the same on Android, iOS and web.
 */
export function Slab({
  children,
  color = colors.raised,
  shadow = colors.bgDeep,
  border = colors.ink,
  depth = 4,
  radius = 6,
  pressed,
  style,
  faceStyle,
}: Props) {
  const shift = pressed ? depth : 0;
  return (
    <View style={[{ paddingRight: depth, paddingBottom: depth }, style]}>
      <View
        style={[
          StyleSheet.absoluteFill,
          { left: depth, top: depth, backgroundColor: shadow, borderRadius: radius },
        ]}
      />
      <View
        style={[
          {
            backgroundColor: color,
            borderRadius: radius,
            borderWidth: 2,
            borderColor: border,
            transform: [{ translateX: shift }, { translateY: shift }],
          },
          faceStyle,
        ]}
      >
        {children}
      </View>
    </View>
  );
}
