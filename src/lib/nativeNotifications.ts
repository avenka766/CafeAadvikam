// src/lib/nativeNotifications.ts
// Owner Android app notification wiring (2026-08-07).
//
// Two layers, deliberately kept separate:
//   1. LOCAL notifications — work today, no external setup. Used to alert
//      the Owner about something newly needing his attention while the app
//      is open or backgrounded (see notifyLocal / OwnerEverythingTab).
//   2. REMOTE push (FCM) — the device-token registration pipeline is wired
//      up here and ready, but actually receiving a push while the app is
//      fully closed requires a Firebase project (owner-provided credentials
//      — see ANDROID_APP_SETUP.md) plus a server-side sender (a Supabase
//      Edge Function triggered on qualifying business events). Until that
//      Firebase project exists, registerPush() below simply won't produce a
//      token and fails silently — nothing else in the app depends on it.
//
// On the web (not running inside the native Capacitor shell) every function
// here is a safe no-op, so this file is safe to import/call unconditionally
// from anywhere in the app, including the shared web build.

import { supabase } from '@/lib/supabase';

let initialized = false;

async function isNative(): Promise<boolean> {
  try {
    const { Capacitor } = await import('@capacitor/core');
    return Capacitor.isNativePlatform();
  } catch {
    return false; // @capacitor/core not installed/bundled (plain web build)
  }
}

/** Fire a local notification immediately. No-op on web or if permission was never granted. */
export async function notifyLocal(title: string, body: string): Promise<void> {
  if (!(await isNative())) return;
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    const perm = await LocalNotifications.checkPermissions();
    if (perm.display !== 'granted') return;
    await LocalNotifications.schedule({
      notifications: [{
        id: Math.floor(Math.random() * 2_147_483_647),
        title,
        body,
        smallIcon: 'ic_stat_notify',
      }],
    });
  } catch (err) {
    console.warn('[nativeNotifications] local notification failed:', err);
  }
}

async function registerPushToken(token: string, registeredBy: string | null) {
  const { error } = await supabase.from('owner_push_devices').upsert(
    { device_token: token, platform: 'android', registered_by: registeredBy, last_seen_at: new Date().toISOString() },
    { onConflict: 'device_token' },
  );
  if (error) console.warn('[nativeNotifications] failed to register push token:', error.message);
}

/**
 * Call once at app startup (see main.tsx). Requests local + push
 * notification permission and wires up the push-token registration
 * pipeline. Safe to call multiple times (guarded by `initialized`) and a
 * complete no-op on the web build.
 */
export async function initNativeNotifications(registeredBy?: string | null): Promise<void> {
  if (initialized) return;
  if (!(await isNative())) return;
  initialized = true;

  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    await LocalNotifications.requestPermissions();
  } catch (err) {
    console.warn('[nativeNotifications] local notification permission request failed:', err);
  }

  // BUG FIX (2026-09-03): PushNotifications.register() calls into Android's
  // real FirebaseMessaging.getInstance() natively — with no Firebase project
  // configured (no google-services.json — see ANDROID_APP_SETUP.md), that
  // throws IllegalStateException on Capacitor's OWN native plugin thread,
  // which crashes the entire app with a FATAL EXCEPTION. The try/catch here
  // is JS-side and can't catch it — a Java exception on a background
  // Android Handler thread isn't a rejected JS promise, it just kills the
  // process outright. Confirmed live: a fresh install of the Owner app
  // crashed immediately after answering the notification permission prompt,
  // every time. Skip push registration entirely until a real Firebase
  // project exists; local notifications above are unaffected (a separate
  // plugin, no Firebase dependency) and already cover in-app alerts.
  void registeredBy; // kept in the signature for when push is re-enabled
}
