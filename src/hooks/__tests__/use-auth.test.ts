import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAuth } from "@/hooks/use-auth";

// --- mocks ---

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockSignIn = vi.fn();
const mockSignUp = vi.fn();
vi.mock("@/actions", () => ({
  signIn: (...args: unknown[]) => mockSignIn(...args),
  signUp: (...args: unknown[]) => mockSignUp(...args),
}));

const mockGetAnonWorkData = vi.fn();
const mockClearAnonWork = vi.fn();
vi.mock("@/lib/anon-work-tracker", () => ({
  getAnonWorkData: () => mockGetAnonWorkData(),
  clearAnonWork: () => mockClearAnonWork(),
}));

const mockGetProjects = vi.fn();
vi.mock("@/actions/get-projects", () => ({
  getProjects: () => mockGetProjects(),
}));

const mockCreateProject = vi.fn();
vi.mock("@/actions/create-project", () => ({
  createProject: (...args: unknown[]) => mockCreateProject(...args),
}));

// --- helpers ---

function renderAuth() {
  return renderHook(() => useAuth());
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: no anon work, no existing projects
  mockGetAnonWorkData.mockReturnValue(null);
  mockGetProjects.mockResolvedValue([]);
  mockCreateProject.mockResolvedValue({ id: "new-proj-1" });
});

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

describe("initial state", () => {
  it("isLoading starts as false", () => {
    const { result } = renderAuth();
    expect(result.current.isLoading).toBe(false);
  });

  it("exposes signIn, signUp, and isLoading", () => {
    const { result } = renderAuth();
    expect(typeof result.current.signIn).toBe("function");
    expect(typeof result.current.signUp).toBe("function");
    expect(typeof result.current.isLoading).toBe("boolean");
  });
});

// ---------------------------------------------------------------------------
// signIn — loading state
// ---------------------------------------------------------------------------

describe("signIn — loading state", () => {
  it("sets isLoading to true while the action is in flight", async () => {
    let resolveSignIn!: (v: { success: boolean }) => void;
    mockSignIn.mockReturnValue(
      new Promise((res) => {
        resolveSignIn = res;
      })
    );

    const { result } = renderAuth();

    act(() => {
      result.current.signIn("user@test.com", "password");
    });

    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      resolveSignIn({ success: false });
    });

    expect(result.current.isLoading).toBe(false);
  });

  it("resets isLoading to false after success", async () => {
    mockSignIn.mockResolvedValue({ success: true });
    const { result } = renderAuth();
    await act(async () => {
      await result.current.signIn("user@test.com", "password");
    });
    expect(result.current.isLoading).toBe(false);
  });

  it("resets isLoading to false after failure", async () => {
    mockSignIn.mockResolvedValue({ success: false, error: "bad creds" });
    const { result } = renderAuth();
    await act(async () => {
      await result.current.signIn("user@test.com", "password");
    });
    expect(result.current.isLoading).toBe(false);
  });

  it("resets isLoading to false even when the action throws", async () => {
    mockSignIn.mockRejectedValue(new Error("network error"));
    const { result } = renderAuth();
    await act(async () => {
      await result.current.signIn("user@test.com", "password").catch(() => {});
    });
    expect(result.current.isLoading).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// signIn — return value
// ---------------------------------------------------------------------------

describe("signIn — return value", () => {
  it("returns the AuthResult from the server action on success", async () => {
    mockSignIn.mockResolvedValue({ success: true });
    const { result } = renderAuth();
    let returnValue: unknown;
    await act(async () => {
      returnValue = await result.current.signIn("user@test.com", "pw");
    });
    expect(returnValue).toEqual({ success: true });
  });

  it("returns the AuthResult from the server action on failure", async () => {
    const failure = { success: false, error: "Invalid credentials" };
    mockSignIn.mockResolvedValue(failure);
    const { result } = renderAuth();
    let returnValue: unknown;
    await act(async () => {
      returnValue = await result.current.signIn("user@test.com", "wrong");
    });
    expect(returnValue).toEqual(failure);
  });

  it("forwards the correct email and password to the server action", async () => {
    mockSignIn.mockResolvedValue({ success: false });
    const { result } = renderAuth();
    await act(async () => {
      await result.current.signIn("alice@example.com", "s3cr3t!");
    });
    expect(mockSignIn).toHaveBeenCalledWith("alice@example.com", "s3cr3t!");
  });
});

// ---------------------------------------------------------------------------
// signIn — post sign-in navigation with anon work
// ---------------------------------------------------------------------------

describe("signIn — post sign-in with anonymous work", () => {
  it("creates a project with anon messages and redirects to it", async () => {
    mockSignIn.mockResolvedValue({ success: true });
    mockGetAnonWorkData.mockReturnValue({
      messages: [{ role: "user", content: "hello" }],
      fileSystemData: { "/": {} },
    });
    mockCreateProject.mockResolvedValue({ id: "anon-proj-42" });

    const { result } = renderAuth();
    await act(async () => {
      await result.current.signIn("user@test.com", "pw");
    });

    expect(mockCreateProject).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [{ role: "user", content: "hello" }],
        data: { "/": {} },
      })
    );
    expect(mockClearAnonWork).toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith("/anon-proj-42");
  });

  it("does not call getProjects when anon work exists", async () => {
    mockSignIn.mockResolvedValue({ success: true });
    mockGetAnonWorkData.mockReturnValue({
      messages: [{ role: "user", content: "hi" }],
      fileSystemData: {},
    });
    mockCreateProject.mockResolvedValue({ id: "p1" });

    const { result } = renderAuth();
    await act(async () => {
      await result.current.signIn("u@t.com", "pw");
    });

    expect(mockGetProjects).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// signIn — post sign-in navigation without anon work
// ---------------------------------------------------------------------------

describe("signIn — post sign-in without anonymous work", () => {
  it("redirects to the most recent project when one exists", async () => {
    mockSignIn.mockResolvedValue({ success: true });
    mockGetAnonWorkData.mockReturnValue(null);
    mockGetProjects.mockResolvedValue([
      { id: "proj-99", name: "My Project" },
      { id: "proj-1", name: "Old Project" },
    ]);

    const { result } = renderAuth();
    await act(async () => {
      await result.current.signIn("u@t.com", "pw");
    });

    expect(mockPush).toHaveBeenCalledWith("/proj-99");
    expect(mockCreateProject).not.toHaveBeenCalled();
  });

  it("creates a new project and redirects when no projects exist", async () => {
    mockSignIn.mockResolvedValue({ success: true });
    mockGetAnonWorkData.mockReturnValue(null);
    mockGetProjects.mockResolvedValue([]);
    mockCreateProject.mockResolvedValue({ id: "fresh-proj" });

    const { result } = renderAuth();
    await act(async () => {
      await result.current.signIn("u@t.com", "pw");
    });

    expect(mockCreateProject).toHaveBeenCalledWith(
      expect.objectContaining({ messages: [], data: {} })
    );
    expect(mockPush).toHaveBeenCalledWith("/fresh-proj");
  });

  it("treats anon work with empty messages the same as no anon work", async () => {
    mockSignIn.mockResolvedValue({ success: true });
    // Has anon data object but messages is empty
    mockGetAnonWorkData.mockReturnValue({ messages: [], fileSystemData: {} });
    mockGetProjects.mockResolvedValue([{ id: "existing-proj" }]);

    const { result } = renderAuth();
    await act(async () => {
      await result.current.signIn("u@t.com", "pw");
    });

    // Should fall through to getProjects path
    expect(mockGetProjects).toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith("/existing-proj");
  });

  it("does not navigate at all when sign in fails", async () => {
    mockSignIn.mockResolvedValue({ success: false, error: "bad creds" });

    const { result } = renderAuth();
    await act(async () => {
      await result.current.signIn("u@t.com", "pw");
    });

    expect(mockPush).not.toHaveBeenCalled();
    expect(mockGetProjects).not.toHaveBeenCalled();
    expect(mockCreateProject).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// signUp — loading state
// ---------------------------------------------------------------------------

describe("signUp — loading state", () => {
  it("sets isLoading to true while the action is in flight", async () => {
    let resolveSignUp!: (v: { success: boolean }) => void;
    mockSignUp.mockReturnValue(
      new Promise((res) => {
        resolveSignUp = res;
      })
    );

    const { result } = renderAuth();
    act(() => {
      result.current.signUp("user@test.com", "password");
    });
    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      resolveSignUp({ success: false });
    });
    expect(result.current.isLoading).toBe(false);
  });

  it("resets isLoading to false after success", async () => {
    mockSignUp.mockResolvedValue({ success: true });
    const { result } = renderAuth();
    await act(async () => {
      await result.current.signUp("u@t.com", "pw");
    });
    expect(result.current.isLoading).toBe(false);
  });

  it("resets isLoading to false after failure", async () => {
    mockSignUp.mockResolvedValue({ success: false, error: "already exists" });
    const { result } = renderAuth();
    await act(async () => {
      await result.current.signUp("u@t.com", "pw");
    });
    expect(result.current.isLoading).toBe(false);
  });

  it("resets isLoading to false even when the action throws", async () => {
    mockSignUp.mockRejectedValue(new Error("server error"));
    const { result } = renderAuth();
    await act(async () => {
      await result.current.signUp("u@t.com", "pw").catch(() => {});
    });
    expect(result.current.isLoading).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// signUp — return value
// ---------------------------------------------------------------------------

describe("signUp — return value", () => {
  it("returns the AuthResult from the server action on success", async () => {
    mockSignUp.mockResolvedValue({ success: true });
    const { result } = renderAuth();
    let returnValue: unknown;
    await act(async () => {
      returnValue = await result.current.signUp("new@user.com", "pass1234");
    });
    expect(returnValue).toEqual({ success: true });
  });

  it("returns the AuthResult from the server action on failure", async () => {
    const failure = { success: false, error: "Email already registered" };
    mockSignUp.mockResolvedValue(failure);
    const { result } = renderAuth();
    let returnValue: unknown;
    await act(async () => {
      returnValue = await result.current.signUp("existing@user.com", "pw");
    });
    expect(returnValue).toEqual(failure);
  });

  it("forwards the correct email and password to the server action", async () => {
    mockSignUp.mockResolvedValue({ success: false });
    const { result } = renderAuth();
    await act(async () => {
      await result.current.signUp("bob@example.com", "myp@ss!");
    });
    expect(mockSignUp).toHaveBeenCalledWith("bob@example.com", "myp@ss!");
  });
});

// ---------------------------------------------------------------------------
// signUp — post sign-up navigation
// ---------------------------------------------------------------------------

describe("signUp — post sign-up navigation", () => {
  it("creates a project with anon work and redirects on success", async () => {
    mockSignUp.mockResolvedValue({ success: true });
    mockGetAnonWorkData.mockReturnValue({
      messages: [{ role: "user", content: "build me a button" }],
      fileSystemData: { "/App.tsx": "code" },
    });
    mockCreateProject.mockResolvedValue({ id: "signup-proj" });

    const { result } = renderAuth();
    await act(async () => {
      await result.current.signUp("new@user.com", "password");
    });

    expect(mockCreateProject).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [{ role: "user", content: "build me a button" }],
      })
    );
    expect(mockClearAnonWork).toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith("/signup-proj");
  });

  it("redirects to existing project when no anon work", async () => {
    mockSignUp.mockResolvedValue({ success: true });
    mockGetAnonWorkData.mockReturnValue(null);
    mockGetProjects.mockResolvedValue([{ id: "old-proj" }]);

    const { result } = renderAuth();
    await act(async () => {
      await result.current.signUp("u@t.com", "pw");
    });

    expect(mockPush).toHaveBeenCalledWith("/old-proj");
  });

  it("creates a new project when sign up succeeds and no projects exist", async () => {
    mockSignUp.mockResolvedValue({ success: true });
    mockGetAnonWorkData.mockReturnValue(null);
    mockGetProjects.mockResolvedValue([]);
    mockCreateProject.mockResolvedValue({ id: "brand-new" });

    const { result } = renderAuth();
    await act(async () => {
      await result.current.signUp("u@t.com", "pw");
    });

    expect(mockPush).toHaveBeenCalledWith("/brand-new");
  });

  it("does not navigate when sign up fails", async () => {
    mockSignUp.mockResolvedValue({ success: false, error: "Email already registered" });

    const { result } = renderAuth();
    await act(async () => {
      await result.current.signUp("u@t.com", "pw");
    });

    expect(mockPush).not.toHaveBeenCalled();
    expect(mockGetProjects).not.toHaveBeenCalled();
    expect(mockCreateProject).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// new project name format
// ---------------------------------------------------------------------------

describe("new project naming", () => {
  it("includes a time string in the anon-work project name", async () => {
    mockSignIn.mockResolvedValue({ success: true });
    mockGetAnonWorkData.mockReturnValue({
      messages: [{ role: "user", content: "hi" }],
      fileSystemData: {},
    });
    mockCreateProject.mockResolvedValue({ id: "p" });

    const { result } = renderAuth();
    await act(async () => {
      await result.current.signIn("u@t.com", "pw");
    });

    const nameArg = mockCreateProject.mock.calls[0][0].name as string;
    expect(nameArg).toMatch(/^Design from /);
  });

  it("uses 'New Design #' prefix for a blank project name", async () => {
    mockSignIn.mockResolvedValue({ success: true });
    mockGetAnonWorkData.mockReturnValue(null);
    mockGetProjects.mockResolvedValue([]);
    mockCreateProject.mockResolvedValue({ id: "p" });

    const { result } = renderAuth();
    await act(async () => {
      await result.current.signIn("u@t.com", "pw");
    });

    const nameArg = mockCreateProject.mock.calls[0][0].name as string;
    expect(nameArg).toMatch(/^New Design #\d+$/);
  });
});
