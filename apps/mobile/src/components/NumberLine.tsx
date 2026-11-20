import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import { colors } from "../theme/colors";
import { fonts } from "../theme/type";
import { formatNumber } from "../game/labels";

type Pin = { key: string; value: number | null; color: string; label: string };

/**
 * Numeric reveal: both guesses drop onto a scale as pins, then the true value lands with a thump.
 * The most tense moment of the game, so it gets a bit of time.
 */
export function NumberLine({ answer, pins, unit }: { answer: number; pins: Pin[]; unit?: string }) {
  const [width, setWidth] = useState(0);
  const values = [answer, ...pins.map((p) => p.value).filter((v): v is number => v !== null)];
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  const span = Math.max(hi - lo, Math.abs(answer) * 0.1, 1);
  lo -= span * 0.12;
  hi += span * 0.12;
  const x = (v: number) => ((v - lo) / (hi - lo)) * width;

  return (
    <View style={styles.wrap} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <View style={styles.axis} />
      {width > 0 &&
        pins.map((p, i) =>
          p.value === null ? null : <DropPin key={p.key} left={x(p.value)} delay={150 + i * 250} color={p.color} label={p.label} value={p.value} />,
        )}
      {width > 0 && <AnswerMark left={x(answer)} delay={150 + pins.length * 250 + 250} value={answer} unit={unit} />}
    </View>
  );
}

function DropPin({ left, delay, color, label, value }: { left: number; delay: number; color: string; label: string; value: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(delay, withTiming(1, { duration: 260, easing: Easing.out(Easing.back(2)) }));
  }, [delay, t]);
  const style = useAnimatedStyle(() => ({ opacity: t.value, transform: [{ translateY: (1 - t.value) * -18 }] }));
  return (
    <Animated.View style={[styles.pin, { left: left - 30 }, style]}>
      <Text style={[styles.pinValue, { color }]} numberOfLines={1}>
        {formatNumber(value)}
      </Text>
      <Text style={styles.pinLabel}>{label}</Text>
      <View style={[styles.pinStem, { backgroundColor: color }]} />
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
    <Animated.View style={[styles.answer, { left: left - 50 }, style]}>
      <View style={styles.answerDiamond} />
      <Text style={styles.answerValue} numberOfLines={1}>
        {formatNumber(value)}
        {unit ? <Text style={styles.answerUnit}> {unit}</Text> : null}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { height: 120, marginHorizontal: 30, marginTop: 6 },
  axis: { position: "absolute", left: -10, right: -10, top: 62, height: 2, backgroundColor: colors.ink },
  pin: { position: "absolute", top: 0, width: 60, alignItems: "center" },
  pinValue: { fontFamily: fonts.displayBold, fontSize: 13 },
  pinLabel: { fontFamily: fonts.bodyBold, fontSize: 10, color: colors.inkMuted, textTransform: "uppercase" },
  pinStem: { width: 2, height: 22, marginTop: 2 },
  pinHead: { width: 10, height: 10, borderRadius: 5, marginTop: -2, borderWidth: 2, borderColor: colors.ink },
  answer: { position: "absolute", top: 56, width: 100, alignItems: "center" },
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
});
