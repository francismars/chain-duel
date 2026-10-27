import {
  getActiveNostrSigner,
  resolveSignerMode,
} from '@/lib/nostr/signerSession';
import { createFlowTrace, withNip46SignFlow } from '@/lib/nostr/nip46Trace';

const SIGN_TIMEOUT_MS = 45_000;
const NIP46_SIGN_TIMEOUT_MS = 90_000;

function withSignTimeout<T>(
  label: string,
  p: Promise<T>,
  timeoutMs: number
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = window.setTimeout(() => {
      const mode = resolveSignerMode();
      const hint =
        mode === 'nip46'
          ? 'Open your Primal / Amber app and approve the signing request.'
          : 'Signing request timed out.';
      reject(new Error(`${label} timed out. ${hint}`));
    }, timeoutMs);
    p.then(
      (v) => {
        window.clearTimeout(t);
        resolve(v);
      },
      (e) => {
        window.clearTimeout(t);
        reject(e);
      }
    );
  });
}

export async function signChallengeBountyNote(unsigned: {
  kind: 1;
  created_at: number;
  tags: string[][];
  content: string;
}) {
  const trace = createFlowTrace('challenge', 'sign-bounty-note');
  trace.step(
    'start',
    `tags=${unsigned.tags.length} content=${unsigned.content.length} chars — relay RPC follows as [relay]`
  );

  const signer = await getActiveNostrSigner();
  if (!signer)
    throw new Error('No Nostr signer found. Connect one on the Config page.');
  const timeout =
    resolveSignerMode() === 'nip46' ? NIP46_SIGN_TIMEOUT_MS : SIGN_TIMEOUT_MS;

  try {
    const signed = await withNip46SignFlow('bounty-note/kind-1', () =>
      withSignTimeout('Victory note sign', signer.signEvent(unsigned), timeout)
    );
    trace.done(`event id=${(signed as { id?: string }).id?.slice(0, 12)}…`);
    return signed;
  } catch (err) {
    trace.fail('sign', err);
    throw err;
  }
}
