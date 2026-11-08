"use client";

import { useRef, useState } from "react";

export function FileDrop({ file, onFile, disabled }: { file: File | null; onFile: (f: File | null) => void; disabled?: boolean }) {
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const accept = (f: File | undefined) => {
    if (f && f.type === "application/pdf") onFile(f);
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (!disabled) accept(e.dataTransfer.files?.[0]);
      }}
      className={`mb-5 rounded-2xl border-2 border-dashed p-6 text-center transition-colors ${over ? "border-brand bg-brand-mid" : "border-brand-mid bg-white"}`}
    >
      <input ref={inputRef} type="file" accept="application/pdf" className="sr-only" id="cv-file" disabled={disabled} onChange={(e) => accept(e.target.files?.[0])} />
      <svg viewBox="0 0 24 24" className="mx-auto mb-3 h-10 w-10 text-brand" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8zM14 3v5h5M12 17v-6m-3 3l3-3 3 3" />
      </svg>
      {file ? (
        <p className="text-lg font-bold break-all">
          {file.name} <span className="font-normal text-black/60">({Math.max(1, Math.round(file.size / 1024))} KB)</span>
        </p>
      ) : (
        <p className="text-lg font-bold">Drop your CV here</p>
      )}
      <p className="mt-1 text-base text-black/60">PDF files only</p>
      <label htmlFor="cv-file" className="mt-4 inline-block cursor-pointer rounded-lg bg-brand px-5 py-2.5 text-lg font-bold text-white transition-colors hover:bg-brand-deep">
        {file ? "Choose a different file" : "Choose a file"}
      </label>
    </div>
  );
}
