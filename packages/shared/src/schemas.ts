import type { GenericSchema } from 'valibot';
import {
  AllowedHostsSchema,
  ConfigOverridesSchema,
  ConfigPatchSchema,
  ConfigSchema,
  McpConfigPatchSchema,
  McpConfigSchema,
  ServiceConfigPatchSchema,
  ServiceConfigSchema,
} from './config.js';
import { ErrorBodySchema, ErrorCodeSchema } from './errors.js';
import {
  CaptureOptionsSchema,
  ClickRequestSchema,
  FocusedWindowSchema,
  FocusRequestSchema,
  InputCaptureSchema,
  KeysRequestSchema,
} from './input.js';
import {
  SessionListSchema,
  SessionSchema,
  StartSessionRequestSchema,
  StartSessionResponseSchema,
} from './session.js';
import {
  LatestMarkerSchema,
  MarkerRequestSchema,
  SpeechEntrySchema,
  SpeechListSchema,
  WaitResultSchema,
} from './speech.js';
import { InputAvailabilitySchema, ServiceStatusSchema, StatusSchema } from './status.js';

/**
 * Every schema of the API by its name in `docs/usage/openapi.yaml` (`components.schemas`), which
 * `pnpm openapi` generates from this list.
 */
export const API_SCHEMAS: Record<string, GenericSchema> = {
  SpeechEntry: SpeechEntrySchema,
  SpeechList: SpeechListSchema,
  MarkerRequest: MarkerRequestSchema,
  LatestMarker: LatestMarkerSchema,
  ClickRequest: ClickRequestSchema,
  KeysRequest: KeysRequestSchema,
  CaptureOptions: CaptureOptionsSchema,
  InputCapture: InputCaptureSchema,
  FocusRequest: FocusRequestSchema,
  FocusedWindow: FocusedWindowSchema,
  Session: SessionSchema,
  StartSessionResponse: StartSessionResponseSchema,
  SessionList: SessionListSchema,
  StartSessionRequest: StartSessionRequestSchema,
  Status: StatusSchema,
  Config: ConfigSchema,
  ConfigPatch: ConfigPatchSchema,
  ConfigOverrides: ConfigOverridesSchema,
  InputAvailability: InputAvailabilitySchema,
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
