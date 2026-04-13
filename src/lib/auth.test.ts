// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SignJWT, jwtVerify } from "jose";
import { NextRequest } from "next/server";

// Mock server-only so it doesn't throw outside Next.js
vi.mock("server-only", () => ({}));

// Shared cookie store mock
type CookieOptions = {
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: string;
  expires?: Date;
  path?: string;
};

const cookieStore = {
  _data: new Map<string, string>(),
  _options: new Map<string, CookieOptions>(),
  get(name: string) {
    const value = this._data.get(name);
    return value ? { value } : undefined;
  },
  set(name: string, value: string, options?: CookieOptions) {
    this._data.set(name, value);
    if (options) this._options.set(name, options);
  },
  delete(name: string) {
    this._data.delete(name);
    this._options.delete(name);
  },
};

vi.mock("next/headers", () => ({
  cookies: vi.fn(() => Promise.resolve(cookieStore)),
}));

const JWT_SECRET = new TextEncoder().encode("development-secret-key");

async function makeValidToken(
  userId: string,
  email: string,
  expiresIn = "7d"
) {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  return new SignJWT({ userId, email, expiresAt })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(expiresIn)
    .setIssuedAt()
    .sign(JWT_SECRET);
}

describe("createSession", () => {
  beforeEach(() => {
    cookieStore._data.clear();
    cookieStore._options.clear();
  });

  it("sets an auth-token cookie", async () => {
    const { createSession } = await import("@/lib/auth");
    await createSession("user-1", "user@example.com");
    expect(cookieStore._data.has("auth-token")).toBe(true);
  });

  it("stores a verifiable JWT with correct userId and email", async () => {
    const { createSession } = await import("@/lib/auth");
    await createSession("user-42", "hello@test.com");
    const token = cookieStore._data.get("auth-token")!;
    const { payload } = await jwtVerify(token, JWT_SECRET);
    expect(payload.userId).toBe("user-42");
    expect(payload.email).toBe("hello@test.com");
  });

  it("signs the token with HS256", async () => {
    const { createSession } = await import("@/lib/auth");
    await createSession("u1", "a@b.com");
    const token = cookieStore._data.get("auth-token")!;
    // Decode header without verifying
    const header = JSON.parse(
      Buffer.from(token.split(".")[0], "base64url").toString()
    );
    expect(header.alg).toBe("HS256");
  });

  it("token includes an issuedAt claim", async () => {
    const { createSession } = await import("@/lib/auth");
    const before = Math.floor(Date.now() / 1000);
    await createSession("u2", "b@c.com");
    const after = Math.floor(Date.now() / 1000);
    const token = cookieStore._data.get("auth-token")!;
    const { payload } = await jwtVerify(token, JWT_SECRET);
    expect(payload.iat).toBeGreaterThanOrEqual(before);
    expect(payload.iat).toBeLessThanOrEqual(after);
  });

  it("token expires in approximately 7 days", async () => {
    const { createSession } = await import("@/lib/auth");
    const before = Math.floor(Date.now() / 1000);
    await createSession("u3", "c@d.com");
    const token = cookieStore._data.get("auth-token")!;
    const { payload } = await jwtVerify(token, JWT_SECRET);
    const sevenDaysSeconds = 7 * 24 * 60 * 60;
    expect(payload.exp).toBeGreaterThanOrEqual(before + sevenDaysSeconds - 5);
    expect(payload.exp).toBeLessThanOrEqual(before + sevenDaysSeconds + 5);
  });

  it("sets httpOnly on the cookie", async () => {
    const { createSession } = await import("@/lib/auth");
    await createSession("u4", "d@e.com");
    expect(cookieStore._options.get("auth-token")?.httpOnly).toBe(true);
  });

  it("sets sameSite to lax on the cookie", async () => {
    const { createSession } = await import("@/lib/auth");
    await createSession("u5", "e@f.com");
    expect(cookieStore._options.get("auth-token")?.sameSite).toBe("lax");
  });

  it("sets cookie path to /", async () => {
    const { createSession } = await import("@/lib/auth");
    await createSession("u6", "f@g.com");
    expect(cookieStore._options.get("auth-token")?.path).toBe("/");
  });

  it("sets cookie expiry to approximately 7 days from now", async () => {
    const { createSession } = await import("@/lib/auth");
    const before = Date.now();
    await createSession("u7", "g@h.com");
    const after = Date.now();
    const expires = cookieStore._options.get("auth-token")?.expires as Date;
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    expect(expires.getTime()).toBeGreaterThanOrEqual(before + sevenDaysMs - 1000);
    expect(expires.getTime()).toBeLessThanOrEqual(after + sevenDaysMs + 1000);
  });

  it("overwrites an existing session when called again", async () => {
    const { createSession } = await import("@/lib/auth");
    await createSession("u8", "first@test.com");
    await createSession("u9", "second@test.com");
    const token = cookieStore._data.get("auth-token")!;
    const { payload } = await jwtVerify(token, JWT_SECRET);
    expect(payload.email).toBe("second@test.com");
  });
});

describe("getSession", () => {
  beforeEach(() => cookieStore._data.clear());

  it("returns null when no cookie is present", async () => {
    const { getSession } = await import("@/lib/auth");
    expect(await getSession()).toBeNull();
  });

  it("returns the session payload for a valid token", async () => {
    const { getSession } = await import("@/lib/auth");
    cookieStore._data.set("auth-token", await makeValidToken("u1", "a@b.com"));
    const session = await getSession();
    expect(session?.userId).toBe("u1");
    expect(session?.email).toBe("a@b.com");
  });

  it("returns null for an expired token", async () => {
    const { getSession } = await import("@/lib/auth");
    // Sign a token that expires in 1 second then back-date it
    const token = await new SignJWT({ userId: "u2", email: "x@y.com" })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime(Math.floor(Date.now() / 1000) - 10) // already expired
      .setIssuedAt()
      .sign(JWT_SECRET);
    cookieStore._data.set("auth-token", token);
    expect(await getSession()).toBeNull();
  });

  it("returns null for a tampered token", async () => {
    const { getSession } = await import("@/lib/auth");
    const token = await makeValidToken("u3", "c@d.com");
    cookieStore._data.set("auth-token", token + "tampered");
    expect(await getSession()).toBeNull();
  });
});

describe("deleteSession", () => {
  beforeEach(() => cookieStore._data.clear());

  it("removes the auth-token cookie", async () => {
    const { deleteSession } = await import("@/lib/auth");
    cookieStore._data.set("auth-token", "some-token");
    await deleteSession();
    expect(cookieStore._data.has("auth-token")).toBe(false);
  });
});

describe("verifySession", () => {
  function makeRequest(token?: string): NextRequest {
    const req = new NextRequest("http://localhost/api/test");
    if (token) {
      req.cookies.set("auth-token", token);
    }
    return req;
  }

  it("returns null when no cookie is present", async () => {
    const { verifySession } = await import("@/lib/auth");
    expect(await verifySession(makeRequest())).toBeNull();
  });

  it("returns the session payload for a valid token", async () => {
    const { verifySession } = await import("@/lib/auth");
    const token = await makeValidToken("u5", "e@f.com");
    const session = await verifySession(makeRequest(token));
    expect(session?.userId).toBe("u5");
    expect(session?.email).toBe("e@f.com");
  });

  it("returns null for an invalid token", async () => {
    const { verifySession } = await import("@/lib/auth");
    expect(await verifySession(makeRequest("bad.token.here"))).toBeNull();
  });

  it("returns null for an expired token", async () => {
    const { verifySession } = await import("@/lib/auth");
    const token = await new SignJWT({ userId: "u6", email: "g@h.com" })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime(Math.floor(Date.now() / 1000) - 10)
      .setIssuedAt()
      .sign(JWT_SECRET);
    expect(await verifySession(makeRequest(token))).toBeNull();
  });
});
