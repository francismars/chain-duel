export type CaptureAnimFlags = {
  grow: boolean;
  tint: boolean;
  scale: boolean;
};

const FLAGS: CaptureAnimFlags = {
  grow: true,
  tint: false,
  scale: true,
};

export function captureAnimFlags(): CaptureAnimFlags {
  return FLAGS;
}

export function anyCaptureAnimFlag(flags: CaptureAnimFlags): boolean {
  return flags.grow || flags.tint || flags.scale;
}
