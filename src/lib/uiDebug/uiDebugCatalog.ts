export type UiDebugLink = {
  label: string;
  href: string;
  variant?: 'A' | 'B';
};

export type UiDebugGroup = {
  title: string;
  links: UiDebugLink[];
};

export const UI_DEBUG_GROUPS: UiDebugGroup[] = [
  {
    title: 'In-game triggers',
    links: [
      { label: 'Sounds, chains, walls, pops', href: '/preview/match-triggers' },
    ],
  },
  {
    title: 'P2P settings',
    links: [
      { label: 'Current layout', href: '/p2p', variant: 'A' },
      { label: 'New layout', href: '/preview/p2p-settings-b', variant: 'B' },
    ],
  },
  {
    title: 'Free play settings',
    links: [
      { label: 'Current layout', href: '/practice?play=free', variant: 'A' },
      {
        label: 'New layout',
        href: '/preview/freeplay-settings-b',
        variant: 'B',
      },
    ],
  },
  {
    title: 'P2P payment',
    links: [
      { label: 'Current layout', href: '/gamemenu', variant: 'A' },
      { label: 'New layout', href: '/preview/p2p-payment-b', variant: 'B' },
      {
        label: 'Payment play',
        href: '/preview/p2p-payment-b?scene=play',
      },
      {
        label: 'Nostr payment play',
        href: '/preview/p2p-payment-b?nostr=true',
      },
    ],
  },
  {
    title: 'P2P finish',
    links: [
      { label: 'Winner', href: '/game?preview=p2p&side=winner' },
      { label: 'Loser', href: '/game?preview=p2p&side=loser' },
      {
        label: 'Nostr, winner',
        href: '/game?preview=p2p&nostr=1&side=winner',
      },
      {
        label: 'Nostr, loser',
        href: '/game?preview=p2p&nostr=1&side=loser',
      },
      {
        label: 'Double or nothing, winner',
        href: '/game?preview=p2p&don=2&side=winner',
      },
      {
        label: 'Double or nothing, loser',
        href: '/game?preview=p2p&don=2&side=loser',
      },
      {
        label: 'Nostr double or nothing, winner',
        href: '/game?preview=p2p&nostr=1&don=2&side=winner',
      },
      {
        label: 'Nostr double or nothing, loser',
        href: '/game?preview=p2p&nostr=1&don=2&side=loser',
      },
    ],
  },
  {
    title: 'Online lobby',
    links: [
      { label: 'One seat filling', href: '/preview/online-seat' },
      { label: 'One seat paid', href: '/online/r/DEBUG?preview=seat' },
      {
        label: 'Both seated, intro held',
        href: '/online/r/DEBUG?preview=loading',
      },
    ],
  },
  {
    title: 'Online finish',
    links: [
      { label: 'Celebration, spectator', href: '/preview/online-finish' },
      {
        label: 'Celebration, winner',
        href: '/preview/online-finish?side=winner',
      },
      {
        label: 'Celebration, loser',
        href: '/preview/online-finish?side=loser',
      },
      { label: 'Results, spectator', href: '/preview/online-results' },
      { label: 'Results, winner', href: '/preview/online-results?side=winner' },
      { label: 'Results, loser', href: '/preview/online-results?side=loser' },
      { label: 'Double or nothing history', href: '/preview/online-don' },
      { label: 'DoN, winner', href: '/preview/online-don?side=winner' },
      { label: 'DoN, loser', href: '/preview/online-don?side=loser' },
    ],
  },
  {
    title: 'Local match end',
    links: [
      { label: 'Practice', href: '/game?preview=local' },
      { label: 'Practice, winner', href: '/game?preview=local&side=winner' },
      { label: 'Practice, loser', href: '/game?preview=local&side=loser' },
      { label: 'Free game', href: '/game?preview=freeplay' },
      { label: 'Free game, loser', href: '/game?preview=freeplay&side=loser' },
      { label: 'Human vs human', href: '/game?preview=h2h' },
      { label: 'Human vs human, loser', href: '/game?preview=h2h&side=loser' },
    ],
  },
  {
    title: 'Challenge end',
    links: [
      { label: 'Win', href: '/game?preview=solo' },
      { label: 'Loss', href: '/game?preview=solo&side=loser' },
    ],
  },
  {
    title: 'Prize and tournament',
    links: [
      { label: 'Claim, QR shown', href: '/postgame?preview=claim&qr=1' },
      { label: 'Claim, QR blurred', href: '/postgame?preview=claim&qr=0' },
      { label: 'Claim, already claimed', href: '/postgame?preview=claim' },
      { label: 'Bracket finished', href: '/tournbracket?preview=finished' },
    ],
  },
];
