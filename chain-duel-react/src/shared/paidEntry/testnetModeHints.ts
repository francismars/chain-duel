export type ModalPitch = 'lightning' | 'nostr';

export function modalHintsFor(
  kind: 'p2p' | 'tournament'
): Record<ModalPitch, string> {
  if (kind === 'p2p') {
    return {
      lightning:
        'Lightning (LNURL): each player pays with a normal Lightning invoice—scan the QR codes on the game menu with any Lightning wallet.',
      nostr:
        "Nostr: you pay by zapping a published note. Match the room's emoji id on screen, and put your seat PIN in the zap comment so the server can assign your slot.",
    };
  }
  return {
    lightning:
      'Lightning (LNURL): tournament buy-in uses standard Lightning invoices and QR-style links from the tournament screens—same idea as Testnet duels, scaled for brackets.',
    nostr:
      'Nostr: buy-in and room details go through Nostr zaps and a Kind 1 note instead of classic LNURL-only links—useful if your group already coordinates on Nostr.',
  };
}
