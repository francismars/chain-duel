import { Navigate, useParams } from 'react-router';
import {
  isDebugPlayKind,
  saveDebugPlayConfig,
} from '@/lib/uiDebug/debugPlay';

/** Writes a local match config, then opens the real game. */
export default function DebugPlayLaunch() {
  const { kind } = useParams();
  if (!isDebugPlayKind(kind)) {
    return <Navigate to="/preview" replace />;
  }
  saveDebugPlayConfig(kind);
  return <Navigate to="/game" replace />;
}
