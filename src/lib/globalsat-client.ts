import { z } from "zod";

const DEFAULT_BASE_URL = "https://apis.rastreioglobalsat.com";

export type GlobalSatErrorCode =
  "AUTH" | "RATE_LIMITED" | "TIMEOUT" | "UPSTREAM" | "INVALID_RESPONSE";

export class GlobalSatError extends Error {
  constructor(public readonly code: GlobalSatErrorCode) {
    super(`GlobalSAT: ${code}`);
    this.name = "GlobalSatError";
  }
}

export type GlobalSatTarget = {
  id: number;
  plate: string;
  gmtOffset: number;
  position: {
    id: number;
    latitude: number;
    longitude: number;
    recordedAt: Date;
  } | null;
};

export type GlobalSatTrackedPosition = {
  id: bigint;
  targetId: number;
  latitude: number;
  longitude: number;
  gpsTime: string;
};

export type GlobalSatTrackingPage = {
  nextStartId: bigint;
  rows: number;
  positions: GlobalSatTrackedPosition[];
};

const tokenSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.literal("Bearer"),
  expires_in: z.coerce.number().int().positive(),
});

const targetSchema = z.array(
  z.object({
    id_target: z.coerce.number().int().positive(),
    lic_plate: z.string(),
    gmt_offset: z.coerce.number().finite(),
    position: z
      .object({
        id_position: z.coerce.number().int().positive(),
        gps_timestamp: z.string(),
        lat: z.coerce.number().min(-90).max(90),
        lng: z.coerce.number().min(-180).max(180),
      })
      .nullable()
      .optional(),
  }),
);

const trackedPositionSchema = z.object({
  id_tracked_position: z.union([
    z.number().int().nonnegative(),
    z.string().regex(/^\d+$/),
  ]),
  target_id: z.coerce.number().int().positive(),
  gps_time: z.string(),
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});

const trackingPageSchema = z.object({
  NextStartID: z.union([
    z.number().int().nonnegative(),
    z.string().regex(/^\d+$/),
  ]),
  rows: z.coerce.number().int().nonnegative(),
  status: z.literal("ok"),
  query_result: z.array(trackedPositionSchema),
});

export function normalizePlate(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase();
}

export function parseGlobalSatDate(value: string, gmtOffset: number) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})$/.exec(
    value,
  );
  if (!match || !Number.isFinite(gmtOffset))
    throw new GlobalSatError("INVALID_RESPONSE");
  const [, day, month, year, hour, minute, second] = match;
  const localWallClock = Date.UTC(
    +year,
    +month - 1,
    +day,
    +hour,
    +minute,
    +second,
  );
  const probe = new Date(localWallClock);
  if (
    !Number.isFinite(probe.getTime()) ||
    probe.getUTCFullYear() !== +year ||
    probe.getUTCMonth() !== +month - 1 ||
    probe.getUTCDate() !== +day ||
    probe.getUTCHours() !== +hour ||
    probe.getUTCMinutes() !== +minute ||
    probe.getUTCSeconds() !== +second
  )
    throw new GlobalSatError("INVALID_RESPONSE");
  return new Date(localWallClock - gmtOffset * 3600000);
}

function formatQueryDate(date: Date, gmtOffset = -3) {
  date = new Date(date.getTime() + gmtOffset * 3600000);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value || "";
  return `${get("day")}/${get("month")}/${get("year")} ${get("hour")}:${get("minute")}:${get("second")}`;
}

async function jsonBody(response: Response) {
  try {
    return await response.json();
  } catch {
    throw new GlobalSatError("INVALID_RESPONSE");
  }
}

export class GlobalSatClient {
  private readonly baseUrl: string;
  private accessToken: string | null = null;
  private tokenExpiresAt = 0;
  private tokenRequest: Promise<string> | null = null;

  constructor(
    private readonly config: {
      clientId: string;
      clientSecret: string;
      baseUrl?: string;
      tokenStore?: {
        load(): Promise<{ token: string; expiresAt: number } | null>;
        save(value: { token: string; expiresAt: number }): Promise<void>;
      };
    },
    private readonly fetcher: typeof fetch = fetch,
  ) {
    this.baseUrl = (config.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, "");
  }

  private async fetchResponse(url: string, init: RequestInit) {
    try {
      return await this.fetcher(url, {
        ...init,
        redirect: "error",
        signal: AbortSignal.timeout(15000),
      });
    } catch (error) {
      if (error instanceof GlobalSatError) throw error;
      throw new GlobalSatError("TIMEOUT");
    }
  }

  private async token(force = false) {
    if (!force && this.accessToken && Date.now() < this.tokenExpiresAt)
      return this.accessToken;
    if (this.tokenRequest) return this.tokenRequest;
    this.tokenRequest = this.obtainToken(force);
    try {
      return await this.tokenRequest;
    } finally {
      this.tokenRequest = null;
    }
  }

  private async obtainToken(force: boolean) {
    if (!force && this.config.tokenStore) {
      const cached = await this.config.tokenStore.load();
      if (cached && cached.expiresAt > Date.now()) {
        this.accessToken = cached.token;
        this.tokenExpiresAt = cached.expiresAt;
        return cached.token;
      }
    }
    const body = new URLSearchParams({
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      grant_type: "client_credentials",
    });
    const response = await this.fetchResponse(
      `${this.baseUrl}/oauth/access_token`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body,
      },
    );
    if (!response.ok)
      throw new GlobalSatError(
        response.status === 429 ? "RATE_LIMITED" : "AUTH",
      );
    const parsed = tokenSchema.safeParse(await jsonBody(response));
    if (!parsed.success) throw new GlobalSatError("INVALID_RESPONSE");
    this.accessToken = parsed.data.access_token;
    this.tokenExpiresAt =
      Date.now() + Math.max(0, parsed.data.expires_in - 60) * 1000;
    await this.config.tokenStore?.save({
      token: this.accessToken,
      expiresAt: this.tokenExpiresAt,
    });
    return this.accessToken;
  }

  private async post(
    path: string,
    body: URLSearchParams,
    retried = false,
  ): Promise<unknown> {
    const token = await this.token(retried);
    const response = await this.fetchResponse(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
    if (response.status === 401 && !retried) {
      this.accessToken = null;
      this.tokenExpiresAt = 0;
      return this.post(path, body, true);
    }
    if (response.status === 401) throw new GlobalSatError("AUTH");
    if (response.status === 429) throw new GlobalSatError("RATE_LIMITED");
    if (response.status >= 500) throw new GlobalSatError("UPSTREAM");
    if (!response.ok) throw new GlobalSatError("INVALID_RESPONSE");
    return jsonBody(response);
  }

  async listTargets(): Promise<GlobalSatTarget[]> {
    const parsed = targetSchema.safeParse(
      await this.post("/api/targets", new URLSearchParams({ lang: "pt" })),
    );
    if (!parsed.success) throw new GlobalSatError("INVALID_RESPONSE");
    return parsed.data.map((target) => ({
      id: target.id_target,
      plate: target.lic_plate,
      gmtOffset: target.gmt_offset,
      position: target.position
        ? {
            id: target.position.id_position,
            latitude: target.position.lat,
            longitude: target.position.lng,
            recordedAt: parseGlobalSatDate(
              target.position.gps_timestamp,
              target.gmt_offset,
            ),
          }
        : null,
    }));
  }

  async getTrackingData(input: {
    targetIds: number[];
    fromId?: bigint;
    initialSince?: Date;
    gmtOffset?: number;
    limit: number;
  }): Promise<GlobalSatTrackingPage> {
    const body = new URLSearchParams({
      id_targets: input.targetIds.join(","),
      limit: String(input.limit),
      lang: "pt",
    });
    if (input.fromId !== undefined) body.set("from_id", String(input.fromId));
    else if (input.initialSince)
      body.set(
        "ini_date",
        formatQueryDate(input.initialSince, input.gmtOffset),
      );
    const parsed = trackingPageSchema.safeParse(
      await this.post("/api/reports/tracking_data", body),
    );
    if (!parsed.success) throw new GlobalSatError("INVALID_RESPONSE");
    return {
      nextStartId: BigInt(parsed.data.NextStartID),
      rows: parsed.data.rows,
      positions: parsed.data.query_result.map((position) => ({
        id: BigInt(position.id_tracked_position),
        targetId: position.target_id,
        latitude: position.lat,
        longitude: position.lng,
        gpsTime: position.gps_time,
      })),
    };
  }
}
