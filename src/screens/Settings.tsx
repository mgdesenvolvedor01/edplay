import React, { useEffect, useState } from 'react';
import { FlatList, Linking, Modal, ScrollView, Text, View } from 'react-native';
import { Button, Focusable, Input, Muted, Screen, TopBar, useLayout } from '../components/ui';
import { changePin, checkPin, DEFAULT_PIN, hiddenCount, isDefaultPin, isHiddenCat, isLocked, lockAdult, setHiddenCat, unlockAdult } from '../parental';
import type { ScreenProps } from '../navigation';
import { useSession } from '../session';
import { measureSpeed, qualityForSpeed } from '../speed';
import { useTheme } from '../theme';
import { DNS_LABEL } from '../api/dns';
import {
  clearLiveHistory,
  clearMovieHistory,
  DnsMode,
  getPrefs,
  loadActiveServer,
  loadServers,
  savePrefs,
  saveServers,
  ServerEntry,
} from '../storage';
import * as Application from 'expo-application';
import AsyncStorage from '@react-native-async-storage/async-storage';

type CatKind = 'live' | 'movie' | 'series';
type PickItem = { kind: CatKind; id: string; name: string };

export default function SettingsScreen({ navigation }: ScreenProps<'Settings'>) {
  const [speed, setSpeed] = useState<{ state: 'idle' | 'testing' | 'fail' } | { state: 'done'; mbps: number }>({ state: 'idle' });
  const runSpeed = async () => {
    if (speed.state === 'testing') return;
    setSpeed({ state: 'testing' });
    const r = await measureSpeed({ bytes: 6_000_000, timeoutMs: 15000 });
    setSpeed(r == null ? { state: 'fail' } : { state: 'done', mbps: r });
  };
  const t = useTheme();
  const { panel, user, logout, refresh, xtream, switchServer } = useSession();
  const { wide } = useLayout();
  const d = panel?.device;
  const [locked, setLocked] = useState(isLocked());
  // janela da senha: 'unlock' = liberar adultos, 'old'/'new' = trocar senha
  const [pinStep, setPinStep] = useState<null | 'unlock' | 'old' | 'new'>(null);
  const [pin, setPin] = useState('');
  const [oldPin, setOldPin] = useState('');
  const [pinMsg, setPinMsg] = useState('');
  const [msg, setMsg] = useState('');

  const [prefs, setPrefs] = useState(getPrefs());
  const [dnsOpen, setDnsOpen] = useState(false);
  const [servers, setServers] = useState<ServerEntry[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ name: '', server: '', username: '', password: '' });
  const [formMsg, setFormMsg] = useState('');
  const [pick, setPick] = useState<null | 'live' | 'vod'>(null);
  const [pickList, setPickList] = useState<PickItem[] | null>(null);
  const [, bump] = useState(0);

  useEffect(() => {
    loadServers().then(setServers);
    loadActiveServer().then(setActiveId);
  }, []);

  useEffect(() => {
    if (!msg) return;
    const id = setTimeout(() => setMsg(''), 2500);
    return () => clearTimeout(id);
  }, [msg]);

  const openPin = (step: 'unlock' | 'old') => {
    setPin('');
    setPinMsg('');
    setPinStep(step);
  };

  const confirmPin = async () => {
    if (pinStep === 'unlock') {
      if (!(await unlockAdult(pin))) return setPinMsg('Senha incorreta.');
      setLocked(false);
      setPinStep(null);
      return navigation.popToTop();
    }
    if (pinStep === 'old') {
      if (!checkPin(pin)) return setPinMsg('Senha incorreta.');
      setOldPin(pin);
      setPin('');
      setPinMsg('');
      return setPinStep('new');
    }
    if (pinStep === 'new') {
      if (!/^\d{4}$/.test(pin)) return setPinMsg('A nova senha precisa ter 4 números.');
      await changePin(oldPin, pin);
      setPinStep(null);
      setMsg('PIN +18 alterado.');
    }
  };

  // ---------- DNS ----------
  const chooseDns = async (mode: DnsMode) => {
    setPrefs(await savePrefs({ dns: mode }));
    setDnsOpen(false);
    setMsg(mode === 'system' ? 'DNS do aparelho em uso.' : `${DNS_LABEL[mode]} ativado. Reconectando…`);
    refresh(); // reconecta usando o DNS escolhido
  };

  // ---------- Servidores ----------
  const addServer = async () => {
    const server = form.server.trim();
    if (!/^https?:\/\//i.test(server)) return setFormMsg('O endereço precisa começar com http:// ou https://');
    const isM3u = !form.username.trim() && !form.password.trim();
    if (!isM3u && !(form.username.trim() && form.password.trim())) return setFormMsg('Preencha usuário e senha (ou deixe os dois vazios se for um link de lista M3U).');
    const entry: ServerEntry = {
      id: String(Date.now()),
      name: form.name.trim() || server.replace(/^https?:\/\//i, '').split('/')[0],
      server: isM3u ? server : server.replace(/\/+$/, ''),
      username: form.username.trim(),
      password: form.password.trim(),
    };
    const list = [...servers, entry];
    await saveServers(list);
    setServers(list);
    setAddOpen(false);
    setForm({ name: '', server: '', username: '', password: '' });
    setFormMsg('');
    setMsg('Servidor adicionado.');
  };
  const removeServer = async (id: string) => {
    const list = servers.filter((s) => s.id !== id);
    await saveServers(list);
    setServers(list);
    if (activeId === id) {
      setActiveId(null);
      await switchServer(null);
    }
  };
  const useExtra = async (id: string | null) => {
    setActiveId(id);
    setMsg(id ? 'Trocando de servidor…' : 'Voltando ao servidor do painel…');
    await switchServer(id);
  };

  // ---------- Ocultar categorias ----------
  const openPick = async (which: 'live' | 'vod') => {
    setPick(which);
    setPickList(null);
    try {
      if (!xtream) return setPickList([]);
      if (which === 'live') {
        const c = await xtream.liveCategoriesRaw();
        setPickList(c.map((k) => ({ kind: 'live' as const, id: String(k.category_id), name: k.category_name })));
      } else {
        const [m, s] = await Promise.all([xtream.vodCategoriesRaw(), xtream.seriesCategoriesRaw().catch(() => [])]);
        setPickList([
          ...m.map((k) => ({ kind: 'movie' as const, id: String(k.category_id), name: '🎬 ' + k.category_name })),
          ...s.map((k) => ({ kind: 'series' as const, id: String(k.category_id), name: '📺 ' + k.category_name })),
        ]);
      }
    } catch {
      setPickList([]);
    }
  };
  const toggleCat = async (it: PickItem) => {
    await setHiddenCat(it.kind, it.id, !isHiddenCat(it.kind, it.id));
    bump((n) => n + 1);
  };

  const Row = ({ k, v }: { k: string; v?: string | null }) => (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderColor: t.line, gap: 16 }}>
      <Muted>{k}</Muted>
      <Text selectable style={{ color: t.text, fontWeight: '600', flexShrink: 1, textAlign: 'right' }}>
        {v || '—'}
      </Text>
    </View>
  );

  const Card = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <View style={{ flex: 1, backgroundColor: t.surface, borderRadius: 16, padding: 18, borderWidth: 1, borderColor: t.line }}>
      <Text style={{ color: t.text, fontSize: 17, fontWeight: '700', marginBottom: 6 }}>{title}</Text>
      {children}
    </View>
  );

  const btnRow = { flexDirection: wide ? ('row' as const) : ('column' as const), gap: 10, flexWrap: 'wrap' as const };
  const hl = hiddenCount('live');
  const hv = hiddenCount('movie') + hiddenCount('series');

  return (
    <Screen padded={false} style={{ padding: wide ? 24 : 12 }}>
      <TopBar title="Configurações" onBack={() => navigation.goBack()} right={msg ? <Text style={{ color: t.ok, fontWeight: '700' }}>{msg}</Text> : undefined} />
      <ScrollView contentContainerStyle={{ gap: 16, paddingBottom: 30 }}>
        <View style={{ flexDirection: wide ? 'row' : 'column', gap: 16 }}>
          <Card title="Aparelho">
            <Row k="MAC" v={d?.mac} />
            <Row k="Chave" v={d?.key} />
            <Row k="Situação" v={d?.state_label} />
          </Card>
          <Card title="Conta">
            <Row k="Usuário" v={user?.username} />
            <Row k="Conexões" v={user ? `${user.active_cons || 0} de ${user.max_connections || '?'}` : null} />
            <Row k="Versão do app" v={Application.nativeApplicationVersion} />
          </Card>
        </View>

        <View style={{ flexDirection: 'row' }}>
          <Card title="PIN +18 (conteúdo adulto)">
            <Muted style={{ marginBottom: 10 }}>
              {locked ? 'Conteúdo adulto BLOQUEADO: peça o PIN para abrir.' : 'Conteúdo adulto LIBERADO.'}
              {isDefaultPin() ? `  PIN padrão: ${DEFAULT_PIN}.` : ''}
            </Muted>
            <View style={btnRow}>
              <Button title="Alterar PIN +18" variant="ghost" onPress={() => openPin('old')} style={{ flex: 1 }} />
              {locked ? (
                <Button title="Liberar conteúdo adulto" variant="ghost" onPress={() => openPin('unlock')} style={{ flex: 1 }} />
              ) : (
                <Button
                  title="Bloquear conteúdo adulto"
                  variant="ghost"
                  onPress={async () => {
                    await lockAdult();
                    setLocked(true);
                    navigation.popToTop();
                  }}
                  style={{ flex: 1 }}
                />
              )}
            </View>
          </Card>
        </View>

        <View style={{ flexDirection: 'row' }}>
          <Card title="DNS">
            <Muted style={{ marginBottom: 10 }}>
              Se o seu provedor bloqueia ou atrasa o servidor, troque o DNS. Vale para servidores http:// (recurso experimental). Se não funcionar, volte para o DNS do aparelho.
            </Muted>
            <Button title={`DNS: ${DNS_LABEL[prefs.dns]}`} variant="ghost" onPress={() => setDnsOpen(true)} />
          </Card>
        </View>

        <View style={{ flexDirection: 'row' }}>
          <Card title="Servidores">
            <Muted style={{ marginBottom: 10 }}>
              Adicione outros servidores (usuário e senha, ou um link de lista M3U) e escolha qual usar.
            </Muted>
            <View style={{ gap: 8, marginBottom: 10 }}>
              <Focusable
                onPress={() => useExtra(null)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, backgroundColor: !activeId ? t.primary + '33' : t.surface2, borderColor: !activeId ? t.primary : t.line }}
              >
                <Text style={{ color: t.text, fontWeight: '700', flex: 1 }}>{!activeId ? '● ' : '○ '}Servidor do painel (padrão)</Text>
              </Focusable>
              {servers.map((s) => (
                <View key={s.id} style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                  <Focusable
                    onPress={() => useExtra(s.id)}
                    style={{ flex: 1, padding: 12, borderRadius: 12, backgroundColor: activeId === s.id ? t.primary + '33' : t.surface2, borderColor: activeId === s.id ? t.primary : t.line }}
                  >
                    <Text numberOfLines={1} style={{ color: t.text, fontWeight: '700' }}>
                      {activeId === s.id ? '● ' : '○ '}
                      {s.name}
                    </Text>
                    <Muted numberOfLines={1} style={{ fontSize: 12 }}>
                      {s.server}
                    </Muted>
                  </Focusable>
                  <Button title="Remover" variant="danger" onPress={() => removeServer(s.id)} />
                </View>
              ))}
            </View>
            <Button title="+ Adicionar servidor" onPress={() => { setFormMsg(''); setAddOpen(true); }} />
          </Card>
        </View>

        <View style={{ flexDirection: 'row' }}>
          <Card title="Categorias">
            <Muted style={{ marginBottom: 10 }}>Escolha o que você não quer ver nas listas.</Muted>
            <View style={btnRow}>
              <Button title={`Ocultar categorias de canais ao vivo${hl ? ` (${hl})` : ''}`} variant="ghost" onPress={() => openPick('live')} style={{ flex: 1 }} />
              <Button title={`Ocultar categorias de filmes e séries${hv ? ` (${hv})` : ''}`} variant="ghost" onPress={() => openPick('vod')} style={{ flex: 1 }} />
            </View>
          </Card>
        </View>

        <View style={{ flexDirection: 'row' }}>
          <Card title="Reprodução">
            <Button
              title={speed.state === 'testing' ? 'Medindo sua internet…' : 'Testar velocidade da internet'}
              onPress={runSpeed}
              style={{ marginBottom: 10 }}
            />
            {speed.state === 'done' ? (
              <View style={{ marginBottom: 12 }}>
                <Text style={{ color: t.text, fontSize: 26, fontWeight: '800' }}>{speed.mbps.toFixed(1)} Mbps</Text>
                <Muted>{qualityForSpeed(speed.mbps).text}</Muted>
              </View>
            ) : speed.state === 'fail' ? (
              <Muted style={{ marginBottom: 12 }}>Não foi possível medir agora. Verifique a conexão e tente de novo.</Muted>
            ) : null}
            <Button
              title={`Qualidade automática (FHD / HD / SD): ${prefs.autoQuality ? 'ligada' : 'desligada'}`}
              variant="ghost"
              onPress={async () => setPrefs(await savePrefs({ autoQuality: !prefs.autoQuality }))}
            />
          </Card>
        </View>

        <View style={btnRow}>
          <Button
            title="Atualizar listas"
            variant="ghost"
            hasTVPreferredFocus
            onPress={() => {
              xtream?.clearCache();
              navigation.popToTop();
            }}
            style={{ flex: 1 }}
          />
          <Button title="Verificar ativação" variant="ghost" onPress={refresh} style={{ flex: 1 }} />
          {panel?.app.support_url ? (
            <Button
              title="Suporte no WhatsApp"
              variant="ghost"
              onPress={() => Linking.openURL(`${panel.app.support_url}?text=${encodeURIComponent(`Olá! Preciso de ajuda.\nMAC: ${d?.mac}\nChave: ${d?.key}`)}`)}
              style={{ flex: 1 }}
            />
          ) : null}
        </View>
        <View style={btnRow}>
          <Button
            title="Limpar histórico de filmes"
            variant="ghost"
            onPress={async () => {
              await clearMovieHistory();
              setMsg('Histórico de filmes limpo.');
            }}
            style={{ flex: 1 }}
          />
          <Button
            title="Limpar histórico ao vivo"
            variant="ghost"
            onPress={async () => {
              await clearLiveHistory();
              setMsg('Histórico ao vivo limpo.');
            }}
            style={{ flex: 1 }}
          />
          <Button
            title="Limpar favoritos"
            variant="ghost"
            onPress={async () => {
              await AsyncStorage.removeItem('mg.favs');
              setMsg('Favoritos limpos.');
            }}
            style={{ flex: 1 }}
          />
        </View>
        <Button title="Sair / trocar usuário" variant="danger" onPress={logout} />
        <Muted style={{ textAlign: 'center', fontSize: 12 }}>
          O EDPLAY é apenas um reprodutor. Não oferece nem vende nenhum conteúdo: as listas vêm do servidor contratado por você.
        </Muted>
      </ScrollView>

      {/* PIN */}
      <Modal visible={pinStep !== null} transparent animationType="fade" onRequestClose={() => setPinStep(null)}>
        <View style={{ flex: 1, backgroundColor: '#000000cc', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <View style={{ width: '100%', maxWidth: 420, backgroundColor: t.surface, borderRadius: 16, padding: 20, gap: 14, borderWidth: 1, borderColor: t.line }}>
            <Text style={{ color: t.text, fontSize: 18, fontWeight: '700' }}>
              {pinStep === 'unlock' ? 'Liberar conteúdo adulto' : pinStep === 'old' ? 'Digite o PIN atual' : 'Digite o novo PIN (4 números)'}
            </Text>
            <Input
              value={pin}
              onChangeText={(v) => setPin(v.replace(/\D/g, '').slice(0, 4))}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={4}
              placeholder="••••"
              autoFocus
              onSubmitEditing={confirmPin}
            />
            {pinMsg ? <Text style={{ color: t.bad }}>{pinMsg}</Text> : null}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button title="Cancelar" variant="ghost" onPress={() => setPinStep(null)} style={{ flex: 1 }} />
              <Button title="Confirmar" onPress={confirmPin} style={{ flex: 1 }} />
            </View>
          </View>
        </View>
      </Modal>

      {/* DNS */}
      <Modal visible={dnsOpen} transparent animationType="fade" onRequestClose={() => setDnsOpen(false)}>
        <View style={{ flex: 1, backgroundColor: '#000000cc', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <View style={{ width: '100%', maxWidth: 460, backgroundColor: t.surface, borderRadius: 16, padding: 20, gap: 10, borderWidth: 1, borderColor: t.line }}>
            <Text style={{ color: t.text, fontSize: 18, fontWeight: '700' }}>DNS</Text>
            <Muted>O DNS descobre o endereço do servidor. Trocar pode reduzir a demora para conectar, mas não muda a velocidade da sua internet.</Muted>
            {(['system', 'google', 'cloudflare', 'opendns'] as DnsMode[]).map((m) => (
              <Button key={m} title={(prefs.dns === m ? '● ' : '') + DNS_LABEL[m]} variant={prefs.dns === m ? 'primary' : 'ghost'} hasTVPreferredFocus={prefs.dns === m} onPress={() => chooseDns(m)} />
            ))}
            <Button title="Fechar" variant="ghost" onPress={() => setDnsOpen(false)} />
          </View>
        </View>
      </Modal>

      {/* Adicionar servidor */}
      <Modal visible={addOpen} transparent animationType="fade" onRequestClose={() => setAddOpen(false)}>
        <View style={{ flex: 1, backgroundColor: '#000000cc', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <ScrollView style={{ width: '100%', maxWidth: 480, flexGrow: 0, backgroundColor: t.surface, borderRadius: 16, borderWidth: 1, borderColor: t.line }} contentContainerStyle={{ padding: 20, gap: 12 }}>
            <Text style={{ color: t.text, fontSize: 18, fontWeight: '700' }}>Adicionar servidor</Text>
            <Input label="Nome (opcional)" value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} placeholder="Ex.: Servidor 2" autoCapitalize="sentences" />
            <Input label="Endereço do servidor ou link da lista M3U" value={form.server} onChangeText={(v) => setForm({ ...form, server: v })} placeholder="http://exemplo.com:8080" keyboardType="url" />
            <Input label="Usuário" value={form.username} onChangeText={(v) => setForm({ ...form, username: v })} />
            <Input label="Senha" value={form.password} onChangeText={(v) => setForm({ ...form, password: v })} secureTextEntry />
            {formMsg ? <Text style={{ color: t.bad }}>{formMsg}</Text> : null}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button title="Cancelar" variant="ghost" onPress={() => setAddOpen(false)} style={{ flex: 1 }} />
              <Button title="Salvar" onPress={addServer} style={{ flex: 1 }} />
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Ocultar categorias */}
      <Modal visible={pick !== null} transparent animationType="fade" onRequestClose={() => setPick(null)}>
        <View style={{ flex: 1, backgroundColor: '#000000cc', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <View style={{ width: '100%', maxWidth: 520, maxHeight: '92%', backgroundColor: t.surface, borderRadius: 16, padding: 16, gap: 10, borderWidth: 1, borderColor: t.line }}>
            <Text style={{ color: t.text, fontSize: 18, fontWeight: '700' }}>{pick === 'live' ? 'Ocultar categorias de canais' : 'Ocultar categorias de filmes e séries'}</Text>
            <Muted>Marque as categorias que NÃO quer ver.</Muted>
            {!pickList ? (
              <Muted>Carregando…</Muted>
            ) : (
              <FlatList
                data={pickList}
                keyExtractor={(i) => i.kind + i.id}
                extraData={hl + hv}
                style={{ flexGrow: 0 }}
                renderItem={({ item }) => {
                  const off = isHiddenCat(item.kind, item.id);
                  return (
                    <Focusable
                      onPress={() => toggleCat(item)}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingHorizontal: 12, borderRadius: 10, marginBottom: 4, backgroundColor: off ? t.bad + '22' : 'transparent' }}
                    >
                      <Text style={{ color: off ? t.bad : t.muted, fontSize: 18, width: 24 }}>{off ? '☑' : '☐'}</Text>
                      <Text numberOfLines={1} style={{ color: off ? t.muted : t.text, fontWeight: '600', flex: 1, textDecorationLine: off ? 'line-through' : 'none' }}>
                        {item.name}
                      </Text>
                    </Focusable>
                  );
                }}
              />
            )}
            <Button title="Pronto" onPress={() => { setPick(null); navigation.popToTop(); }} hasTVPreferredFocus />
          </View>
        </View>
      </Modal>
    </Screen>
  );
}
