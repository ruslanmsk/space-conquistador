import type { ApiError, CreateRoomRequest, GuestRequest, GuestSession, PlayerProfile, RoomView, UpdateMeRequest } from "@space-conquistador/protocol";
import { serverUrl } from "./config";

/** Failed HTTP call; `code` is the protocol error code (or "network" when the server is unreachable). */
export class OnlineError extends Error {
  constructor(
    public code: ApiError["error"] | "network",
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown, token?: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${serverUrl()}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new OnlineError("network", "Сервер недоступен. Проверьте связь и попробуйте ещё раз.");
  }
  const data = (await res.json().catch(() => null)) as T | ApiError | null;
  if (!res.ok) {
    const e = data as ApiError | null;
    throw new OnlineError(e?.error ?? (res.status === 401 ? "unauthorized" : "internal"), errorText(e?.error, e?.message));
  }
  return data as T;
}

export const api = {
  guest: (b: GuestRequest) => request<GuestSession>("POST", "/api/guest", b),
  me: (token: string) => request<PlayerProfile>("GET", "/api/me", undefined, token),
  rename: (token: string, b: UpdateMeRequest) => request<PlayerProfile>("PATCH", "/api/me", b, token),
  createRoom: (token: string, b: CreateRoomRequest) => request<RoomView>("POST", "/api/rooms", b, token),
};

/** Human text for protocol error codes. */
export function errorText(code: string | undefined, fallback?: string): string {
  switch (code) {
    case "not_found":
      return "Комната не найдена. Проверьте код.";
    case "room_full":
      return "В комнате нет мест.";
    case "room_started":
      return "В этой комнате уже идёт матч.";
    case "not_host":
      return "Это может сделать только хозяин комнаты.";
    case "not_enough_players":
      return "Нужно хотя бы два игрока.";
    case "not_ready":
      return "Не все игроки готовы.";
    case "unauthorized":
      return "Сессия устарела — представьтесь заново.";
    case "version_mismatch":
      return "Версия игры устарела — обновите приложение.";
    case "bad_request":
      return fallback || "Неверный запрос.";
    default:
      return fallback || "Что-то пошло не так.";
  }
}
