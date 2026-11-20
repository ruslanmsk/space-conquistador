import type { ErrorCode } from "@space-conquistador/protocol";

const HTTP_STATUS: Record<ErrorCode, number> = {
  bad_request: 400,
  unauthorized: 401,
  not_found: 404,
  room_full: 409,
  room_started: 409,
  not_host: 403,
  not_enough_players: 409,
  not_ready: 409,
  not_in_match: 403,
  illegal_action: 409,
  version_mismatch: 400,
  internal: 500,
};

/** An expected failure that goes back to the client as `{ error, message }`. */
export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string = code,
  ) {
    super(message);
  }

  get status(): number {
    return HTTP_STATUS[this.code];
  }
}

export function toApiError(e: unknown): { error: ErrorCode; message: string; status: number } {
  if (e instanceof AppError) return { error: e.code, message: e.message, status: e.status };
  return { error: "internal", message: "Internal server error", status: 500 };
}
