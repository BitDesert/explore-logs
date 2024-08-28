import { Observable, Subscriber, Subscription } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';

import { DataQueryRequest, LoadingState, DataQueryResponse, TimeRange } from '@grafana/data';
import { LokiQuery } from './query';
import {
  addShardingPlaceholderSelector,
  getServiceNameFromQuery,
  interpolateShardingSelector,
  isLogsQuery,
} from './logql';
import { combineResponses } from './combineResponses';
import { DataSourceWithBackend } from '@grafana/runtime';

/**
 * Based in the state of the current response, if any, adjust target parameters such as `maxLines`.
 * For `maxLines`, we will update it as `maxLines - current amount of lines`.
 * At the end, we will filter the targets that don't need to be executed in the next request batch,
 * becasue, for example, the `maxLines` have been reached.
 */
function adjustTargetsFromResponseState(targets: LokiQuery[], response: DataQueryResponse | null): LokiQuery[] {
  if (!response) {
    return targets;
  }

  return targets
    .map((target) => {
      if (!target.maxLines || !isLogsQuery(target.expr)) {
        return target;
      }
      const targetFrame = response.data.find((frame) => frame.refId === target.refId);
      if (!targetFrame) {
        return target;
      }
      const updatedMaxLines = target.maxLines - targetFrame.length;
      return {
        ...target,
        maxLines: updatedMaxLines < 0 ? 0 : updatedMaxLines,
      };
    })
    .filter((target) => target.maxLines === undefined || target.maxLines > 0);
}

export function splitQueriesByStreamShard(
  datasource: DataSourceWithBackend<LokiQuery>,
  request: DataQueryRequest<LokiQuery>,
  splittingTargets: LokiQuery[]
) {
  let shouldStop = false;
  let mergedResponse: DataQueryResponse = { data: [], state: LoadingState.Streaming, key: uuidv4() };
  let subquerySubsciption: Subscription | null = null;
  let retriesMap = new Map<number, number>();

  const runNextRequest = (subscriber: Subscriber<DataQueryResponse>, cycle?: number, shardRequests?: number[][]) => {
    if (shouldStop) {
      subscriber.complete();
      return;
    }

    const done = () => {
      mergedResponse.state = LoadingState.Done;
      subscriber.next(mergedResponse);
      subscriber.complete();
    };

    const nextRequest = () => {
      if (cycle === undefined || shardRequests === undefined) {
        done();
        return;
      }

      const nextCycle = cycle + 1;
      if (nextCycle < shardRequests.length) {
        runNextRequest(subscriber, nextCycle, shardRequests);
        return;
      }
      done();
    };

    const retry = (errorResponse?: DataQueryResponse) => {
      if (errorResponse?.errors && errorResponse.errors[0].message?.includes('maximum of series')) {
        console.log(`Maximum series reached, skipping retry`);
        return false;
      }

      const key = cycle !== undefined ? cycle : 0;
      const retries = retriesMap.get(key) ?? 0;
      if (retries > 2) {
        return false;
      }

      retriesMap.set(key, retries + 1);

      console.log(`Retrying ${cycle} (${retries + 1})`);
      runNextRequest(subscriber, cycle, shardRequests);
      return true;
    };

    const targets = adjustTargetsFromResponseState(splittingTargets, mergedResponse);
    if (!targets.length) {
      nextRequest();
      return;
    }

    const subRequest = { ...request, targets: interpolateShardingSelector(targets, shardRequests, cycle) };
    // Request may not have a request id
    if (request.requestId) {
      subRequest.requestId = `${request.requestId}_shard_${cycle !== undefined ? cycle : 'no-shard'}`;
    }

    const dsQueryMethod =
      // @ts-expect-error
      shardRequests === undefined ? datasource.query.bind(datasource) : datasource.runQuery.bind(datasource);

    subquerySubsciption = dsQueryMethod(subRequest).subscribe({
      next: (partialResponse: DataQueryResponse) => {
        if ((partialResponse.errors ?? []).length > 0 || partialResponse.error != null) {
          if (retry(partialResponse)) {
            return;
          }
        }
        mergedResponse = combineResponses(mergedResponse, partialResponse);
      },
      complete: () => {
        subscriber.next(mergedResponse);
        nextRequest();
      },
      error: (error: unknown) => {
        console.error(error);
        subscriber.next(mergedResponse);
        if (retry()) {
          return;
        }
        nextRequest();
      },
    });
  };

  const response = new Observable<DataQueryResponse>((subscriber) => {
    const serviceName = getServiceNameFromQuery(splittingTargets[0].expr);
    datasource.languageProvider
      .fetchLabelValues('__stream_shard__', {
        timeRange: request.range,
        streamSelector: serviceName ? `{service_name=${serviceName}}` : undefined,
      })
      .then((values: string[]) => {
        const shards = values.map((value) => parseInt(value, 10));
        const startShard = shards.length ? Math.max(...shards) : undefined;
        if (startShard === undefined) {
          console.warn(`Shard splitting not supported. Issuing a regular query.`);
          runNextRequest(subscriber);
        } else {
          const shardRequests = getShardRequests(shards, request.range);
          console.log(`Querying up ${shards.join(', ')} shards`);
          runNextRequest(subscriber, 0, shardRequests);
        }
      })
      .catch((e: unknown) => {
        console.error(e);
        shouldStop = true;
        runNextRequest(subscriber);
      });
    return () => {
      shouldStop = true;
      if (subquerySubsciption != null) {
        subquerySubsciption.unsubscribe();
      }
    };
  });

  return response;
}

export function runShardSplitQuery(datasource: DataSourceWithBackend<LokiQuery>, request: DataQueryRequest<LokiQuery>) {
  const queries = datasource
    .interpolateVariablesInQueries(request.targets, request.scopedVars)
    .filter((query) => query.expr)
    .map((target) => ({
      ...target,
      expr: addShardingPlaceholderSelector(target.expr),
    }));

  return splitQueriesByStreamShard(datasource, request, queries);
}

function getShardRequests(shards: number[], range: TimeRange) {
  const hours = range.to.diff(range.from, 'hour');

  shards.sort((a, b) => a - b);
  const maxRequests = calculateMaxRequests(shards.length);
  const maxShard = shards.length - 1;
  const groupSize = Math.ceil(maxShard / maxRequests);
  const requests: number[][] = [];
  for (let i = maxShard; i > 0; i -= groupSize) {
    const request: number[] = [];
    for (let j = i; j >= i - groupSize && j >= 0 && shards.length > 0; j -= 1) {
      request.push(shards[j]);
    }
    requests.push(request);
  }

  // With shorter intervals, this gives a similar UX to non-sharded requests.
  if (hours <= 6) {
    requests.push([-1]);
    requests.reverse();
  } else {
    requests.reverse();
    requests.push([-1]);
  }

  return requests;
}

function calculateMaxRequests(shards: number) {
  return Math.min(Math.ceil(Math.sqrt(shards)), shards - 1);
}
