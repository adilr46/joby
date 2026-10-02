import { PostgresOutboxStore, type Database } from '@joby/database';
import {
  InProcessEventDispatcher,
  TransactionalEventPublisher,
  type EventHandler,
} from '@joby/events';

import type { DurableIdentityReader } from '@joby/identity';
import {
  RepresentationReferenceRepository,
  RepresentationReferenceService,
} from './reference';
import type { CvCompiler } from './compiler';
import type { CvDocument, CvHeader } from './cv-document';
import type { IdentityRepresentationModule } from './contract';
import { IdentityRepresentationFacade } from './facade';
import { RepresentationRepository } from './repository';
import {
  CanonicalFactRemovalReconciler,
  canonicalFactRemovedHandler,
} from './reconciliation';
import { RepresentationService } from './service';

export interface IdentityRepresentationRuntime extends IdentityRepresentationModule {
  renderRepresentationCv(
    representationId: string,
    header?: CvHeader,
  ): Promise<{ document: CvDocument; latex: string } | undefined>;
  compileCv(latex: string): Promise<Uint8Array>;
}

class RuntimeFacade extends IdentityRepresentationFacade implements IdentityRepresentationRuntime {
  constructor(
    service: RepresentationService,
    references: RepresentationReferenceService,
  ) {
    super(service, references);
    this.runtimeService = service;
  }

  private readonly runtimeService: RepresentationService;

  renderRepresentationCv(representationId: string, header?: CvHeader) {
    return this.runtimeService.renderCv(representationId, header);
  }

  compileCv(latex: string): Promise<Uint8Array> {
    return this.runtimeService.compileCv(latex);
  }
}

export function createIdentityRepresentationRuntime(options: {
  readonly db: Database;
  readonly identity: Pick<
    DurableIdentityReader,
    'getPerson' | 'getPermanentIdentityView' | 'listOwnedCanonicalNodeIds'
  >;
  readonly compiler?: CvCompiler;
}): IdentityRepresentationRuntime {
  const service = new RepresentationService({
    db: options.db,
    repository: new RepresentationRepository(options.db),
    publisher: new TransactionalEventPublisher({
      outbox: new PostgresOutboxStore(),
      inline: new InProcessEventDispatcher({ accepts: 'inline' }),
    }),
    identity: {
      findIdentity: async (personId) => {
        const person = await options.identity.getPerson(personId);
        return person
          ? { personId: person.id, durableIdentityId: person.durableIdentityId }
          : undefined;
      },
      projectIdentity: (personId) => options.identity.getPermanentIdentityView(personId),
      listOwnedCanonicalNodeIds: (personId, nodeIds) =>
        options.identity.listOwnedCanonicalNodeIds(personId, nodeIds),
    },
    ...(options.compiler ? { compiler: options.compiler } : {}),
  });
  const references = new RepresentationReferenceService({
    repository: new RepresentationReferenceRepository(options.db),
    identity: {
      personExists: async (personId) => (await options.identity.getPerson(personId)) !== undefined,
    },
  });
  return new RuntimeFacade(service, references);
}

/** Deferrable owner-side reconciliation, registered only by the worker composition root. */
export function createCanonicalFactRemovedHandler(db: Database): EventHandler<'CanonicalFactRemoved'> {
  const publisher = new TransactionalEventPublisher({
    outbox: new PostgresOutboxStore(),
    inline: new InProcessEventDispatcher({ accepts: 'inline' }),
  });
  return canonicalFactRemovedHandler(
    new CanonicalFactRemovalReconciler(db, new RepresentationRepository(db), publisher),
  );
}

export {
  CvCompilationError,
  CvCompilerUnavailableError,
  PdfLatexCompiler,
  type CvCompiler,
  type PdfLatexCompilerOptions,
} from './compiler';
export type { CvDocument, CvEntry, CvHeader, CvSection } from './cv-document';
