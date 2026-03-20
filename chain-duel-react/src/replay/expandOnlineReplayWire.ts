import {
  decodeInnerJsonToFrames,
  type CompactReplayHeader,
  type EncodedFrame,
} from '@replay/codec';
import type { OnlineRoomSnapshot } from '@/types/socket';

async function gunzipBase64ToUtf8(b64: string): Promise<string> {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  const ds = new DecompressionStream('gzip');
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  const buf = await new Response(stream).arrayBuffer();
  return new TextDecoder().decode(buf);
}

/** Gunzip + decode server `compact-v2` replay to full snapshots (same as live play). */
export async function expandOnlineReplayWire(wire: {
  gzipBase64: string;
  frameCount: number;
}): Promise<OnlineRoomSnapshot[]> {
  if (wire.frameCount === 0 || wire.gzipBase64 === '') {
    return [];
  }
  const json = await gunzipBase64ToUtf8(wire.gzipBase64);
  const data = JSON.parse(json) as { h: CompactReplayHeader; f: EncodedFrame[] };
  return decodeInnerJsonToFrames(data);
}
