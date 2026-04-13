import { test, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ToolInvocationBadge } from "../ToolInvocationBadge";
import type { ToolInvocation } from "ai";

afterEach(() => {
  cleanup();
});

function makeInvocation(
  toolName: string,
  args: Record<string, unknown>,
  state: "call" | "result" = "result"
): ToolInvocation {
  return {
    toolCallId: "test-id",
    toolName,
    args,
    state,
    ...(state === "result" ? { result: "ok" } : {}),
  } as ToolInvocation;
}

// str_replace_editor — create
test("shows 'Creating <file>' while in progress", () => {
  render(
    <ToolInvocationBadge
      toolInvocation={makeInvocation("str_replace_editor", { command: "create", path: "src/App.tsx" }, "call")}
    />
  );
  expect(screen.getByText("Creating App.tsx")).toBeDefined();
});

test("shows 'Created <file>' when done", () => {
  render(
    <ToolInvocationBadge
      toolInvocation={makeInvocation("str_replace_editor", { command: "create", path: "src/App.tsx" })}
    />
  );
  expect(screen.getByText("Created App.tsx")).toBeDefined();
});

// str_replace_editor — str_replace
test("shows 'Editing <file>' while in progress for str_replace", () => {
  render(
    <ToolInvocationBadge
      toolInvocation={makeInvocation("str_replace_editor", { command: "str_replace", path: "src/Button.tsx" }, "call")}
    />
  );
  expect(screen.getByText("Editing Button.tsx")).toBeDefined();
});

test("shows 'Edited <file>' when done for str_replace", () => {
  render(
    <ToolInvocationBadge
      toolInvocation={makeInvocation("str_replace_editor", { command: "str_replace", path: "src/Button.tsx" })}
    />
  );
  expect(screen.getByText("Edited Button.tsx")).toBeDefined();
});

// str_replace_editor — insert
test("shows 'Editing <file>' for insert command", () => {
  render(
    <ToolInvocationBadge
      toolInvocation={makeInvocation("str_replace_editor", { command: "insert", path: "src/Card.tsx" }, "call")}
    />
  );
  expect(screen.getByText("Editing Card.tsx")).toBeDefined();
});

// str_replace_editor — view
test("shows 'Reading <file>' for view command", () => {
  render(
    <ToolInvocationBadge
      toolInvocation={makeInvocation("str_replace_editor", { command: "view", path: "src/index.tsx" }, "call")}
    />
  );
  expect(screen.getByText("Reading index.tsx")).toBeDefined();
});

test("shows 'Read <file>' when view is done", () => {
  render(
    <ToolInvocationBadge
      toolInvocation={makeInvocation("str_replace_editor", { command: "view", path: "src/index.tsx" })}
    />
  );
  expect(screen.getByText("Read index.tsx")).toBeDefined();
});

// file_manager — delete
test("shows 'Deleting <file>' while in progress", () => {
  render(
    <ToolInvocationBadge
      toolInvocation={makeInvocation("file_manager", { command: "delete", path: "src/Old.tsx" }, "call")}
    />
  );
  expect(screen.getByText("Deleting Old.tsx")).toBeDefined();
});

test("shows 'Deleted <file>' when done", () => {
  render(
    <ToolInvocationBadge
      toolInvocation={makeInvocation("file_manager", { command: "delete", path: "src/Old.tsx" })}
    />
  );
  expect(screen.getByText("Deleted Old.tsx")).toBeDefined();
});

// file_manager — rename
test("shows 'Renaming <file>' while in progress", () => {
  render(
    <ToolInvocationBadge
      toolInvocation={makeInvocation("file_manager", { command: "rename", path: "src/Foo.tsx", new_path: "src/Bar.tsx" }, "call")}
    />
  );
  expect(screen.getByText("Renaming Foo.tsx")).toBeDefined();
});

test("shows 'Renamed <file> → <newFile>' when done", () => {
  render(
    <ToolInvocationBadge
      toolInvocation={makeInvocation("file_manager", { command: "rename", path: "src/Foo.tsx", new_path: "src/Bar.tsx" })}
    />
  );
  expect(screen.getByText("Renamed Foo.tsx → Bar.tsx")).toBeDefined();
});

// unknown tool falls back to tool name
test("falls back to tool name for unknown tools", () => {
  render(
    <ToolInvocationBadge
      toolInvocation={makeInvocation("some_other_tool", {})}
    />
  );
  expect(screen.getByText("some_other_tool")).toBeDefined();
});

// indicator icons
test("shows spinner when not done", () => {
  const { container } = render(
    <ToolInvocationBadge
      toolInvocation={makeInvocation("str_replace_editor", { command: "create", path: "src/App.tsx" }, "call")}
    />
  );
  expect(container.querySelector(".animate-spin")).toBeDefined();
});

test("shows green dot when done", () => {
  const { container } = render(
    <ToolInvocationBadge
      toolInvocation={makeInvocation("str_replace_editor", { command: "create", path: "src/App.tsx" })}
    />
  );
  expect(container.querySelector(".bg-emerald-500")).toBeDefined();
});
