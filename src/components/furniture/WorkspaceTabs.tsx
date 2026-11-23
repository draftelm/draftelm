"use client";

/** Task navigation only. Panels remain owned by their parent, independent of tabs. */
export default function WorkspaceTabs<T extends string>({ id, label, value, items, onChange }: {
  id: string; label: string; value: T; items: readonly { id: T; label: string; hint?: string }[]; onChange: (value: T) => void;
}) {
  return <div role="tablist" aria-label={label} className="flex flex-wrap gap-2">
    {items.map((item, index) => <button key={item.id} type="button" role="tab" id={`${id}-tab-${item.id}`} aria-controls={`${id}-panel-${item.id}`} aria-selected={value === item.id} tabIndex={value === item.id ? 0 : -1}
      className={`min-w-0 flex-1 rounded-xl border px-4 py-3 text-left text-sm outline-offset-4 sm:flex-none ${value === item.id ? "border-blue-300/60 bg-blue-300/15 text-blue-100" : "border-white/10 text-slate-300 hover:bg-white/5"}`}
      onClick={() => onChange(item.id)} onKeyDown={event => {
        const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : event.key === "ArrowRight" ? (index + 1) % items.length : event.key === "ArrowLeft" ? (index + items.length - 1) % items.length : null;
        if (next === null) return;
        event.preventDefault(); onChange(items[next].id); document.getElementById(`${id}-tab-${items[next].id}`)?.focus();
      }}><span className="block font-medium">{item.label}</span>{item.hint && <span className="mt-1 hidden text-xs text-slate-400 sm:block">{item.hint}</span>}</button>)}
  </div>;
}
