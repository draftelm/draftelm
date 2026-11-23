"use client";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

export interface ProjectAction { title: string; description: string; confirmLabel?: string; run: () => void }
/** Native modal supplies keyboard containment, Escape and focus restoration. */
export default function ConfirmProjectAction({ action, onClose }: { action: ProjectAction; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const node = dialog.current; node?.showModal(); return () => node?.close(); }, []);
  return createPortal(<dialog ref={dialog} aria-labelledby="project-action-title" aria-describedby="project-action-description" onCancel={onClose} className="m-auto max-h-[85vh] w-[calc(100%_-_2rem)] max-w-lg overflow-auto rounded-2xl border border-white/20 bg-slate-900 p-6 text-white shadow-2xl backdrop:bg-slate-950/75">
    <h2 id="project-action-title" className="text-xl font-medium">{action.title}</h2>
    <p id="project-action-description" className="mt-3 whitespace-pre-line text-sm leading-relaxed text-slate-300">{action.description}</p>
    <div className="mt-6 flex flex-wrap gap-3"><button type="button" autoFocus className="rounded-lg border border-white/20 px-4 py-2 text-sm" onClick={onClose}>Keep current work</button><button type="button" className="rounded-lg bg-blue-600 px-4 py-2 text-sm" onClick={() => { action.run(); onClose(); }}>{action.confirmLabel ?? "Confirm replacement"}</button></div>
  </dialog>, document.body);
}
