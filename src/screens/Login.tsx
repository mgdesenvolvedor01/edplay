import React, { useRef, useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { Brand } from '../components/Brand';
import { Button, Input, Muted, Screen, useLayout } from '../components/ui';
import { useSession } from '../session';
import { useTheme } from '../theme';

export default function LoginScreen({ initialError }: { initialError?: string }) {
  const t = useTheme();
  const { panel, login } = useSession();
  const { wide } = useLayout();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(initialError || '');
  const [busy, setBusy] = useState(false);
  const passRef = useRef<TextInput>(null);

  const submit = async () => {
    setError('');
    if (!username.trim() || !password.trim()) return setError('Digite o usuário e a senha.');
    setBusy(true);
    try {
      await login(username, password);
    } catch (e: any) {
      setError(e?.message || 'Não foi possível entrar.');
    } finally {
      setBusy(false);
    }
  };

  const d = panel?.device;

  return (
    <Screen padded={false}>
      {panel?.app.login_bg_url ? (
        <Image source={{ uri: panel.app.login_bg_url }} style={[StyleSheet.absoluteFillObject, { opacity: 0.25 }]} contentFit="cover" />
      ) : null}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="height">
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }} keyboardShouldPersistTaps="handled">
          <View style={{ width: '100%', maxWidth: wide ? 460 : 420, gap: 16, backgroundColor: t.surface + 'EE', borderRadius: 20, padding: 24, borderWidth: 1, borderColor: t.line }}>
            <Brand />
            <View>
              <Text style={{ color: t.text, fontSize: 20, fontWeight: '700' }}>Entrar</Text>
              <Muted style={{ marginTop: 4 }}>Use o usuário e a senha que você recebeu do seu revendedor.</Muted>
            </View>
            <Input
              label="Usuário"
              value={username}
              onChangeText={setUsername}
              returnKeyType="next"
              onSubmitEditing={() => passRef.current?.focus()}
              autoFocus={!wide}
              textContentType="username"
            />
            <Input
              ref={passRef}
              label="Senha"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              returnKeyType="go"
              onSubmitEditing={submit}
              textContentType="password"
            />
            {error ? <Text style={{ color: t.bad }}>{error}</Text> : null}
            <Button title="Entrar" onPress={submit} loading={busy} hasTVPreferredFocus={wide} />
            {d ? <Muted style={{ textAlign: 'center', fontSize: 12 }}>MAC {d.mac}</Muted> : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
