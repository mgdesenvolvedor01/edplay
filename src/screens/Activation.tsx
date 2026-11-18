import React, { useState } from 'react';
import { Linking, ScrollView, Text, View } from 'react-native';
import { panelRedeem } from '../api/panel';
import { Brand } from '../components/Brand';
import { Button, Input, Muted, Screen, useLayout } from '../components/ui';
import { useSession } from '../session';
import { useTheme } from '../theme';

export default function ActivationScreen() {
  const t = useTheme();
  const { panel, refresh, applyPanel } = useSession();
  const { wide } = useLayout();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showCode, setShowCode] = useState(false);

  if (!panel) return null;
  const d = panel.device;
  const blocked = d.state === 'blocked';

  const redeem = async () => {
    setError('');
    if (code.replace(/\D/g, '').length < 10) return setError('Digite os 10 números do código.');
    setBusy(true);
    try {
      await applyPanel(await panelRedeem(code));
    } catch (e: any) {
      setError(e?.message || 'Não foi possível ativar.');
    } finally {
      setBusy(false);
    }
  };

  const whatsapp = () => {
    if (!panel.app.support_url) return;
    const msg = `Olá! Quero ativar o EDPLAY.\nMAC: ${d.mac}\nChave: ${d.key}`;
    Linking.openURL(`${panel.app.support_url}?text=${encodeURIComponent(msg)}`);
  };

  const Box = ({ label, value }: { label: string; value: string }) => (
    <View style={{ flex: 1, backgroundColor: t.surface, borderColor: t.line, borderWidth: 1, borderRadius: 16, padding: 18 }}>
      <Muted>{label}</Muted>
      <Text selectable style={{ color: t.text, fontSize: wide ? 30 : 24, fontWeight: '800', letterSpacing: 1.5, marginTop: 4 }}>
        {value}
      </Text>
    </View>
  );

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 20 }}>
        <View style={{ width: '100%', maxWidth: 760, gap: 18 }}>
          <Brand size="lg" />
          <View>
            <Text style={{ color: blocked ? t.bad : t.warn, fontSize: 15, fontWeight: '700' }}>
              {blocked ? 'Aparelho bloqueado' : d.expires_at ? 'Seu teste terminou' : 'Aparelho não ativado'}
            </Text>
            <Text style={{ color: t.text, fontSize: 16, marginTop: 6, lineHeight: 23 }}>{panel.app.support_text}</Text>
          </View>

          <View style={{ flexDirection: wide ? 'row' : 'column', gap: 12 }}>
            <Box label="MAC" value={d.mac} />
            <Box label="Chave" value={d.key} />
          </View>

          {!blocked && (
            <View style={{ gap: 10 }}>
              {showCode ? (
                <View style={{ backgroundColor: t.surface, borderRadius: 16, padding: 16, gap: 12, borderWidth: 1, borderColor: t.line }}>
                  <Input
                    label="Código de ativação"
                    value={code}
                    onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 10))}
                    keyboardType="number-pad"
                    placeholder="0000000000"
                    maxLength={10}
                    autoFocus
                    onSubmitEditing={redeem}
                  />
                  {error ? <Text style={{ color: t.bad }}>{error}</Text> : null}
                  <Button title="Ativar com código" onPress={redeem} loading={busy} />
                </View>
              ) : (
                <Button title="Tenho um código de ativação" onPress={() => setShowCode(true)} hasTVPreferredFocus />
              )}
            </View>
          )}

          <View style={{ flexDirection: wide ? 'row' : 'column', gap: 10 }}>
            {panel.app.support_url ? <Button title="Falar no WhatsApp" variant="ghost" onPress={whatsapp} style={{ flex: 1 }} /> : null}
            <Button title="Já ativei, verificar" variant="ghost" onPress={refresh} style={{ flex: 1 }} hasTVPreferredFocus={blocked} />
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
