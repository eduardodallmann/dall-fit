import { Injectable, Logger } from '@nestjs/common';

import type {
  CreateTrainingPlanRequest,
  GlobalTrainingPlanLibraryResponse,
  GlobalTrainingPlanUsage,
  PersonalTrainingPlanCollectionResponse,
  PersonalTrainingPlanDetails,
  PersonalTrainingPlanListItem,
  TrainingPlanCloneJobItem,
  TrainingPlanWorkoutDetails,
  UpdateTrainingPlanRequest,
} from '@dall-fit/types';

import { RealtimePublisherService } from '~/realtime/realtime-publisher.service';
import {
  TrainingPlanCloneStarter,
  TrainingPlanCloneStartError,
} from '~/training-plan/adapters/training-plan-clone-starter';
import type {
  GlobalTrainingPlanUsageMap,
  PersonalCatalogEntry,
  PersonalTrainingExecutionPlan,
  TrainingPlanCloneJob,
} from '~/training-plan/domain/personal-training-plan.entity';
import type {
  TrainingPlanEntity,
  VersionedResult,
} from '~/training-plan/domain/training-plan.entity';
import {
  createActiveTrainingPlanLimitException,
  createCatalogEntryNotFoundException,
  createCloneJobDuplicateException,
  createCloneJobNotFoundException,
  createCloneJobStateConflictException,
  createCloneSchedulingUnavailableException,
  createGlobalReferenceDuplicateException,
  createGlobalReferenceReadOnlyException,
  createPreconditionRequiredException,
  createTrainingPlanNotFoundException,
} from '~/training-plan/errors/training-plan.errors';
import { PersonalTrainingPlanRepository } from '~/training-plan/repositories/personal-training-plan.repository';
import { ExerciseImageService } from '~/training-plan/services/exercise-image.service';
import { TrainingPlanService } from '~/training-plan/services/training-plan.service';
import { TRAINING_PLAN_PAGE_SIZE } from '~/training-plan/training-plan.constants';

interface ResolvedCatalogEntry {
  entry: PersonalCatalogEntry;
  ownerPersonId: string | null;
  plan: TrainingPlanEntity;
  source: 'global-reference' | 'owned';
}

@Injectable()
export class PersonalTrainingPlanService {
  private readonly logger = new Logger(PersonalTrainingPlanService.name);

  constructor(
    private readonly repository: PersonalTrainingPlanRepository,
    private readonly trainingPlanService: TrainingPlanService,
    private readonly exerciseImageService: ExerciseImageService,
    private readonly cloneStarter: TrainingPlanCloneStarter,
    private readonly realtimePublisher: RealtimePublisherService,
  ) {}

  async list(
    personId: string,
    page: number,
  ): Promise<PersonalTrainingPlanCollectionResponse> {
    this.logger.log('PersonalTrainingPlanService -> list -> params:', {
      params: { page, personId },
    });
    const pageResult = await this.repository.list(
      personId,
      page,
      TRAINING_PLAN_PAGE_SIZE,
    );
    const result = {
      activeCount: pageResult.activeCount,
      data: pageResult.data,
      page,
      pageSize: TRAINING_PLAN_PAGE_SIZE,
      total: pageResult.total,
    };
    this.logger.log('PersonalTrainingPlanService -> list -> return:', {
      data: { count: result.data.length, personId, total: result.total },
    });
    return result;
  }

  async listLibrary(
    personId: string,
    page: number,
  ): Promise<GlobalTrainingPlanLibraryResponse> {
    this.logger.log('PersonalTrainingPlanService -> listLibrary -> params:', {
      params: { page, personId },
    });
    const pageResult = await this.repository.listLibrary(
      personId,
      page,
      TRAINING_PLAN_PAGE_SIZE,
    );
    const result = {
      data: pageResult.data,
      page,
      pageSize: TRAINING_PLAN_PAGE_SIZE,
      total: pageResult.total,
    };
    this.logger.log('PersonalTrainingPlanService -> listLibrary -> return:', {
      data: { count: result.data.length, personId, total: result.total },
    });
    return result;
  }

  async createOwned(
    personId: string,
    input: CreateTrainingPlanRequest,
  ): Promise<PersonalTrainingPlanListItem> {
    this.logger.log('PersonalTrainingPlanService -> createOwned -> params:', {
      params: { fields: Object.keys(input), personId },
    });
    const plan = await this.trainingPlanService.createOwned(personId, input);
    let entry: PersonalCatalogEntry;
    try {
      entry = await this.repository.createOwnedEntry(personId, plan.id);
    } catch (error: unknown) {
      await this.trainingPlanService.deleteOwned(
        personId,
        plan.id,
        plan.version,
      );
      throw error;
    }
    const result = this.toPlanItem(entry, plan, false);
    this.logger.log('PersonalTrainingPlanService -> createOwned -> return:', {
      data: { catalogEntryId: entry.id, personId, trainingPlanId: plan.id },
    });
    return result;
  }

  async createGlobalReference(
    personId: string,
    globalTrainingPlanId: string,
  ): Promise<PersonalTrainingPlanListItem> {
    this.logger.log(
      'PersonalTrainingPlanService -> createGlobalReference -> params:',
      { params: { globalTrainingPlanId, personId } },
    );
    const plan = await this.trainingPlanService.getGlobal(globalTrainingPlanId);
    const entry = await this.repository.createGlobalReference(
      personId,
      globalTrainingPlanId,
    );
    if (entry === null) throw createGlobalReferenceDuplicateException();
    await this.publishGlobalUsageChanged(plan.id, plan.version);
    const result = this.toPlanItem(entry, plan, false);
    this.logger.log(
      'PersonalTrainingPlanService -> createGlobalReference -> return:',
      { data: { catalogEntryId: entry.id, globalTrainingPlanId, personId } },
    );
    return result;
  }

  async setActiveState(
    personId: string,
    catalogEntryId: string,
    active: boolean,
  ): Promise<readonly string[]> {
    this.logger.log(
      'PersonalTrainingPlanService -> setActiveState -> params:',
      {
        params: { active, catalogEntryId, personId },
      },
    );
    const resolved = await this.resolveEntry(personId, catalogEntryId);
    const activeCatalogEntryIds = active
      ? await this.repository.setActive(personId, catalogEntryId)
      : await this.repository.setInactive(personId, catalogEntryId);
    if (activeCatalogEntryIds === null)
      throw createActiveTrainingPlanLimitException();
    if (resolved.source === 'global-reference')
      await this.publishGlobalUsageChanged(
        resolved.plan.id,
        resolved.plan.version,
      );
    this.logger.log(
      'PersonalTrainingPlanService -> setActiveState -> return:',
      {
        data: { activeCount: activeCatalogEntryIds.length, personId },
      },
    );
    return activeCatalogEntryIds;
  }

  async getDetails(
    personId: string,
    catalogEntryId: string,
  ): Promise<PersonalTrainingPlanDetails> {
    this.logger.log('PersonalTrainingPlanService -> getDetails -> params:', {
      params: { catalogEntryId, personId },
    });
    const resolved = await this.resolveEntry(personId, catalogEntryId);
    const active = (
      await this.repository.getActiveCatalogEntryIds(personId)
    ).includes(catalogEntryId);
    const result = {
      active,
      catalogEntryId,
      createdAt: resolved.plan.createdAt,
      description: resolved.plan.description,
      id: resolved.plan.id,
      name: resolved.plan.name,
      source: resolved.source,
      updatedAt: resolved.plan.updatedAt,
      version: resolved.plan.version,
      workouts: resolved.plan.workouts,
    };
    this.logger.log('PersonalTrainingPlanService -> getDetails -> return:', {
      data: { catalogEntryId, personId, source: result.source },
    });
    return result;
  }

  async updateOwned(
    personId: string,
    catalogEntryId: string,
    expectedVersion: number,
    changes: UpdateTrainingPlanRequest,
  ): Promise<VersionedResult<PersonalTrainingPlanListItem>> {
    this.logger.log('PersonalTrainingPlanService -> updateOwned -> params:', {
      params: {
        catalogEntryId,
        expectedVersion,
        fields: Object.keys(changes),
        personId,
      },
    });
    const resolved = await this.resolveOwnedEntry(personId, catalogEntryId);
    const updated = await this.trainingPlanService.updateOwned(
      personId,
      resolved.plan.id,
      expectedVersion,
      changes,
    );
    const active = (
      await this.repository.getActiveCatalogEntryIds(personId)
    ).includes(catalogEntryId);
    const result = {
      data: this.toPlanItem(
        resolved.entry,
        { ...resolved.plan, ...updated.data, version: updated.version },
        active,
      ),
      version: updated.version,
    };
    this.logger.log('PersonalTrainingPlanService -> updateOwned -> return:', {
      data: { catalogEntryId, personId, version: result.version },
    });
    return result;
  }

  async deleteCatalogItem(
    personId: string,
    catalogEntryId: string,
    expectedVersion?: number,
  ): Promise<void> {
    this.logger.log(
      'PersonalTrainingPlanService -> deleteCatalogItem -> params:',
      {
        params: {
          catalogEntryId,
          expectedVersionPresent: expectedVersion !== undefined,
          personId,
        },
      },
    );
    const resolved = await this.resolveEntry(personId, catalogEntryId);
    if (resolved.source === 'owned') {
      if (expectedVersion === undefined)
        throw createPreconditionRequiredException();
      await this.trainingPlanService.deleteOwned(
        personId,
        resolved.plan.id,
        expectedVersion,
      );
    }
    await this.repository.clearActiveIfEntry(personId, catalogEntryId);
    const removed = await this.repository.deleteEntry(personId, catalogEntryId);
    if (removed === null) throw createCatalogEntryNotFoundException();
    if (resolved.source === 'global-reference')
      await this.publishGlobalUsageChanged(
        resolved.plan.id,
        resolved.plan.version,
      );
    this.logger.log(
      'PersonalTrainingPlanService -> deleteCatalogItem -> completed:',
      { data: { catalogEntryId, personId, source: resolved.source } },
    );
  }

  async getWorkout(
    personId: string,
    catalogEntryId: string,
    workoutId: string,
  ): Promise<TrainingPlanWorkoutDetails> {
    this.logger.log('PersonalTrainingPlanService -> getWorkout -> params:', {
      params: { catalogEntryId, personId, workoutId },
    });
    const resolved = await this.resolveEntry(personId, catalogEntryId);
    const workout = await this.trainingPlanService.getWorkout(
      resolved.plan.id,
      workoutId,
      resolved.ownerPersonId,
    );
    const exercises = await this.exerciseImageService.hydrateExercises(
      workout.exercises,
    );
    const result = { ...workout, exercises };
    this.logger.log('PersonalTrainingPlanService -> getWorkout -> return:', {
      data: {
        catalogEntryId,
        exerciseCount: exercises.length,
        personId,
        workoutId,
      },
    });
    return result;
  }

  async getActiveExecutionPlans(
    personId: string,
  ): Promise<readonly PersonalTrainingExecutionPlan[]> {
    this.logger.log(
      'PersonalTrainingPlanService -> getActiveExecutionPlans -> params:',
      { params: { personId } },
    );
    const catalogEntryIds =
      await this.repository.getActiveCatalogEntryIds(personId);
    this.logger.log(
      'PersonalTrainingPlanService -> getActiveExecutionPlans -> repository return:',
      { data: { activeCount: catalogEntryIds.length, personId } },
    );
    const result = await Promise.all(
      catalogEntryIds.map(async (catalogEntryId) => {
        const resolved = await this.resolveEntry(personId, catalogEntryId);
        const plan = await this.trainingPlanService.getExecutionTree(
          resolved.plan.id,
          resolved.ownerPersonId,
        );
        return {
          catalogEntryId,
          ownerPersonId: resolved.ownerPersonId,
          plan,
          source: resolved.source,
        };
      }),
    );
    this.logger.log(
      'PersonalTrainingPlanService -> getActiveExecutionPlans -> return:',
      { data: { activeCount: result.length, personId } },
    );
    return result;
  }

  async findExecutionPlan(
    personId: string,
    catalogEntryId: string,
  ): Promise<PersonalTrainingExecutionPlan | null> {
    this.logger.log(
      'PersonalTrainingPlanService -> findExecutionPlan -> params:',
      { params: { catalogEntryId, personId } },
    );
    const entry = await this.repository.findEntry(personId, catalogEntryId);
    if (entry === null) {
      this.logger.log(
        'PersonalTrainingPlanService -> findExecutionPlan -> return:',
        { data: { found: false, personId } },
      );
      return null;
    }
    const owned = entry.kind === 'owned' && entry.trainingPlanId !== null;
    const referenced =
      entry.kind === 'global-reference' && entry.globalTrainingPlanId !== null;
    if (!owned && !referenced) {
      this.logger.log(
        'PersonalTrainingPlanService -> findExecutionPlan -> return:',
        { data: { found: false, personId } },
      );
      return null;
    }
    const trainingPlanId = owned
      ? (entry.trainingPlanId as string)
      : (entry.globalTrainingPlanId as string);
    const ownerPersonId = owned ? personId : null;
    const plan = await this.trainingPlanService.findExecutionTree(
      trainingPlanId,
      ownerPersonId,
    );
    const result =
      plan === null
        ? null
        : {
            catalogEntryId,
            ownerPersonId,
            plan,
            source: owned ? ('owned' as const) : ('global-reference' as const),
          };
    this.logger.log(
      'PersonalTrainingPlanService -> findExecutionPlan -> return:',
      { data: { found: result !== null, personId, trainingPlanId } },
    );
    return result;
  }

  async resolveOwnedTrainingPlanId(
    personId: string,
    catalogEntryId: string,
  ): Promise<string> {
    const result = await this.resolveOwnedEntry(personId, catalogEntryId);
    this.logger.log(
      'PersonalTrainingPlanService -> resolveOwnedTrainingPlanId -> return:',
      { data: { catalogEntryId, personId, trainingPlanId: result.plan.id } },
    );
    return result.plan.id;
  }

  async startClone(
    personId: string,
    globalTrainingPlanId: string,
  ): Promise<TrainingPlanCloneJobItem> {
    this.logger.log('PersonalTrainingPlanService -> startClone -> params:', {
      params: { globalTrainingPlanId, personId },
    });
    const snapshotDraft =
      await this.repository.getGlobalSnapshot(globalTrainingPlanId);
    if (snapshotDraft === null) throw createTrainingPlanNotFoundException();
    const capturedExercises =
      await this.exerciseImageService.captureCloneExercises(
        snapshotDraft.workouts.flatMap((workout) => workout.exercises),
      );
    let exerciseOffset = 0;
    const workouts = snapshotDraft.workouts.map((workout) => {
      const exercises = capturedExercises.slice(
        exerciseOffset,
        exerciseOffset + workout.exercises.length,
      );
      exerciseOffset += workout.exercises.length;
      return { ...workout, exercises };
    });
    const snapshot = { ...snapshotDraft, workouts };
    const totalImages = snapshot.workouts.reduce(
      (total, workout) =>
        total +
        workout.exercises.filter(
          (exercise) => exercise.type === 'image' && exercise.image !== null,
        ).length,
      0,
    );
    const job = await this.repository.createCloneJob({
      globalTrainingPlanId,
      personId,
      snapshot,
      sourceName: snapshot.name,
      totalImages,
    });
    if (job === null) throw createCloneJobDuplicateException();
    await this.startPersistedJob(job);
    const result = this.toCloneJobItem(job);
    this.logger.log('PersonalTrainingPlanService -> startClone -> return:', {
      data: {
        cloneJobId: job.cloneJobId,
        generation: job.generation,
        personId,
      },
    });
    return result;
  }

  async retryClone(
    personId: string,
    cloneJobId: string,
  ): Promise<TrainingPlanCloneJobItem> {
    this.logger.log('PersonalTrainingPlanService -> retryClone -> params:', {
      params: { cloneJobId, personId },
    });
    const existing = await this.repository.findCloneJob(personId, cloneJobId);
    if (existing === null) throw createCloneJobNotFoundException();
    const job = await this.repository.retryCloneJob(personId, cloneJobId);
    if (job === null) throw createCloneJobStateConflictException();
    await this.startPersistedJob(job);
    const result = this.toCloneJobItem(job);
    this.logger.log('PersonalTrainingPlanService -> retryClone -> return:', {
      data: { cloneJobId, generation: job.generation, personId },
    });
    return result;
  }

  async cancelClone(
    personId: string,
    cloneJobId: string,
  ): Promise<TrainingPlanCloneJobItem> {
    this.logger.log('PersonalTrainingPlanService -> cancelClone -> params:', {
      params: { cloneJobId, personId },
    });
    const existing = await this.repository.findCloneJob(personId, cloneJobId);
    if (existing === null) throw createCloneJobNotFoundException();
    const job = await this.repository.requestCloneJobCancellation(
      personId,
      cloneJobId,
    );
    if (job === null) throw createCloneJobStateConflictException();
    if (existing.state === 'failed' || existing.state === 'start-failed')
      await this.startPersistedJob(job);
    const result = this.toCloneJobItem(job);
    this.logger.log('PersonalTrainingPlanService -> cancelClone -> return:', {
      data: { cloneJobId, personId, state: result.state },
    });
    return result;
  }

  async usageForGlobals(
    globalTrainingPlanIds: readonly string[],
  ): Promise<GlobalTrainingPlanUsageMap> {
    const result = await this.repository.usageForGlobals(globalTrainingPlanIds);
    this.logger.log(
      'PersonalTrainingPlanService -> usageForGlobals -> return:',
      { data: { count: result.size } },
    );
    return result;
  }

  async usageForGlobal(
    globalTrainingPlanId: string,
  ): Promise<GlobalTrainingPlanUsage> {
    const usage = await this.repository.usageForGlobals([globalTrainingPlanId]);
    const result = usage.get(globalTrainingPlanId) ?? {
      activePeople: 0,
      linkedPeople: 0,
    };
    this.logger.log(
      'PersonalTrainingPlanService -> usageForGlobal -> return:',
      {
        data: { globalTrainingPlanId, ...result },
      },
    );
    return result;
  }

  async cleanupGlobalReferences(globalTrainingPlanId: string): Promise<void> {
    await this.repository.cleanupGlobalReferences(globalTrainingPlanId);
    this.logger.log(
      'PersonalTrainingPlanService -> cleanupGlobalReferences -> completed:',
      { data: { globalTrainingPlanId } },
    );
  }

  async retainedSourceImageKeys(
    globalTrainingPlanId: string,
  ): Promise<ReadonlySet<string>> {
    const result =
      await this.repository.retainedSourceImageKeys(globalTrainingPlanId);
    this.logger.log(
      'PersonalTrainingPlanService -> retainedSourceImageKeys -> return:',
      { data: { count: result.size, globalTrainingPlanId } },
    );
    return result;
  }

  private async resolveEntry(
    personId: string,
    catalogEntryId: string,
  ): Promise<ResolvedCatalogEntry> {
    const entry = await this.repository.findEntry(personId, catalogEntryId);
    if (entry === null) throw createCatalogEntryNotFoundException();
    if (entry.kind === 'owned' && entry.trainingPlanId !== null) {
      const plan = await this.trainingPlanService.getOwned(
        personId,
        entry.trainingPlanId,
      );
      return { entry, ownerPersonId: personId, plan, source: 'owned' };
    }
    if (
      entry.kind === 'global-reference' &&
      entry.globalTrainingPlanId !== null
    ) {
      const plan = await this.trainingPlanService.getGlobal(
        entry.globalTrainingPlanId,
      );
      return {
        entry,
        ownerPersonId: null,
        plan,
        source: 'global-reference',
      };
    }
    throw createCatalogEntryNotFoundException();
  }

  private async resolveOwnedEntry(
    personId: string,
    catalogEntryId: string,
  ): Promise<ResolvedCatalogEntry & { source: 'owned' }> {
    const resolved = await this.resolveEntry(personId, catalogEntryId);
    if (resolved.source !== 'owned')
      throw createGlobalReferenceReadOnlyException();
    return { ...resolved, source: 'owned' };
  }

  private toPlanItem(
    entry: PersonalCatalogEntry,
    plan: TrainingPlanEntity,
    active: boolean,
  ): PersonalTrainingPlanListItem {
    if (entry.kind === 'owned')
      return {
        active,
        catalogEntryId: entry.id,
        createdAt: plan.createdAt,
        description: plan.description,
        id: plan.id,
        itemType: 'training-plan',
        name: plan.name,
        source: 'owned',
        updatedAt: plan.updatedAt,
        version: plan.version,
      };
    return {
      active,
      catalogEntryId: entry.id,
      createdAt: plan.createdAt,
      description: plan.description,
      id: plan.id,
      itemType: 'training-plan',
      name: plan.name,
      source: 'global-reference',
      updatedAt: plan.updatedAt,
      version: plan.version,
    };
  }

  private toCloneJobItem(job: TrainingPlanCloneJob): TrainingPlanCloneJobItem {
    if (job.state === 'completed' || job.state === 'cancelled')
      throw createCloneJobStateConflictException();
    const result = {
      cloneJobId: job.cloneJobId,
      completedImages: job.completedImages,
      createdAt: job.createdAt,
      generation: job.generation,
      itemType: 'clone-job' as const,
      sourceName: job.sourceName,
      state: job.state === 'materializing' ? 'running' : job.state,
      totalImages: job.totalImages,
      updatedAt: job.updatedAt,
    };
    return result;
  }

  private async startPersistedJob(job: TrainingPlanCloneJob): Promise<void> {
    try {
      await this.cloneStarter.start({
        cloneJobId: job.cloneJobId,
        generation: job.generation,
      });
    } catch (error: unknown) {
      if (error instanceof TrainingPlanCloneStartError && !error.ambiguous)
        await this.repository.markCloneJobStartFailed(
          job.personId,
          job.cloneJobId,
          job.generation,
        );
      throw createCloneSchedulingUnavailableException();
    }
  }

  private async publishGlobalUsageChanged(
    globalTrainingPlanId: string,
    version: number,
  ): Promise<void> {
    await this.realtimePublisher.publish({
      resource: 'global-training-plan',
      resourceId: globalTrainingPlanId,
      state: 'present',
      version,
    });
    this.logger.log(
      'PersonalTrainingPlanService -> publishGlobalUsageChanged -> completed:',
      { data: { globalTrainingPlanId, version } },
    );
  }
}
