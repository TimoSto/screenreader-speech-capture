import type { ServiceStatus } from '../../../domain/service.js';

/** `POST /api/v1/services/{name}/{start|stop|restart}`. Answers with the service's status. */
export interface ManageServices {
  /** `NOT_FOUND` for an unknown name, `SERVICE_UNAVAILABLE` if the service is disabled. */
  start(name: string): Promise<ServiceStatus>;
  /** `NOT_FOUND` for an unknown name. */
  stop(name: string): Promise<ServiceStatus>;
  /** `NOT_FOUND` for an unknown name, `SERVICE_UNAVAILABLE` if the service is disabled. */
  restart(name: string): Promise<ServiceStatus>;
}
