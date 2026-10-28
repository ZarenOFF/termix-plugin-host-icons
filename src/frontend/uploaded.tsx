import { useRef, useState, type ReactNode } from "react";
import {
  usePermission,
  usePluginApi,
  useToast,
  useTranslation,
} from "@termix-ssh/plugin-sdk/frontend";
import { Button, Checkbox, Input, useConfirm } from "@termix-ssh/plugin-sdk/ui";
import { HostIcon } from "./HostIcon";
import { searchCustomIcons } from "./icons";
import {
  CUSTOM_PREFIX,
  MAX_NAME_LENGTH,
  MAX_PNG_FILE_BYTES,
  MAX_SVG_FILE_BYTES,
  library,
  refreshLibrary,
  useLibrary,
  type CustomIconDef,
  type CustomIconKind,
} from "./library";

/** Permission that lets a user add icons to the library. */
export const UPLOAD_PERMISSION = "upload";

/** A file the user picked, read and ready to send. */
export interface IconFile {
  kind: CustomIconKind;
  /** SVG markup, or a PNG as base64 without a "data:" prefix. */
  data: string;
  /** The file name without its extension. */
  name: string;
}

/** Why a file was not taken; each maps to a string under custom.errors. */
export class IconFileError extends Error {
  constructor(readonly reason: "type" | "tooBig" | "unreadable") {
    super(reason);
  }
}

function kindOf(file: File): CustomIconKind | null {
  const name = file.name.toLowerCase();
  if (name.endsWith(".svg") || file.type === "image/svg+xml") return "svg";
  if (name.endsWith(".png") || file.type === "image/png") return "png";
  return null;
}

function read(file: File, as: "text" | "dataUrl"): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new IconFileError("unreadable"));
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new IconFileError("unreadable"));
    if (as === "text") reader.readAsText(file);
    else reader.readAsDataURL(file);
  });
}

/**
 * Checks the type and size, then reads the file in the browser: SVG as text,
 * PNG as base64. The server checks everything again; this spares a request.
 */
export async function readIconFile(file: File): Promise<IconFile> {
  const kind = kindOf(file);
  if (!kind) throw new IconFileError("type");
  const limit = kind === "svg" ? MAX_SVG_FILE_BYTES : MAX_PNG_FILE_BYTES;
  if (file.size > limit) throw new IconFileError("tooBig");
  const name = file.name.replace(/\.[^.]*$/, "").trim();
  if (kind === "svg") {
    return { kind, data: await read(file, "text"), name };
  }
  const url = await read(file, "dataUrl");
  const comma = url.indexOf(",");
  return { kind, data: comma < 0 ? "" : url.slice(comma + 1), name };
}

/** The key under custom.errors for a failed request or an unusable file. */
export function errorKey(error: unknown): string {
  if (error instanceof IconFileError) return error.reason;
  const response = (
    error as {
      response?: { status?: number; data?: { error?: unknown } };
    } | null
  )?.response;
  const status = response?.status;
  const message =
    typeof response?.data?.error === "string" ? response.data.error : "";
  if (status === 403) return "forbidden";
  if (status === 404) return "notFound";
  if (status === 409) return "full";
  if (status === 413 || /too big/i.test(message)) return "tooBig";
  if (/name must be/i.test(message)) return "name";
  if (/pixels/i.test(message)) return "pixels";
  if (status === 400) return "invalid";
  return "failed";
}

const nameOk = (name: string) =>
  name.trim() !== "" && name.trim().length <= MAX_NAME_LENGTH;

const rawId = (icon: CustomIconDef) => icon.id.slice(CUSTOM_PREFIX.length);

interface Draft extends IconFile {
  tint: boolean;
}

/**
 * The Uploaded tab: the shared library, with an upload form for users who
 * may add to it, and a rename and delete list for the icons they may change.
 * The permission checks only hide controls; the server decides.
 */
export function UploadedPack({
  query,
  hideGrid,
  disabled,
  renderTile,
  onSelect,
}: {
  query: string;
  /** A search is showing results from every pack, so the grid is not ours. */
  hideGrid: boolean;
  disabled: boolean;
  renderTile: (icon: CustomIconDef) => ReactNode;
  /** Called with the id of an icon that was just uploaded. */
  onSelect: (id: string) => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const api = usePluginApi();
  const confirm = useConfirm();
  const canUpload = usePermission(UPLOAD_PERMISSION);
  const { icons, loaded } = useLibrary();
  const file = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [managing, setManaging] = useState(false);
  const [names, setNames] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const editable = icons.filter((icon) => icon.canEdit);
  const shown = searchCustomIcons(query, icons);
  const locked = disabled || busy;
  const fail = (error: unknown) =>
    toast.error(t(`custom.errors.${errorKey(error)}`));

  const choose = async (picked: File | undefined) => {
    if (!picked) return;
    try {
      const read = await readIconFile(picked);
      setDraft({ ...read, tint: read.kind === "svg" });
    } catch (error) {
      fail(error);
    }
  };

  const upload = async () => {
    if (!draft || !nameOk(draft.name)) return;
    setBusy(true);
    try {
      const { data } = await api.post<{ icon?: { id?: unknown } }>("icons", {
        name: draft.name.trim(),
        kind: draft.kind,
        data: draft.data,
        tint: draft.tint,
      });
      await refreshLibrary(api);
      toast.success(t("custom.uploaded"));
      setDraft(null);
      const id = data?.icon?.id;
      if (typeof id === "string" && library.get().byId.has(CUSTOM_PREFIX + id))
        onSelect(CUSTOM_PREFIX + id);
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  };

  const rename = async (icon: CustomIconDef) => {
    const name = (names[icon.id] ?? icon.name).trim();
    if (!nameOk(name) || name === icon.name) return;
    setBusy(true);
    try {
      await api.patch(`icons/${rawId(icon)}`, { name });
      await refreshLibrary(api);
      setNames(({ [icon.id]: _, ...rest }) => rest);
      toast.success(t("custom.renamed"));
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (icon: CustomIconDef) => {
    const ok = await confirm({
      title: t("custom.deleteTitle", { name: icon.name }),
      description: t("custom.deleteDescription"),
      confirmLabel: t("custom.deleteConfirm"),
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api.delete(`icons/${rawId(icon)}`);
      await refreshLibrary(api);
      toast.success(t("custom.deleted"));
    } catch (error) {
      fail(error);
      // It may be gone already, or no longer ours: show what is true.
      await refreshLibrary(api);
    } finally {
      setBusy(false);
    }
  };

  const preview: CustomIconDef | null = draft && {
    id: `${CUSTOM_PREFIX}draft`,
    custom: true,
    name: draft.name,
    kind: draft.kind,
    data: draft.data,
    tint: draft.tint,
    canEdit: true,
  };

  return (
    <div className="flex flex-col gap-2 min-w-0" data-testid="uploaded-pack">
      {(canUpload || editable.length > 0) && (
        <div className="flex items-center gap-2">
          {canUpload && (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={locked}
                onClick={() => file.current?.click()}
                className="h-7 px-2 text-xs"
              >
                {t("custom.upload")}
              </Button>
              <input
                ref={file}
                type="file"
                hidden
                accept=".svg,.png,image/svg+xml,image/png"
                aria-label={t("custom.fileLabel")}
                data-testid="upload-input"
                onChange={(event) => {
                  const picked = event.target.files?.[0];
                  // The same file can then be chosen again.
                  event.target.value = "";
                  void choose(picked);
                }}
              />
            </>
          )}
          {editable.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-pressed={managing}
              disabled={disabled}
              onClick={() => setManaging((on) => !on)}
              className="h-7 px-2 text-xs"
            >
              {managing ? t("custom.done") : t("custom.manage")}
            </Button>
          )}
        </div>
      )}
      {draft && preview && (
        <div
          data-testid="upload-draft"
          className="flex flex-col gap-2 border border-border p-2"
        >
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center size-9 shrink-0 border border-border">
              <HostIcon icon={preview} className="size-6" />
            </span>
            <Input
              value={draft.name}
              maxLength={MAX_NAME_LENGTH}
              onChange={(event) =>
                setDraft({ ...draft, name: event.target.value })
              }
              placeholder={t("custom.namePlaceholder")}
              aria-label={t("custom.nameLabel")}
              disabled={locked}
              className="h-8 text-xs"
            />
          </div>
          <div className="flex items-center gap-2 text-xs">
            <Checkbox
              checked={draft.tint}
              onCheckedChange={(checked) =>
                setDraft({ ...draft, tint: checked === true })
              }
              aria-label={t("custom.recolor")}
              disabled={locked}
            />
            <span>{t("custom.recolor")}</span>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {t("custom.recolorHint")}
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              disabled={locked || !nameOk(draft.name)}
              onClick={() => void upload()}
              className="h-7 px-2 text-xs"
            >
              {t("custom.add")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => setDraft(null)}
              className="h-7 px-2 text-xs"
            >
              {t("custom.cancel")}
            </Button>
          </div>
        </div>
      )}
      {managing && editable.length > 0 && (
        <ul data-testid="manage-list" className="flex flex-col gap-1">
          {editable.map((icon) => {
            const name = names[icon.id] ?? icon.name;
            return (
              <li key={icon.id} className="flex items-center gap-1.5 min-w-0">
                <span className="flex items-center justify-center size-8 shrink-0 border border-border">
                  <HostIcon icon={icon} className="size-4" />
                </span>
                <Input
                  value={name}
                  maxLength={MAX_NAME_LENGTH}
                  onChange={(event) =>
                    setNames({ ...names, [icon.id]: event.target.value })
                  }
                  aria-label={t("custom.renameLabel", { name: icon.name })}
                  disabled={locked}
                  className="h-8 text-xs min-w-0"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={t("custom.rename", { name: icon.name })}
                  disabled={
                    locked || !nameOk(name) || name.trim() === icon.name
                  }
                  onClick={() => void rename(icon)}
                  className="h-7 px-2 text-xs"
                >
                  {t("custom.save")}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={t("custom.delete", { name: icon.name })}
                  disabled={locked}
                  onClick={() => void remove(icon)}
                  className="h-7 px-2 text-xs text-destructive"
                >
                  {t("custom.deleteAction")}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      {!hideGrid &&
        (shown.length > 0 ? (
          <div className="grid grid-cols-8 gap-1.5">
            {shown.map(renderTile)}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            {!loaded || icons.length === 0
              ? t("custom.empty")
              : t("picker.empty")}
          </p>
        ))}
    </div>
  );
}
