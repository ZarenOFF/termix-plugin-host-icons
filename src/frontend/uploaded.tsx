import { useRef, useState, type ReactNode } from "react";
import {
  usePermission,
  usePluginApi,
  useToast,
  useTranslation,
} from "@termix-ssh/plugin-sdk/frontend";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  PluginIcon,
} from "@termix-ssh/plugin-sdk/ui";
import { HostIcon } from "./HostIcon";
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
/** Permission that lets a user change and delete anyone's icons. */
export const MANAGE_PERMISSION = "manage";

/** Past this many icons the Manage dialog offers a search. */
export const SEARCH_THRESHOLD = 8;

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

/**
 * The upload button and the form that names a picked file. Renders nothing
 * for a user who may not upload, unless it has `children` to show in the row
 * (the picker puts its Manage button there).
 */
function UploadForm({
  disabled,
  onUploaded,
  children,
}: {
  disabled: boolean;
  /** Called with the id of an icon that was just added to the library. */
  onUploaded?: (id: string) => void;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const api = usePluginApi();
  const canUpload = usePermission(UPLOAD_PERMISSION);
  const file = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<IconFile | null>(null);
  const [busy, setBusy] = useState(false);
  const locked = disabled || busy;

  const choose = async (picked: File | undefined) => {
    if (!picked) return;
    try {
      setDraft(await readIconFile(picked));
    } catch (error) {
      toast.error(t(`custom.errors.${errorKey(error)}`));
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
      });
      await refreshLibrary(api);
      toast.success(t("custom.uploaded"));
      setDraft(null);
      const id = data?.icon?.id;
      if (typeof id === "string" && library.get().byId.has(CUSTOM_PREFIX + id))
        onUploaded?.(CUSTOM_PREFIX + id);
    } catch (error) {
      toast.error(t(`custom.errors.${errorKey(error)}`));
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
    tint: false,
    canEdit: true,
  };

  if (!canUpload && !children) return null;

  return (
    <>
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
        {children}
      </div>
      {draft && preview && (
        <div
          data-testid="upload-draft"
          className="grid grid-cols-[2rem_minmax(0,1fr)_auto_auto] items-center gap-2 border border-border p-2 min-w-0"
        >
          <span className="flex items-center justify-center size-8 shrink-0 border border-border">
            <HostIcon icon={preview} className="size-4" />
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
            className="h-8 text-xs min-w-0"
          />
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
      )}
    </>
  );
}

/** One icon the caller may change: preview, rename and delete. */
function ManageRow({
  icon,
  busy,
  setBusy,
  draft,
  onDraft,
  invalid,
}: {
  icon: CustomIconDef;
  busy: boolean;
  setBusy: (busy: boolean) => void;
  /** The name being typed, or null while it is untouched. */
  draft: string | null;
  onDraft: (draft: string | null) => void;
  /** Marked after Done met a name that cannot be saved. */
  invalid: boolean;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const api = usePluginApi();
  const [confirming, setConfirming] = useState(false);
  const name = draft ?? icon.name;
  const fail = (error: unknown) =>
    toast.error(t(`custom.errors.${errorKey(error)}`));

  const rename = async () => {
    if (!nameOk(name) || name.trim() === icon.name) return;
    setBusy(true);
    try {
      await api.patch(`icons/${rawId(icon)}`, { name: name.trim() });
      await refreshLibrary(api);
      onDraft(null);
      toast.success(t("custom.renamed"));
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setConfirming(false);
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

  return (
    <li
      data-testid="manage-row"
      className="grid grid-cols-[2rem_minmax(0,1fr)_auto_auto] items-center gap-2 min-w-0"
    >
      <span className="flex items-center justify-center size-8 shrink-0 border border-border">
        <HostIcon icon={icon} className="size-4" />
      </span>
      <Input
        value={name}
        maxLength={MAX_NAME_LENGTH}
        onChange={(event) => onDraft(event.target.value)}
        aria-label={t("custom.renameLabel", { name: icon.name })}
        aria-invalid={invalid || undefined}
        disabled={busy}
        className={`h-8 text-xs min-w-0 ${invalid ? "border-destructive" : ""}`}
      />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label={t("custom.rename", { name: icon.name })}
        disabled={busy || !nameOk(name) || name.trim() === icon.name}
        onClick={() => void rename()}
        className="h-7 px-2 text-xs"
      >
        {t("custom.save")}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label={t("custom.delete", { name: icon.name })}
        disabled={busy}
        onClick={() => setConfirming(true)}
        className="h-7 px-2 text-xs text-destructive"
      >
        {t("custom.deleteAction")}
      </Button>
      {invalid && !nameOk(name) && (
        <p role="alert" className="col-span-full text-xs text-destructive">
          {t("custom.nameInvalid", { max: MAX_NAME_LENGTH })}
        </p>
      )}
      {/* The pane's own confirm sits under a modal dialog, so ask in a dialog. */}
      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent className="sm:max-w-sm" data-host-icons-dialog="">
          <DialogHeader>
            <DialogTitle>
              {t("custom.deleteTitle", { name: icon.name })}
            </DialogTitle>
            <DialogDescription>
              {t("custom.deleteDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirming(false)}
            >
              {t("custom.cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void remove()}
            >
              {t("custom.deleteConfirm")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </li>
  );
}

/**
 * The library's manager in its own dialog, stacked over whatever opened it
 * (the Change icon dialog keeps its picker state underneath): upload, a
 * search once the list is long, and rename and delete for the icons the
 * caller may change. Permission checks only hide controls; the server decides.
 */
export function ManageDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const api = usePluginApi();
  const { icons } = useLibrary();
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  // Names typed and not saved yet, by icon id, and the rows Done flagged.
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [flagged, setFlagged] = useState<string[]>([]);
  const editable = icons.filter((icon) => icon.canEdit);
  const searchable = editable.length > SEARCH_THRESHOLD;
  const needle = query.trim().toLowerCase();
  const shown =
    searchable && needle
      ? editable.filter((icon) => icon.name.toLowerCase().includes(needle))
      : editable;

  const setDraft = (id: string, draft: string | null) => {
    setDrafts((all) => {
      const rest = Object.fromEntries(
        Object.entries(all).filter(([other]) => other !== id),
      );
      return draft === null ? rest : { ...rest, [id]: draft };
    });
    setFlagged((ids) => ids.filter((other) => other !== id));
  };

  // Done, Escape and the close button all save the names that were edited.
  // A name that cannot be saved keeps the dialog open and is marked; so is a
  // row the server refused, and it keeps what was typed.
  const finish = async () => {
    if (busy) return;
    const changed = editable.filter((icon) => {
      const draft = drafts[icon.id];
      return draft !== undefined && draft.trim() !== icon.name;
    });
    const bad = changed.filter((icon) => !nameOk(drafts[icon.id]));
    if (bad.length > 0) {
      setFlagged(bad.map((icon) => icon.id));
      return;
    }
    if (changed.length === 0) {
      onClose();
      return;
    }
    setBusy(true);
    const failed: string[] = [];
    let lastError: unknown = null;
    for (const icon of changed) {
      try {
        await api.patch(`icons/${rawId(icon)}`, {
          name: drafts[icon.id].trim(),
        });
      } catch (error) {
        failed.push(icon.id);
        lastError = error;
      }
    }
    await refreshLibrary(api);
    setBusy(false);
    if (failed.length === 0) {
      toast.success(t("custom.renamed"));
      onClose();
      return;
    }
    toast.error(t(`custom.errors.${errorKey(lastError)}`));
    setDrafts((all) =>
      Object.fromEntries(
        Object.entries(all).filter(([id]) => failed.includes(id)),
      ),
    );
    setFlagged(failed);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) void finish();
      }}
    >
      <DialogContent
        className="sm:max-w-lg"
        data-host-icons-dialog=""
        data-testid="manage-dialog"
      >
        <DialogHeader>
          <DialogTitle>{t("custom.manageTitle")}</DialogTitle>
          <DialogDescription>{t("custom.manageDescription")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 min-w-0 p-1">
          <UploadForm disabled={busy} />
          {searchable && (
            <div data-host-icons-search>
              <PluginIcon name="Search" aria-hidden />
              <Input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("custom.search")}
                aria-label={t("custom.search")}
                className="h-8 text-xs"
              />
            </div>
          )}
          {shown.length > 0 ? (
            <ul
              data-testid="manage-list"
              className="flex flex-col gap-2 min-w-0 max-h-[45vh] overflow-y-auto"
            >
              {shown.map((icon) => (
                <ManageRow
                  key={icon.id}
                  icon={icon}
                  busy={busy}
                  setBusy={setBusy}
                  draft={drafts[icon.id] ?? null}
                  onDraft={(draft) => setDraft(icon.id, draft)}
                  invalid={flagged.includes(icon.id)}
                />
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">
              {editable.length > 0
                ? t("custom.noMatch")
                : t("custom.manageEmpty")}
            </p>
          )}
        </div>
        <div className="flex items-center justify-end border-t border-border pt-3">
          <Button type="button" disabled={busy} onClick={() => void finish()}>
            {t("custom.done")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The controls of the Uploaded filter: an upload form for users who may add
 * to the library, and a Manage button that opens the ManageDialog when they
 * may change some icon. The grid of icons is the picker's.
 */
export function UploadedControls({
  disabled,
  onSelect,
}: {
  disabled: boolean;
  /** Called with the id of an icon that was just uploaded. */
  onSelect: (id: string) => void;
}) {
  const { t } = useTranslation();
  const canUpload = usePermission(UPLOAD_PERMISSION);
  const { icons } = useLibrary();
  const [managing, setManaging] = useState(false);
  const canManage = icons.some((icon) => icon.canEdit);

  if (!canUpload && !canManage) return null;

  return (
    <div className="flex flex-col gap-2 min-w-0" data-testid="uploaded-pack">
      <UploadForm disabled={disabled} onUploaded={onSelect}>
        {canManage && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={() => setManaging(true)}
            className="h-7 px-2 text-xs"
          >
            {t("custom.manage")}
          </Button>
        )}
      </UploadForm>
      {managing && <ManageDialog open onClose={() => setManaging(false)} />}
    </div>
  );
}

/** Whether the user may open the manager from the settings page. */
export function useCanManageLibrary() {
  const upload = usePermission(UPLOAD_PERMISSION);
  const manage = usePermission(MANAGE_PERMISSION);
  return upload || manage;
}
