import { Redirect, Stack } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { hasCloudPublicConfig } from "../../features/cloud/publicConfig";
import { useRelayAuth } from "../../features/cloud/useRelayAuth";

export default function SettingsAuthRouteScreen() {
  return hasCloudPublicConfig() ? (
    <ConfiguredSettingsAuthRouteScreen />
  ) : (
    <Redirect href="/settings" />
  );
}

function ConfiguredSettingsAuthRouteScreen() {
  const { isLoaded, isSignedIn } = useRelayAuth();

  return (
    <>
      <Stack.Screen options={{ title: isSignedIn ? "Account" : "Sign in" }} />
      <View collapsable={false} className="flex-1 overflow-hidden bg-sheet">
        {isLoaded ? isSignedIn ? <RelayProfileView /> : <RelayAuthForm /> : null}
      </View>
    </>
  );
}

function RelayProfileView() {
  const { email, logout } = useRelayAuth();
  return (
    <View className="flex-1 gap-4 p-5">
      <Text className="text-base font-medium text-foreground">Signed in</Text>
      {email ? <Text className="text-sm text-muted-foreground">{email}</Text> : null}
      <Pressable onPress={() => logout()} className="mt-2 rounded-lg bg-destructive px-4 py-3">
        <Text className="text-center text-sm font-medium text-white">Sign out</Text>
      </Pressable>
    </View>
  );
}

const FIELD_CLASSNAME =
  "rounded-lg border border-border bg-background px-3 py-3 text-foreground";

function RelayAuthForm() {
  const { login, register } = useRelayAuth();
  const [mode, setMode] = useState<"sign-in" | "register">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = Boolean(email && password) && !submitting;

  const submit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      if (mode === "sign-in") {
        await login({ email, password });
      } else {
        await register({
          email,
          password,
          ...(inviteCode.trim() ? { inviteCode: inviteCode.trim() } : {}),
        });
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView contentContainerClassName="gap-4 p-5" keyboardShouldPersistTaps="handled">
      <Text className="text-lg font-semibold text-foreground">
        {mode === "sign-in" ? "Sign in to Stofloos" : "Create an account"}
      </Text>
      <View className="gap-1.5">
        <Text className="text-xs font-medium text-foreground">Email</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
          editable={!submitting}
          placeholderTextColor="#888"
          className={FIELD_CLASSNAME}
        />
      </View>
      <View className="gap-1.5">
        <Text className="text-xs font-medium text-foreground">Password</Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          editable={!submitting}
          placeholderTextColor="#888"
          className={FIELD_CLASSNAME}
        />
      </View>
      {mode === "register" ? (
        <View className="gap-1.5">
          <Text className="text-xs font-medium text-foreground">Invite code (if required)</Text>
          <TextInput
            value={inviteCode}
            onChangeText={setInviteCode}
            autoCapitalize="none"
            editable={!submitting}
            placeholderTextColor="#888"
            className={FIELD_CLASSNAME}
          />
        </View>
      ) : null}
      {error ? <Text className="text-xs text-destructive">{error}</Text> : null}
      <Pressable
        disabled={!canSubmit}
        onPress={() => void submit()}
        style={{ opacity: canSubmit ? 1 : 0.5 }}
        className="mt-1 rounded-lg bg-primary px-4 py-3"
      >
        {submitting ? (
          <ActivityIndicator />
        ) : (
          <Text className="text-center text-sm font-medium text-primary-foreground">
            {mode === "sign-in" ? "Sign in" : "Create account"}
          </Text>
        )}
      </Pressable>
      <Pressable
        onPress={() => {
          setMode(mode === "sign-in" ? "register" : "sign-in");
          setError(null);
        }}
        disabled={submitting}
      >
        <Text className="text-center text-xs text-muted-foreground">
          {mode === "sign-in"
            ? "Need an account? Create one"
            : "Already have an account? Sign in"}
        </Text>
      </Pressable>
    </ScrollView>
  );
}
