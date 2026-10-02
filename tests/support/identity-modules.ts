import type { DurableIdentityModule } from '@joby/identity';
import type {
  IdentityRepresentationModule,
  IdentityRepresentationReader,
} from '@joby/identity/representation';
import type {
  AdaptationDurableIdentityReader,
  AdaptationRepresentationReader,
} from '@joby/translation/adaptation';

export type TestIdentityModules = DurableIdentityModule & IdentityRepresentationModule;

/** Test-only compatibility facade while behavioural suites migrate assertions module by module. */
export function combineIdentityModules(
  durable: DurableIdentityModule,
  representations: IdentityRepresentationModule,
): TestIdentityModules {
  return new Proxy({} as TestIdentityModules, {
    get(_target, property) {
      const representationValue = Reflect.get(representations as object, property);
      if (representationValue !== undefined) {
        return typeof representationValue === 'function'
          ? representationValue.bind(representations)
          : representationValue;
      }
      const durableValue = Reflect.get(durable as object, property);
      return typeof durableValue === 'function' ? durableValue.bind(durable) : durableValue;
    },
  });
}

export function adaptationIdentityReader(
  durable: DurableIdentityModule,
): AdaptationDurableIdentityReader {
  return {
    personExists: async (personId) => (await durable.getPerson(personId)) !== undefined,
    readStatedContext: async (personId) => (await durable.getExplicitState(personId))?.stated,
    readIdentityRevision: async (personId) => (await durable.getExplicitState(personId))?.revision,
    projectIdentity: (personId) => durable.getPermanentIdentityView(personId),
  };
}

export function adaptationRepresentationReader(
  representations: IdentityRepresentationReader,
): AdaptationRepresentationReader {
  return representations;
}
