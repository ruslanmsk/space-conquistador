import AsyncStorage from "@react-native-async-storage/async-storage";

const ONBOARDING_KEY = "space-conquistador/onboarding-v3";

export async function hasSeenRules(): Promise<boolean> {
  return (await AsyncStorage.getItem(ONBOARDING_KEY)) === "1";
}

export async function markRulesSeen(): Promise<void> {
  await AsyncStorage.setItem(ONBOARDING_KEY, "1");
}
