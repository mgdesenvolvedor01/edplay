import React, { useEffect, useState } from 'react';
import { Modal, Text, View } from 'react-native';
import { Button, Input } from './ui';
import { unlockTemp } from '../parental';
import { useTheme } from '../theme';

/** Janela que pede a senha (PIN) para abrir conteúdo adulto. Libera só até fechar o app. */
export function PinModal({ visible, onClose, onOk }: { visible: boolean; onClose: () => void; onOk: () => void }) {
  const t = useTheme();
  const [pin, setPin] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (visible) {
      setPin('');
      setMsg('');
    }
  }, [visible]);

  const confirm = (value = pin) => {
    if (!unlockTemp(value)) {
      setPin('');
      return setMsg('Senha incorreta.');
    }
    onOk();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: '#000000cc', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <View style={{ width: '100%', maxWidth: 420, backgroundColor: t.surface, borderRadius: 16, padding: 20, gap: 14, borderWidth: 1, borderColor: t.line }}>
          <Text style={{ color: t.text, fontSize: 18, fontWeight: '700' }}>🔒 Conteúdo adulto (+18)</Text>
          <Text style={{ color: t.muted }}>Digite a senha de 4 números para abrir.</Text>
          <Input
            value={pin}
            onChangeText={(v) => {
              const n = v.replace(/\D/g, '').slice(0, 4);
              setPin(n);
              setMsg('');
              if (n.length === 4) confirm(n);
            }}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={4}
            placeholder="••••"
            autoFocus
            onSubmitEditing={() => confirm()}
          />
          {msg ? <Text style={{ color: t.bad }}>{msg}</Text> : null}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button title="Cancelar" variant="ghost" onPress={onClose} style={{ flex: 1 }} />
            <Button title="Confirmar" onPress={() => confirm()} style={{ flex: 1 }} />
          </View>
        </View>
      </View>
    </Modal>
  );
}
