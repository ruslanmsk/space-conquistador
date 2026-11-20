import { NICKNAME_MAX, isValidNickname } from "@space-conquistador/protocol";
import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { colors } from "../theme/colors";
import { fonts } from "../theme/type";
import { Button } from "./Button";

type Props = {
  initial?: string;
  submitTitle: string;
  /** Rejects with an Error whose message is shown under the field. */
  onSubmit: (nickname: string) => Promise<void>;
  autoFocus?: boolean;
};

/** Nickname field (2–16 characters) with a submit button. */
export function NicknameForm({ initial = "", submitTitle, onSubmit, autoFocus }: Props) {
  const [nick, setNick] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = isValidNickname(nick);

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(nick.trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не получилось. Попробуйте ещё раз.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: 10 }}>
      <TextInput
        value={nick}
        onChangeText={(t) => setNick(t.slice(0, NICKNAME_MAX))}
        placeholder="Ваш ник"
        placeholderTextColor={colors.dim}
        maxLength={NICKNAME_MAX}
        autoFocus={autoFocus}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="done"
        onSubmitEditing={() => void submit()}
        style={styles.input}
      />
      <Text style={[styles.help, error && { color: colors.human }]}>
        {error ?? `От 2 до ${NICKNAME_MAX} символов — его увидят соперники`}
      </Text>
      <Button title={busy ? "Секунду…" : submitTitle} disabled={!valid || busy} onPress={() => void submit()} />
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    backgroundColor: colors.sunken,
    borderWidth: 2,
    borderColor: colors.lineHi,
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: fonts.bodyBold,
    fontSize: 18,
    color: colors.text,
  },
  help: { fontFamily: fonts.body, fontSize: 12, color: colors.muted },
});
