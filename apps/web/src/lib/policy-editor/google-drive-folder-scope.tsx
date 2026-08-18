"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Folder, Loader2, X } from "lucide-react";
import { Button } from "@onecli/ui/components/button";
import { Checkbox } from "@onecli/ui/components/checkbox";
import { googleDrive, type Connection } from "@/lib/api";
import { queryKeys } from "@/lib/api/keys";

interface Crumb {
  id: string;
  name: string;
}

const ROOT: Crumb = { id: "root", name: "My Drive" };

const emitPolicy = (
  ids: string[],
  onChange: (policy: Record<string, unknown> | null) => void,
) => {
  onChange(ids.length === 0 ? null : { driveFolders: ids });
};

export interface GoogleDriveFolderScopeProps {
  connection: Connection;
  policy: Record<string, unknown> | null;
  onChange: (policy: Record<string, unknown> | null) => void;
  readOnly?: boolean;
  orgPolicy?: Record<string, unknown> | null;
}

/** Live folder picker for ASHUB Google Drive grants. Empty selection = all folders. */
export const GoogleDriveFolderScope = ({
  connection,
  policy,
  onChange,
  readOnly = false,
}: GoogleDriveFolderScopeProps) => {
  const selectedIds = (policy?.driveFolders as string[] | undefined) ?? [];
  const [trail, setTrail] = useState<Crumb[]>([ROOT]);
  const [rememberedNames, setRememberedNames] = useState<Record<string, string>>(
    {},
  );
  const parentId = trail[trail.length - 1]?.id ?? ROOT.id;

  const listing = useQuery({
    queryKey: queryKeys.googleDrive.folders(connection.id, parentId),
    queryFn: () => googleDrive.folders(connection.id, parentId),
    enabled: !readOnly && connection.id.length > 0,
  });

  const names = useMemo(() => {
    const next = { ...rememberedNames };
    for (const crumb of trail) {
      next[crumb.id] = crumb.name;
    }
    for (const folder of listing.data ?? []) {
      next[folder.id] = folder.name;
    }
    return next;
  }, [listing.data, rememberedNames, trail]);

  const toggle = (id: string, name: string) => {
    setRememberedNames((prev) => ({ ...prev, [id]: name }));
    const next = selectedIds.includes(id)
      ? selectedIds.filter((existing) => existing !== id)
      : [...selectedIds, id];
    emitPolicy(next, onChange);
  };

  const remove = (id: string) => {
    emitPolicy(
      selectedIds.filter((existing) => existing !== id),
      onChange,
    );
  };

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Folders</p>
      <p className="text-muted-foreground text-xs">
        Limit this connection to specific Drive folders (including their
        contents). Leave empty for all folders the account can access.
      </p>

      {selectedIds.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {selectedIds.map((id) => (
            <li
              key={id}
              className="bg-muted flex items-center gap-1 rounded-md px-2 py-1 text-xs"
            >
              <Folder className="size-3 shrink-0" aria-hidden />
              <span className="max-w-48 truncate">{names[id] ?? id}</span>
              {readOnly ? null : (
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => remove(id)}
                  aria-label={`Remove ${names[id] ?? id}`}
                >
                  <X className="size-3" />
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-xs">All folders</p>
      )}

      {readOnly ? null : (
        <div className="rounded-md border">
          <nav
            className="flex flex-wrap items-center gap-1 border-b px-2 py-1.5 text-xs"
            aria-label="Folder path"
          >
            {trail.map((crumb, index) => (
              <span key={`${crumb.id}-${index}`} className="flex items-center">
                {index > 0 ? (
                  <ChevronRight
                    className="text-muted-foreground mx-0.5 size-3"
                    aria-hidden
                  />
                ) : null}
                <button
                  type="button"
                  className="hover:text-foreground text-muted-foreground hover:underline"
                  onClick={() => setTrail(trail.slice(0, index + 1))}
                >
                  {crumb.name}
                </button>
              </span>
            ))}
          </nav>
          <div className="max-h-56 overflow-y-auto">
            {listing.isPending ? (
              <div className="text-muted-foreground flex items-center gap-2 px-3 py-4 text-xs">
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
                Loading folders…
              </div>
            ) : listing.isError ? (
              <p className="text-destructive px-3 py-3 text-xs">
                Couldn&apos;t load folders. Confirm the connection is active
                and has Drive access.
              </p>
            ) : (listing.data ?? []).length === 0 ? (
              <p className="text-muted-foreground px-3 py-3 text-xs">
                No folders here.
              </p>
            ) : (
              <ul>
                {(listing.data ?? []).map((folder) => (
                  <li
                    key={folder.id}
                    className="hover:bg-muted/50 flex items-center gap-2 px-2 py-1.5"
                  >
                    <Checkbox
                      checked={selectedIds.includes(folder.id)}
                      onCheckedChange={() => toggle(folder.id, folder.name)}
                      aria-label={`Limit to ${folder.name}`}
                    />
                    <Folder
                      className="text-muted-foreground size-3.5 shrink-0"
                      aria-hidden
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-auto min-w-0 flex-1 justify-start px-1 py-0.5 text-xs font-normal"
                      onClick={() =>
                        setTrail((current) => [
                          ...current,
                          { id: folder.id, name: folder.name },
                        ])
                      }
                    >
                      <span className="truncate">{folder.name}</span>
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
