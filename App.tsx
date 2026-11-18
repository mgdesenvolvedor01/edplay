import React, { useMemo } from 'react';
import { Linking, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DarkTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { SessionProvider, useSession } from './src/session';
import { ThemeProvider, themeFrom, useTheme } from './src/theme';
import { Button, Loading, Message, Screen } from './src/components/ui';
import { Brand } from './src/components/Brand';
import type { RootStack } from './src/navigation';

import ActivationScreen from './src/screens/Activation';
import LoginScreen from './src/screens/Login';
import HomeScreen from './src/screens/Home';
import LiveScreen from './src/screens/Live';
import VodScreen from './src/screens/Vod';
import MovieDetailScreen from './src/screens/MovieDetail';
import SeriesDetailScreen from './src/screens/SeriesDetail';
import PlayerScreen from './src/screens/Player';
import SearchScreen from './src/screens/Search';
import FavoritesScreen from './src/screens/Favorites';
import SettingsScreen from './src/screens/Settings';

const Stack = createNativeStackNavigator<RootStack>();

function MainNavigator() {
  const t = useTheme();
  const navTheme = useMemo(
    () => ({ ...DarkTheme, colors: { ...DarkTheme.colors, background: t.bg, card: t.surface, primary: t.primary, text: t.text, border: t.line } }),
    [t],
  );
  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade', contentStyle: { backgroundColor: t.bg } }}>
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="Live" component={LiveScreen} />
        <Stack.Screen name="Vod" component={VodScreen} />
        <Stack.Screen name="MovieDetail" component={MovieDetailScreen} />
        <Stack.Screen name="SeriesDetail" component={SeriesDetailScreen} />
        <Stack.Screen name="Player" component={PlayerScreen} options={{ animation: 'none', orientation: 'landscape' }} />
        <Stack.Screen name="Search" component={SearchScreen} />
        <Stack.Screen name="Favorites" component={FavoritesScreen} />
        <Stack.Screen name="Settings" component={SettingsScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

function Gate() {
  const { phase, panel, refresh } = useSession();
  const t = useTheme();

  switch (phase.name) {
    case 'loading':
      return (
        <Screen>
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 24 }}>
            <Brand size="lg" />
            <View style={{ height: 90 }}>
              <Loading text={phase.message} />
            </View>
          </View>
        </Screen>
      );
    case 'error':
      return (
        <Screen>
          <Message
            title={phase.keyMismatch ? 'Aparelho não reconhecido' : 'Sem conexão'}
            text={phase.message}
          >
            <Button title="Tentar de novo" onPress={refresh} hasTVPreferredFocus />
          </Message>
        </Screen>
      );
    case 'maintenance':
      return (
        <Screen>
          <Message title="Em manutenção" text={panel?.maintenance?.text}>
            <Button title="Tentar de novo" onPress={refresh} hasTVPreferredFocus />
          </Message>
        </Screen>
      );
    case 'update':
      return (
        <Screen>
          <Message title="Atualização disponível" text={panel?.update?.text}>
            {panel?.update?.url ? (
              <Button title="Atualizar agora" onPress={() => Linking.openURL(panel.update!.url!)} hasTVPreferredFocus />
            ) : null}
            <Button title="Verificar de novo" variant="ghost" onPress={refresh} />
          </Message>
        </Screen>
      );
    case 'noserver':
      return (
        <Screen>
          <Message title="Servidor não configurado" text="O seu revendedor ainda não cadastrou o servidor. Fale com o suporte.">
            <Button title="Tentar de novo" onPress={refresh} hasTVPreferredFocus />
          </Message>
        </Screen>
      );
    case 'activation':
      return <ActivationScreen />;
    case 'login':
      return <LoginScreen initialError={phase.error} />;
    case 'main':
      return <MainNavigator />;
  }
  return <Text style={{ color: t.text }}>…</Text>;
}

function Themed() {
  const { panel } = useSession();
  const theme = useMemo(() => themeFrom(panel?.app), [panel?.app]);
  return (
    <ThemeProvider value={theme}>
      <View style={{ flex: 1, backgroundColor: theme.bg }}>
        <StatusBar style="light" />
        <Gate />
      </View>
    </ThemeProvider>
  );
}

/** Se alguma tela der erro, mostra a mensagem em vez de fechar o app */
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <View style={{ flex: 1, backgroundColor: '#0B0D17', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800', marginBottom: 10 }}>Ops, algo deu errado</Text>
        <Text selectable style={{ color: '#bbb', textAlign: 'center', marginBottom: 20 }}>
          {String(this.state.error?.message || this.state.error)}
        </Text>
        <Button title="Tentar de novo" onPress={() => this.setState({ error: null })} hasTVPreferredFocus />
      </View>
    );
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <SessionProvider>
          <Themed />
        </SessionProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
