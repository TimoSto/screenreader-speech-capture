import type { GenericSchema } from 'valibot';
import {
  AllowedHostsSchema,
  ConfigPatchSchema,
  ConfigResponseSchema,
  ConfigSchema,
  McpConfigPatchSchema,
  McpConfigSchema,
  ServiceConfigPatchSchema,
  ServiceConfigSchema,
} from './config.js';
import { ErrorBodySchema, ErrorCodeSchema } from './errors.js';
import {
  SessionListSchema,
  SessionSchema,
  StartSessionRequestSchema,
  StartSessionResponseSchema,
} from './session.js';
import {
  MarkerRequestSchema,
  SpeechEntrySchema,
  SpeechListSchema,
  WaitResultSchema,
} from './speech.js';
import { ServiceStatusSchema, StatusSchema } from './status.js';

/**
 * Every schema of the API by its name in `docs/usage/openapi.yaml` (`components.schemas`), which
 * `pnpm openapi` generates from this list.
 */
export const API_SCHEMAS: Record<string, GenericSchema> = {
  SpeechEntry: SpeechEntrySchema,
  SpeechList: SpeechListSchema,
  MarkerRequest: MarkerRequestSchema,
  Session: SessionSchema,
  StartSessionResponse: StartSessionResponseSchema,
  SessionList: SessionListSchema,
  StartSessionRequest: StartSessionRequestSchema,
  Status: StatusSchema,
  Config: ConfigSchema,
  ConfigResponse: ConfigResponseSchema,
  ConfigPatch: ConfigPatchSchema,
  ServiceStatus: ServiceStatusSchema,
  ServiceConfigPatch: ServiceConfigPatchSchema,
  ServiceConfig: ServiceConfigSchema,
  McpConfigPatch: McpConfigPatchSchema,
  McpConfig: McpConfigSchema,
  AllowedHosts: AllowedHostsSchema,
  ErrorCode: ErrorCodeSchema,
  ErrorBody: ErrorBodySchema,
  WaitResult: WaitResultSchema,
};
