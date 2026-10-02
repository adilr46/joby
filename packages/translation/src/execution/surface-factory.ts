import type { ApplicationSessionModule } from './session-contract';
import type { SurfaceInspectionModule } from './surface-contract';
import { SurfaceInspectionService } from './surface-service';
import type { SurfaceInterpreter } from './surface-port';

export function createSurfaceInspectionModule(dependencies: {
  interpreter: SurfaceInterpreter;
  sessions: ApplicationSessionModule;
}): SurfaceInspectionModule {
  return new SurfaceInspectionService({ interpreter: dependencies.interpreter, sessions: dependencies.sessions });
}
