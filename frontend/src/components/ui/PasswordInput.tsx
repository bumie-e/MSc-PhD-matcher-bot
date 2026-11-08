"use client";

import { useState } from "react";

// A password field with a show/hide button. Pass the same props you would give an <input>.
export function PasswordInput({ className = "", ...props }: Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <input {...props} type={shown ? "text" : "password"} className={`${className} pr-14`} />
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        aria-label={shown ? "Hide password" : "Show password"}
        aria-pressed={shown}
        className="absolute right-1 top-0 flex h-[3.375rem] w-12 items-center justify-center rounded-lg text-black/60 transition-colors hover:text-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
      >
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {shown ? (
            <>
              <path d="M3 3l18 18" />
              <path d="M10.6 6.1A9.8 9.8 0 0112 6c5 0 8.5 4 9.5 6a14 14 0 01-3 3.7M6.6 6.7C4.4 8.2 2.9 10.4 2.5 12c1 2 4.5 6 9.5 6 1.5 0 2.8-.4 4-.9" />
              <path d="M9.9 9.9a3 3 0 004.2 4.2" />
            </>
          ) : (
            <>
              <path d="M2.5 12C3.5 10 7 6 12 6s8.5 4 9.5 6c-1 2-4.5 6-9.5 6s-8.5-4-9.5-6z" />
              <circle cx="12" cy="12" r="3" />
            </>
          )}
        </svg>
      </button>
    </div>
  );
}
