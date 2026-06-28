// src/lib/realtimeChannel.ts
//
// Supabase Realtime throws if you call .on() on a channel that has already
// been subscribed:
//   "cannot add `postgres_changes` callbacks for realtime:<name> after `subscribe()`"
//
// This happens when multiple components mount at the same time and each calls
// a store's subscribe() — they all get a fresh channel with the same name.
//
// makeSingletonSubscriber() returns a subscribe() function that:
//   • Creates the channel once and reuses it for every subsequent caller.
//   • Ref-counts callers so the channel is only torn down when the last
//     subscriber unmounts.
//
// Usage in a Zustand store:
//
//   subscribe: makeSingletonSubscriber('my-channel-name', (channel) =>
//     channel.on('postgres_changes', { event: '*', schema: 'public', table: 'my_table' },
//       () => { void get().reload(); }),
//   ),

import { supabase } from '@/lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

type ChannelBuilder = (channel: RealtimeChannel) => RealtimeChannel;

export function makeSingletonSubscriber(
  channelName: string,
  build: ChannelBuilder,
): () => () => void {
  let channel: RealtimeChannel | null = null;
  let refCount = 0;

  return () => {
    refCount += 1;

    if (!channel) {
      channel = build(supabase.channel(channelName)).subscribe();
    }

    return () => {
      refCount -= 1;
      if (refCount <= 0 && channel) {
        void supabase.removeChannel(channel);
        channel = null;
        refCount = 0;
      }
    };
  };
}
