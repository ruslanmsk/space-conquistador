import type { PlayerId } from "@space-conquistador/game-core";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import { formatNumber } from "../game/labels";
import { colors } from "../theme/colors";
import { fonts } from "../theme/type";

type Pin = { key: PlayerId; value: number | null; color: string; label: string };

const ROW = 40; // vertical step between pin label rows, so close guesses never overlap
const AXIS_Y = 2 * ROW + 26;

/**
 * Numeric reveal: both guesses drop onto a scale as pins, then the true value lands.
 * The closer guess is the winner: its pin gets a "БЛИЖЕ" tag, the other one fades.
 */
export function NumberLine({
  answer,
  pins,
  unit,
  winner,
}: {
  answer: number;
  pins: Pin[];
  unit?: string;
  winner: PlayerId | null;
}) {
  const [width, setWidth] = useState(0);
  const values = [answer, ...pins.map((p) => p.value).filter((v): v is number => v !== null)];
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  const span = Math.max(hi - lo, Math.abs(answer) * 0.1, 1);
  lo -= span * 0.12;
  hi += span * 0.12;
  const x = (v: number) => ((v - lo) / (hi - lo)) * width;
  const landDelay = 150 + pins.length * 250 + 250;

  return (
    <View>
      <View style={styles.wrap} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        <View style={styles.axis} />
        {width > 0 &&
          pins.map((p, i) =>
            p.value === null ? null : (
              <DropPin
                key={p.key}
                row={i}
                left={x(p.value)}
                delay={150 + i * 250}
                resolveDelay={landDelay + 250}
                color={p.color}
                label={p.label}
                value={p.value}
                distance={Math.abs(p.value - answer)}
                isWinner={winner === p.key}
                hasWinner={winner !== null}
              />
            ),
          )}
        {width > 0 && <AnswerMark left={x(answer)} delay={landDelay} value={answer} unit={unit} />}
      </View>
      {pins.every((p) => p.value === null) && <Text style={styles.none}>Никто не ответил</Text>}
    </View>
  );
}

function DropPin({
  row,
  left,
  delay,
  resolveDelay,
  color,
  label,
  value,
  distance,
  isWinner,
  hasWinner,
}: {
  row: number;
  left: number;
  delay: number;
  resolveDelay: number;
  color: string;
  label: string;
  value: number;
  distance: number;
  isWinner: boolean;
  hasWinner: boolean;
}) {
  const t = useSharedValue(0);
  const r = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(delay, withTiming(1, { duration: 260, easing: Easing.out(Easing.cubic) }));
    r.value = withDelay(resolveDelay, withTiming(1, { duration: 220 }));
  }, [delay, resolveDelay, t, r]);
  const drop = useAnimatedStyle(() => ({
    opacity: t.value * (hasWinner && !isWinner ? 1 - 0.55 * r.value : 1),
    transform: [{ translateY: (1 - t.value) * -18 }],
  }));
  const badge = useAnimatedStyle(() => ({ opacity: r.value, transform: [{ scale: 0.6 + 0.4 * r.value }] }));
  const top = row * ROW;
  return (
    <Animated.View style={[styles.pin, { left: left - 50, top }, drop]}>
      <View style={styles.pinHeadRow}>
        <View style={[styles.pinChip, { backgroundColor: color }]}>
          <Text style={styles.pinValue} numberOfLines={1}>
            {formatNumber(value)}
          </Text>
        </View>
        {isWinner && (
          <Animated.View style={[styles.closer, badge]}>
            <Text style={styles.closerText}>БЛИЖЕ</Text>
          </Animated.View>
        )}
      </View>
      <Text style={styles.pinLabel}>
        {label} · ±{formatNumber(distance)}
      </Text>
      <View style={[styles.pinStem, { backgroundColor: color, height: AXIS_Y - top - 34 }]} />
      <View style={[styles.pinHead, { backgroundColor: color }]} />
    </Animated.View>
  );
}

function AnswerMark({ left, delay, value, unit }: { left: number; delay: number; value: number; unit?: string }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(delay, withTiming(1, { duration: 320, easing: Easing.out(Easing.exp) }));
  }, [delay, t]);
  const style = useAnimatedStyle(() => ({ opacity: t.value, transform: [{ scale: 1.6 - 0.6 * t.value }] }));
  return (
    <Animated.View style={[styles.answer, { left: left - 60 }, style]}>
      <View style={styles.answerDiamond} />
      <Text style={styles.answerValue} numberOfLines={1}>
        {formatNumber(value)}
        {unit ? <Text style={styles.answerUnit}> {unit}</Text> : null}
      </Text>
      <Text style={styles.answerLabel}>верный ответ</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { height: AXIS_Y + 58, marginHorizontal: 36, marginTop: 6 },
  axis: { position: "absolute", left: -20, right: -20, top: AXIS_Y, height: 2, backgroundColor: colors.ink },
  pin: { position: "absolute", width: 100, alignItems: "center" },
  pinHeadRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  pinChip: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 3, borderWidth: 1.5, borderColor: colors.ink },
  pinValue: { fontFamily: fonts.displayBold, fontSize: 12, color: colors.paper },
  closer: { backgroundColor: colors.gold, borderRadius: 3, borderWidth: 1.5, borderColor: colors.ink, paddingHorizontal: 4, paddingVertical: 2 },
  closerText: { fontFamily: fonts.display, fontSize: 9, color: colors.ink },
  pinLabel: { fontFamily: fonts.bodyBold, fontSize: 10, color: colors.inkMuted, marginTop: 1 },
  pinStem: { width: 2, marginTop: 1 },
  pinHead: { width: 10, height: 10, borderRadius: 5, marginTop: -4, borderWidth: 2, borderColor: colors.ink },
  answer: { position: "absolute", top: AXIS_Y - 6, width: 120, alignItems: "center" },
  answerDiamond: {
    width: 14,
    height: 14,
    backgroundColor: colors.gold,
    borderWidth: 2,
    borderColor: colors.ink,
    transform: [{ rotate: "45deg" }],
  },
  answerValue: { fontFamily: fonts.display, fontSize: 18, color: colors.ink, marginTop: 6 },
  answerUnit: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.inkMuted },
  answerLabel: { fontFamily: fonts.bodyBold, fontSize: 10, color: colors.inkMuted, textTransform: "uppercase", letterSpacing: 0.8 },
  none: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.inkMuted, textAlign: "center" },
});
