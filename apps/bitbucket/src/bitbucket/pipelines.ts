/**
 * Bitbucket Pipeline Operations
 *
 * API operations for managing Bitbucket pipelines (CI/CD).
 * Includes: list pipelines, get details, get steps, get logs, trigger pipeline.
 */

import { bitbucketClient } from './client';
import type {
  BitbucketPipeline,
  BitbucketPipelineStep,
  BitbucketPipelineLog,
  BitbucketPaginatedResponse,
} from './types';

/**
 * List pipelines in a repository
 *
 * GET /repositories/{workspace}/{repo}/pipelines
 */
export async function listPipelines(
  workspace: string,
  repo: string,
  options?: {
    page?: number;
    pagelen?: number;
    q?: string;
    sort?: string;
  }
): Promise<BitbucketPaginatedResponse<BitbucketPipeline>> {
  return bitbucketClient.get<BitbucketPaginatedResponse<BitbucketPipeline>>(
    `repositories/${workspace}/${repo}/pipelines`,
    {
      page: options?.page,
      pagelen: options?.pagelen ?? 10,
      q: options?.q,
      sort: options?.sort,
    }
  );
}

/**
 * Get pipeline details
 *
 * GET /repositories/{workspace}/{repo}/pipelines/{uuid}
 */
export async function getPipeline(
  workspace: string,
  repo: string,
  uuid: string
): Promise<BitbucketPipeline> {
  // Remove curly braces from UUID if present
  const cleanUuid = uuid.replace(/[{}]/g, '');
  return bitbucketClient.get<BitbucketPipeline>(
    `repositories/${workspace}/${repo}/pipelines/{${cleanUuid}}`
  );
}

/**
 * Get pipeline steps
 *
 * GET /repositories/{workspace}/{repo}/pipelines/{uuid}/steps
 */
export async function getPipelineSteps(
  workspace: string,
  repo: string,
  uuid: string,
  options?: {
    page?: number;
    pagelen?: number;
  }
): Promise<BitbucketPaginatedResponse<BitbucketPipelineStep>> {
  // Remove curly braces from UUID if present
  const cleanUuid = uuid.replace(/[{}]/g, '');
  return bitbucketClient.get<BitbucketPaginatedResponse<BitbucketPipelineStep>>(
    `repositories/${workspace}/${repo}/pipelines/{${cleanUuid}}/steps`,
    {
      page: options?.page,
      pagelen: options?.pagelen ?? 10,
    }
  );
}

/**
 * Get step logs
 *
 * GET /repositories/{workspace}/{repo}/pipelines/{uuid}/steps/{step_uuid}/log
 */
export async function getStepLogs(
  workspace: string,
  repo: string,
  pipelineUuid: string,
  stepUuid: string
): Promise<BitbucketPipelineLog> {
  // Remove curly braces from UUIDs if present
  const cleanPipelineUuid = pipelineUuid.replace(/[{}]/g, '');
  const cleanStepUuid = stepUuid.replace(/[{}]/g, '');

  const response = await bitbucketClient.request<string>(
    `repositories/${workspace}/${repo}/pipelines/{${cleanPipelineUuid}}/steps/{${cleanStepUuid}}/log`,
    { method: 'GET' }
  );

  return {
    log: response,
    size: response.length,
  };
}

/**
 * Trigger a pipeline
 *
 * POST /repositories/{workspace}/{repo}/pipelines
 */
export async function triggerPipeline(
  workspace: string,
  repo: string,
  options: {
    branch: string;
    pipelineSelector?: string; // Custom pipeline name or 'default'
    variables?: Array<{ key: string; value: string; secured?: boolean }>;
  }
): Promise<BitbucketPipeline> {
  const body: Record<string, unknown> = {
    target: {
      type: 'pipeline_ref_target',
      ref_type: 'branch',
      ref_name: options.branch,
      ...(options.pipelineSelector && {
        selector: {
          type: options.pipelineSelector === 'default' ? 'default' : 'custom',
          ...(options.pipelineSelector !== 'default' && {
            pattern: options.pipelineSelector,
          }),
        },
      }),
    },
  };

  if (options.variables && options.variables.length > 0) {
    body.variables = options.variables;
  }

  return bitbucketClient.post<BitbucketPipeline>(
    `repositories/${workspace}/${repo}/pipelines`,
    body
  );
}

/**
 * Stop a pipeline
 *
 * POST /repositories/{workspace}/{repo}/pipelines/{uuid}/stopPipeline
 */
export async function stopPipeline(
  workspace: string,
  repo: string,
  uuid: string
): Promise<void> {
  // Remove curly braces from UUID if present
  const cleanUuid = uuid.replace(/[{}]/g, '');
  await bitbucketClient.post(
    `repositories/${workspace}/${repo}/pipelines/{${cleanUuid}}/stopPipeline`
  );
}

// ============================================================================
// Action Handlers (for Forge function handlers)
// ============================================================================

export interface ListPipelinesInput {
  workspace: string;
  repo: string;
  page?: number;
  pagelen?: number;
}

export interface ListPipelinesResponse {
  status: 'success' | 'error';
  pipelines: Array<{
    uuid: string;
    buildNumber: number;
    state: string;
    result?: string;
    trigger: string;
    refName: string;
    commit?: string;
    createdOn: string;
    completedOn?: string;
    duration?: number;
    link: string;
  }>;
  pagination: {
    page: number;
    pagelen: number;
    size: number;
    hasNext: boolean;
  };
  message: string;
}

export async function listPipelinesAction(input: {
  payload: ListPipelinesInput;
}): Promise<ListPipelinesResponse> {
  try {
    const { workspace, repo, page, pagelen } = input.payload;
    const result = await listPipelines(workspace, repo, { page, pagelen });

    return {
      status: 'success',
      pipelines: result.values.map((pipeline) => ({
        uuid: pipeline.uuid,
        buildNumber: pipeline.build_number,
        state: pipeline.state.name,
        result: pipeline.state.result?.name,
        trigger: pipeline.trigger.name,
        refName: pipeline.target.ref_name,
        commit: pipeline.target.commit?.hash,
        createdOn: pipeline.created_on,
        completedOn: pipeline.completed_on,
        duration: pipeline.duration_in_seconds,
        link: pipeline.links?.html?.href ?? '',
      })),
      pagination: {
        page: result.page,
        pagelen: result.pagelen,
        size: result.size,
        hasNext: !!result.next,
      },
      message: `Found ${result.size} pipelines in ${repo}`,
    };
  } catch (error) {
    return {
      status: 'error',
      pipelines: [],
      pagination: { page: 1, pagelen: 10, size: 0, hasNext: false },
      message: error instanceof Error ? error.message : 'Failed to list pipelines',
    };
  }
}

export interface GetPipelineInput {
  workspace: string;
  repo: string;
  uuid: string;
}

export interface GetPipelineResponse {
  status: 'success' | 'error';
  pipeline?: {
    uuid: string;
    buildNumber: number;
    state: string;
    result?: string;
    stage?: string;
    trigger: string;
    refName: string;
    commit?: {
      hash: string;
      message: string;
      author: string;
    };
    creator: string;
    createdOn: string;
    completedOn?: string;
    duration?: number;
    runNumber: number;
  };
  message: string;
}

export async function getPipelineAction(input: {
  payload: GetPipelineInput;
}): Promise<GetPipelineResponse> {
  try {
    const { workspace, repo, uuid } = input.payload;
    const result = await getPipeline(workspace, repo, uuid);

    return {
      status: 'success',
      pipeline: {
        uuid: result.uuid,
        buildNumber: result.build_number,
        state: result.state.name,
        result: result.state.result?.name,
        stage: result.state.stage?.name,
        trigger: result.trigger.name,
        refName: result.target.ref_name,
        commit: result.target.commit
          ? {
              hash: result.target.commit.hash,
              message: result.target.commit.message,
              author: result.target.commit.author.display_name,
            }
          : undefined,
        creator: result.creator.display_name,
        createdOn: result.created_on,
        completedOn: result.completed_on,
        duration: result.duration_in_seconds,
        runNumber: result.run_number,
      },
      message: `Pipeline ${result.build_number} details retrieved`,
    };
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Failed to get pipeline details',
    };
  }
}

export interface GetPipelineStepsInput {
  workspace: string;
  repo: string;
  uuid: string;
  page?: number;
  pagelen?: number;
}

export interface GetPipelineStepsResponse {
  status: 'success' | 'error';
  steps: Array<{
    uuid: string;
    name: string;
    type: string;
    state: string;
    result?: string;
    image?: string;
    startedOn?: string;
    completedOn?: string;
    duration?: number;
    scriptCommands?: Array<{
      name: string;
      command: string;
      exitCode?: number;
      duration?: number;
    }>;
  }>;
  pagination: {
    page: number;
    pagelen: number;
    size: number;
    hasNext: boolean;
  };
  message: string;
}

export async function getPipelineStepsAction(input: {
  payload: GetPipelineStepsInput;
}): Promise<GetPipelineStepsResponse> {
  try {
    const { workspace, repo, uuid, page, pagelen } = input.payload;
    const result = await getPipelineSteps(workspace, repo, uuid, { page, pagelen });

    return {
      status: 'success',
      steps: result.values.map((step) => ({
        uuid: step.uuid,
        name: step.name,
        type: step.type,
        state: step.state.name,
        result: step.state.result?.name,
        image: step.image?.name,
        startedOn: step.started_on,
        completedOn: step.completed_on,
        duration: step.duration_in_seconds,
        scriptCommands: step.script_commands?.map((cmd) => ({
          name: cmd.name,
          command: cmd.command,
          exitCode: cmd.exit_code,
          duration: cmd.duration_in_seconds,
        })),
      })),
      pagination: {
        page: result.page,
        pagelen: result.pagelen,
        size: result.size,
        hasNext: !!result.next,
      },
      message: `Found ${result.size} steps in pipeline`,
    };
  } catch (error) {
    return {
      status: 'error',
      steps: [],
      pagination: { page: 1, pagelen: 10, size: 0, hasNext: false },
      message: error instanceof Error ? error.message : 'Failed to get pipeline steps',
    };
  }
}

export interface GetStepLogsInput {
  workspace: string;
  repo: string;
  pipelineUuid: string;
  stepUuid: string;
}

export interface GetStepLogsResponse {
  status: 'success' | 'error';
  logs?: string;
  size: number;
  message: string;
}

export async function getStepLogsAction(input: {
  payload: GetStepLogsInput;
}): Promise<GetStepLogsResponse> {
  try {
    const { workspace, repo, pipelineUuid, stepUuid } = input.payload;
    const result = await getStepLogs(workspace, repo, pipelineUuid, stepUuid);

    return {
      status: 'success',
      logs: result.log,
      size: result.size,
      message: `Logs retrieved (${result.size} bytes)`,
    };
  } catch (error) {
    return {
      status: 'error',
      size: 0,
      message: error instanceof Error ? error.message : 'Failed to get step logs',
    };
  }
}

export interface TriggerPipelineInput {
  workspace: string;
  repo: string;
  branch: string;
  pipelineSelector?: string;
  variables?: Array<{ key: string; value: string; secured?: boolean }>;
}

export interface TriggerPipelineResponse {
  status: 'success' | 'error';
  pipeline?: {
    uuid: string;
    buildNumber: number;
    state: string;
    link: string;
  };
  message: string;
}

export async function triggerPipelineAction(input: {
  payload: TriggerPipelineInput;
}): Promise<TriggerPipelineResponse> {
  try {
    const { workspace, repo, branch, pipelineSelector, variables } = input.payload;
    const result = await triggerPipeline(workspace, repo, {
      branch,
      pipelineSelector,
      variables,
    });

    return {
      status: 'success',
      pipeline: {
        uuid: result.uuid,
        buildNumber: result.build_number,
        state: result.state.name,
        link: result.links?.html?.href ?? '',
      },
      message: `Pipeline #${result.build_number} triggered successfully`,
    };
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Failed to trigger pipeline',
    };
  }
}
