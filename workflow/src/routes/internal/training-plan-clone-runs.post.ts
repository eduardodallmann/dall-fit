import {
  defineEventHandler,
  getHeader,
  readRawBody,
  setResponseStatus,
  type H3Event,
} from 'h3';

import { StartTrainingPlanCloneRunCommand } from '../../training-plan-clone/commands/start-training-plan-clone-run.command';
import { MongoTrainingPlanCloneRepository } from '../../training-plan-clone/repositories/mongo-training-plan-clone.repository';
import {
  BridgeAuthenticationError,
  BridgeAuthenticationService,
} from '../../training-plan-clone/services/bridge-authentication.service';
import { CloneBlobService } from '../../training-plan-clone/services/clone-blob.service';
import {
  CloneStartError,
  TrainingPlanCloneService,
} from '../../training-plan-clone/services/training-plan-clone.service';

const MAX_BODY_BYTES = 512;

export default defineEventHandler(async (event) => {
  const declaredLength = Number(getHeader(event, 'content-length') ?? '0');
  if (
    !Number.isSafeInteger(declaredLength) ||
    declaredLength > MAX_BODY_BYTES
  ) {
    setResponseStatus(event, 413);
    return { error: { code: 'BRIDGE_BODY_TOO_LARGE' } };
  }
  const body = (await readRawBody(event, 'utf8')) ?? '';
  if (Buffer.byteLength(body) > MAX_BODY_BYTES) {
    setResponseStatus(event, 413);
    return { error: { code: 'BRIDGE_BODY_TOO_LARGE' } };
  }
  try {
    const input = new BridgeAuthenticationService().authenticate({
      body,
      method: 'POST',
      now: new Date(),
      pathname: '/internal/training-plan-clone-runs',
      signature: getHeader(event, 'x-dall-fit-workflow-signature'),
      timestamp: getHeader(event, 'x-dall-fit-workflow-timestamp'),
      version: getHeader(event, 'x-dall-fit-workflow-version'),
    });
    const repository = new MongoTrainingPlanCloneRepository();
    const service = new TrainingPlanCloneService(
      repository,
      new CloneBlobService(),
    );
    await new StartTrainingPlanCloneRunCommand(service).execute(input);
    setResponseStatus(event, 202);
    return {
      data: { accepted: true, generation: input.generation },
    };
  } catch (error: unknown) {
    return handleStartError(event, error);
  }
});

function handleStartError(event: H3Event, error: unknown) {
  if (error instanceof BridgeAuthenticationError) {
    const unsupportedVersion = error.code === 'version';
    setResponseStatus(event, unsupportedVersion ? 409 : 401);
    return {
      error: {
        code: unsupportedVersion
          ? 'BRIDGE_VERSION_UNSUPPORTED'
          : 'BRIDGE_AUTHENTICATION_FAILED',
      },
    };
  }
  if (error instanceof CloneStartError) {
    const missing = error.code === 'job-not-found';
    setResponseStatus(event, missing ? 404 : 409);
    return {
      error: {
        code: missing ? 'CLONE_JOB_NOT_FOUND' : 'CLONE_JOB_STATE_CONFLICT',
      },
    };
  }
  setResponseStatus(event, 503);
  return { error: { code: 'CLONE_START_UNAVAILABLE' } };
}
