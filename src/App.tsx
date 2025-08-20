import React, { useCallback, useMemo, useRef, useState } from "react";

// Single-file MVP: drop into a Vite React project as src/App.tsx
// This uses the c2pa JS SDK via CDN to verify Content Credentials entirely in-browser.
// No backend required.

// Notes:
// - We load the SDK dynamically so you don’t need to configure wasm/worker hosting.
// - For production, pin a specific version and consider self-hosting assets per C2PA docs.

type Details = {
  title?: string;
  format?: string;
  claimGenerator?: string;
  producer?: string;
  signatureIssuer?: string;
  signatureDate?: string;
  hasAIFlag?: boolean;
  ingredients?: string;
  thumbnailUrl?: string;
};

type Status =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "real"; details: Details }
  | { kind: "ai"; details: Details }
  | { kind: "untrusted"; details: Details }
  | { kind: "notverifiable"; error?: string };

export default function App() {
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const inputRef = useRef<HTMLInputElement | null>(null);

  const version = useMemo(() => "0.24.2", []); // Pin SDK version (update as needed)

  const verifyFile = useCallback(
    async (file: File) => {
      setStatus({ kind: "checking" });

      try {
        const libraryUrl = `https://cdn.jsdelivr.net/npm/c2pa@${version}/+esm`;
        const { createC2pa, selectProducer } = await import(libraryUrl);

        const c2pa = await createC2pa({
          wasmSrc: `https://cdn.jsdelivr.net/npm/c2pa@${version}/dist/assets/wasm/toolkit_bg.wasm`,
          workerSrc: `https://cdn.jsdelivr.net/npm/c2pa@${version}/dist/c2pa.worker.min.js`,
        });

        // Create an object URL for the local file
        // NOTE: Pass the File directly to avoid HEAD on blob: URLs (Vite dev server issue)
        // const url = URL.createObjectURL(file);

        try {
          const { manifestStore, source } = await c2pa.read(file);

          console.log(manifestStore);

          // If no manifest store, there’s no C2PA data → Not verifiable
          if (!manifestStore || !manifestStore.activeManifest) {
            setStatus({ kind: "notverifiable" });
            return;
          }

          const active = manifestStore.activeManifest;

          // Thumbnail
          const thumb = source?.thumbnail?.getUrl?.();

          // Pull some commonly useful fields
          const details: Details = {
            title: active.title,
            format: active.format,
            claimGenerator: active.claimGenerator?.split("(")[0]?.trim(),
            producer: selectProducer?.(active)?.name ?? "Unknown",
            signatureIssuer: active.signatureInfo?.issuer,
            signatureDate: active.signatureInfo?.time ?? undefined,
            ingredients: (Array.isArray(active.ingredients)
              ? (active.ingredients as Array<{ title?: string }>)
              : []
            )
              .map((i) => i.title)
              .filter((t): t is string => typeof t === "string" && t.length > 0)
              .join(", "),
            thumbnailUrl: thumb?.url,
            // The presence / value of an AI flag is not yet standardized everywhere,
            // but if the manifest includes the C2PA "Generated with AI" assertion,
            // many producers set it in the active manifest assertions. We check common places.
            hasAIFlag: !!(
              active.assertions &&
              JSON.stringify(active.assertions).toLowerCase().includes("ai")
            ),
          };

          console.log(details);

          // Determine trust posture
          // If there were validation errors recorded by the SDK, treat as untrusted
          const hasValidationErrors =
            (manifestStore.validationStatus ?? []).length > 0;
          if (hasValidationErrors) {
            setStatus({ kind: "untrusted", details });
            return;
          }

          // If AI flag is present, report distinctly
          if (details.hasAIFlag) {
            setStatus({ kind: "ai", details });
            return;
          }

          // Otherwise we verified the manifest end-to-end
          setStatus({ kind: "real", details });
        } catch (readErr: unknown) {
          // Any failure to read/verify = Not verifiable
          const message =
            readErr instanceof Error ? readErr.message : String(readErr);
          setStatus({
            kind: "notverifiable",
            error: message,
          });
        }
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        setStatus({ kind: "notverifiable", error: message });
      }
    },
    [version]
  );

  const onFile = useCallback<React.ChangeEventHandler<HTMLInputElement>>(
    (e) => {
      const f = e.target.files?.[0];
      if (f) void verifyFile(f);
    },
    [verifyFile]
  );

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col items-center p-8 gap-6">
      <header className="max-w-3xl w-full text-center">
        <h1 className="text-3xl font-semibold">Real or Not (C2PA)</h1>
        <p className="text-neutral-400 mt-2">
          Client-only demo that checks for a valid C2PA/Content Credentials
          manifest. If it verifies, you&apos;ll see{" "}
          <span className="text-green-400 font-medium">Real</span>. Otherwise:{" "}
          <span className="text-yellow-400 font-medium">Not verifiable</span>.
        </p>
      </header>

      <div className="flex flex-col items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          onChange={onFile}
          className="block w-full text-sm text-neutral-300 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-medium file:bg-neutral-800 file:text-neutral-200 hover:file:bg-neutral-700"
        />
      </div>

      <Result status={status} />

      <footer className="mt-10 text-xs text-neutral-500">
        <p>
          Most images don&apos;t include Content Credentials. To test, try these
          images:{" "}
          <a
            href="https://spec.c2pa.org/public-testfiles/image/"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            https://spec.c2pa.org/public-testfiles/image/
          </a>
        </p>
        <p className="mt-4">
          This repo is open source:{" "}
          <a
            href="https://github.com/dhaiwat10/real-or-not"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            https://github.com/dhaiwat10/real-or-not
          </a>
        </p>
      </footer>
    </div>
  );
}

function Result({ status }: { status: Status }) {
  if (status.kind === "idle")
    return <p className="text-neutral-400">Choose an image to begin.</p>;
  if (status.kind === "checking")
    return <Badge color="bg-blue-500/20" dot="bg-blue-400" label="Checking…" />;

  if (status.kind === "notverifiable")
    return (
      <div className="max-w-2xl w-full rounded-2xl border border-neutral-800 p-5 bg-neutral-900/50">
        <Badge
          color="bg-yellow-500/20"
          dot="bg-yellow-400"
          label="Not verifiable"
        />
        {status.error && (
          <p className="text-xs text-neutral-500 mt-2">{status.error}</p>
        )}
        <p className="text-sm text-neutral-300 mt-3">
          Most images don&apos;t include Content Credentials. To test, try these
          images:{" "}
          <a
            href="https://spec.c2pa.org/public-testfiles/image/"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            https://spec.c2pa.org/public-testfiles/image/
          </a>
        </p>
      </div>
    );

  const title =
    status.kind === "real"
      ? "Real (provenance verified)"
      : status.kind === "ai"
      ? "Generated (per manifest)"
      : "Untrusted (validation warnings)";

  const tone =
    status.kind === "real"
      ? { color: "bg-green-500/20", dot: "bg-green-400" }
      : status.kind === "ai"
      ? { color: "bg-purple-500/20", dot: "bg-purple-400" }
      : { color: "bg-orange-500/20", dot: "bg-orange-400" };

  const details: Details | undefined =
    status.kind === "real" ||
    status.kind === "ai" ||
    status.kind === "untrusted"
      ? status.details
      : undefined;

  return (
    <div className="max-w-2xl w-full rounded-2xl border border-neutral-800 p-5 bg-neutral-900/50">
      <Badge color={tone.color} dot={tone.dot} label={title} />
      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
        {details?.thumbnailUrl && (
          <div className="col-span-1 md:col-span-2">
            <img
              src={details.thumbnailUrl}
              className="rounded-xl border border-neutral-800"
            />
          </div>
        )}
        <Field k="Title" v={details?.title} />
        <Field k="Format" v={details?.format} />
        <Field k="Producer" v={details?.producer} />
        <Field k="Claim generator" v={details?.claimGenerator} />
        <Field k="Signature issuer" v={details?.signatureIssuer} />
        <Field k="Signature date" v={details?.signatureDate} />
        <Field k="Ingredients" v={details?.ingredients} />
        <Field k="AI flag present" v={String(!!details?.hasAIFlag)} />
      </div>
    </div>
  );
}

function Badge({
  color,
  dot,
  label,
}: {
  color: string;
  dot: string;
  label: string;
}) {
  return (
    <div
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full ${color} ring-1 ring-inset ring-white/10`}
    >
      <span className={`inline-block w-2 h-2 rounded-full ${dot}`} />
      <span className="text-sm font-medium">{label}</span>
    </div>
  );
}

function Field({ k, v }: { k: string; v?: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-neutral-800/50 py-2">
      <span className="text-neutral-400">{k}</span>
      <span className="text-neutral-200 text-right break-all">{v ?? "—"}</span>
    </div>
  );
}
