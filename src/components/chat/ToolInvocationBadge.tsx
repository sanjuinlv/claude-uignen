import { Loader2 } from "lucide-react";
import type { ToolInvocation } from "ai";

function getFileName(path: string | undefined): string | undefined {
  if (!path) return undefined;
  return path.split("/").pop();
}

function getLabel(toolName: string, args: Record<string, unknown>, done: boolean): string {
  const fileName = getFileName(args.path as string | undefined);
  const command = args.command as string | undefined;

  if (toolName === "str_replace_editor") {
    switch (command) {
      case "create":
        return done ? `Created ${fileName}` : `Creating ${fileName}`;
      case "str_replace":
      case "insert":
        return done ? `Edited ${fileName}` : `Editing ${fileName}`;
      case "view":
        return done ? `Read ${fileName}` : `Reading ${fileName}`;
    }
  }

  if (toolName === "file_manager") {
    const newFileName = getFileName(args.new_path as string | undefined);
    switch (command) {
      case "delete":
        return done ? `Deleted ${fileName}` : `Deleting ${fileName}`;
      case "rename":
        return done
          ? `Renamed ${fileName} → ${newFileName}`
          : `Renaming ${fileName}`;
    }
  }

  return toolName;
}

interface ToolInvocationBadgeProps {
  toolInvocation: ToolInvocation;
}

export function ToolInvocationBadge({ toolInvocation }: ToolInvocationBadgeProps) {
  const done = toolInvocation.state === "result";
  const label = getLabel(toolInvocation.toolName, toolInvocation.args ?? {}, done);

  return (
    <div className="inline-flex items-center gap-2 mt-2 px-3 py-1.5 bg-neutral-50 rounded-lg text-xs font-mono border border-neutral-200">
      {done ? (
        <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
      ) : (
        <Loader2 className="w-3 h-3 animate-spin text-blue-600 shrink-0" />
      )}
      <span className="text-neutral-700">{label}</span>
    </div>
  );
}
