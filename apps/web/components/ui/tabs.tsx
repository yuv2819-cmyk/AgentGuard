'use client';

import { cn } from '@/lib/cn';

interface TabItem {
  id: string;
  label: string;
}

interface TabsProps {
  items: TabItem[];
  active: string;
  onChange: (id: string) => void;
}

export const Tabs = ({ items, active, onChange }: TabsProps) => {
  return (
    <div className="inline-flex rounded-xl bg-slate-100 p-1">
      {items.map((item) => (
        <button
          key={item.id}
          className={cn(
            'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
            active === item.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900',
          )}
          onClick={() => onChange(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
};
