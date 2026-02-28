export const EmptyState = ({ title, hint }: { title: string; hint?: string }) => (
  <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
    <h3 className="text-base font-semibold text-slate-900">{title}</h3>
    {hint ? <p className="mt-2 text-sm text-slate-500">{hint}</p> : null}
  </div>
);
