import * as Application from 'expo-application';
import * as Crypto from 'expo-crypto';
import * as Device from 'expo-device';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type DeviceIdentity = { mac: string; key: string; model: string; version: string; isTV: boolean };

let cached: DeviceIdentity | null = null;

/**
 * Gera um "MAC" e uma chave estáveis para o aparelho.
 * O Android não deixa apps lerem o MAC real, então usamos o Android ID
 * (que continua igual se o app for reinstalado).
 */
export async function getIdentity(): Promise<DeviceIdentity> {
  if (cached) return cached;

  let seed: string | null = null;
  try {
    seed = Application.getAndroidId();
  } catch {
    seed = null;
  }
  if (!seed) {
    // reserva: um id aleatório guardado no aparelho
    seed = await AsyncStorage.getItem('mg.seed');
    if (!seed) {
      const fresh: string = Crypto.randomUUID();
      await AsyncStorage.setItem('mg.seed', fresh);
      seed = fresh;
    }
  }

  const hash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, 'mgplay:' + seed);
  const hex = hash.slice(0, 12).toUpperCase();
  const mac = hex.match(/.{2}/g)!.join(':');
  // chave numérica de 6 dígitos derivada do mesmo id
  const key = String(parseInt(hash.slice(12, 20), 16) % 900000 + 100000);

  cached = {
    mac,
    key,
    model: [Device.manufacturer, Device.modelName].filter(Boolean).join(' ') || 'Android',
    version: Application.nativeApplicationVersion || '1.0.0',
    isTV: Device.deviceType === Device.DeviceType.TV,
  };
  return cached;
}
