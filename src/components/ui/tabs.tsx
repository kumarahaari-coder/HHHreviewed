import React, { useRef } from "react";

export interface TabItem {
  id: string;
  label: string;
  count?: number;
  disabled?: boolean;
}

export interface TabsProps {
  tabs: TabItem[];
  activeTab: string;
  onChange: (id: string) => void;
  variant?: "underline" | "segmented";
  className?: string;
}

export function Tabs({
  tabs,
  activeTab,
  onChange,
  variant = "underline",
  className = ""
}: TabsProps) {
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    const enabledIndices = tabs
      .map((t, idx) => (t.disabled ? null : idx))
      .filter((idx): idx is number => idx !== null);

    if (enabledIndices.length === 0) return;

    const currentPos = enabledIndices.indexOf(index);
    let targetIndex: number | null = null;

    if (e.key === "ArrowRight") {
      e.preventDefault();
      const nextPos = currentPos < enabledIndices.length - 1 ? currentPos + 1 : 0;
      targetIndex = enabledIndices[nextPos];
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      const prevPos = currentPos > 0 ? currentPos - 1 : enabledIndices.length - 1;
      targetIndex = enabledIndices[prevPos];
    } else if (e.key === "Home") {
      e.preventDefault();
      targetIndex = enabledIndices[0];
    } else if (e.key === "End") {
      e.preventDefault();
      targetIndex = enabledIndices[enabledIndices.length - 1];
    }

    if (targetIndex !== null) {
      const targetTab = tabs[targetIndex];
      onChange(targetTab.id);
      tabRefs.current[targetIndex]?.focus();
    }
  };

  if (variant === "segmented") {
    return (
      <div
        role="tablist"
        aria-orientation="horizontal"
        className={`inline-flex items-center p-1 bg-surface-muted rounded-md border border-divider-soft font-sans max-w-full overflow-x-auto ${className}`}
      >
        {tabs.map((tab, idx) => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              ref={el => { tabRefs.current[idx] = el; }}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls={`tabpanel-${tab.id}`}
              id={`tab-${tab.id}`}
              tabIndex={isActive ? 0 : -1}
              disabled={tab.disabled}
              onClick={() => onChange(tab.id)}
              onKeyDown={e => handleKeyDown(e, idx)}
              className={`px-3 py-1.5 rounded-sm text-xs font-medium transition-all duration-150 cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 disabled:cursor-not-allowed ${
                isActive
                  ? "bg-surface text-primary font-semibold shadow-xs"
                  : "text-secondary hover:text-primary hover:bg-surface-subtle"
              }`}
            >
              <div className="flex items-center gap-1.5">
                <span>{tab.label}</span>
                {tab.count !== undefined && (
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-medium tabular-nums ${
                      isActive ? "bg-primary/10 text-primary" : "bg-surface-subtle text-secondary"
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    );
  }

  // Underline variant (default)
  return (
    <div
      role="tablist"
      aria-orientation="horizontal"
      className={`border-b border-divider flex gap-4 sm:gap-6 font-sans max-w-full overflow-x-auto ${className}`}
    >
      {tabs.map((tab, idx) => {
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            ref={el => { tabRefs.current[idx] = el; }}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-controls={`tabpanel-${tab.id}`}
            id={`tab-${tab.id}`}
            tabIndex={isActive ? 0 : -1}
            disabled={tab.disabled}
            onClick={() => onChange(tab.id)}
            onKeyDown={e => handleKeyDown(e, idx)}
            className={`py-2.5 sm:py-3 px-1 border-b-2 font-medium text-xs transition-all duration-150 relative cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-t-xs disabled:opacity-50 disabled:cursor-not-allowed ${
              isActive
                ? "border-primary text-primary font-semibold"
                : "border-transparent text-secondary hover:text-primary hover:border-divider"
            }`}
          >
            <div className="flex items-center gap-1.5">
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-medium tabular-nums ${
                    isActive ? "bg-primary text-surface" : "bg-surface-muted text-secondary"
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
