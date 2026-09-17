import React, { useState, useRef, useEffect, useId } from "react";
import { LucideIcon } from "lucide-react";

export interface DropdownItem {
  id: string;
  label: React.ReactNode;
  icon?: LucideIcon;
  onClick: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

export interface DropdownProps {
  trigger: React.ReactNode;
  items: DropdownItem[];
  align?: "start" | "end";
  className?: string;
}

export function Dropdown({
  trigger,
  items,
  align = "end",
  className = ""
}: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const menuId = useId();

  // Reset itemRefs length
  itemRefs.current = items.map((_, i) => itemRefs.current[i] || null);

  // Click away & Escape & Arrow Key handlers
  useEffect(() => {
    if (!isOpen) {
      setFocusedIndex(-1);
      return;
    }

    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    const enabledIndices = items
      .map((item, idx) => (item.disabled ? null : idx))
      .filter((idx): idx is number => idx !== null);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
        triggerRef.current?.focus();
        return;
      }

      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (enabledIndices.length === 0) return;
        const currentPos = enabledIndices.indexOf(focusedIndex);
        const nextPos = currentPos < enabledIndices.length - 1 ? currentPos + 1 : 0;
        const targetIdx = enabledIndices[nextPos];
        setFocusedIndex(targetIdx);
        itemRefs.current[targetIdx]?.focus();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (enabledIndices.length === 0) return;
        const currentPos = enabledIndices.indexOf(focusedIndex);
        const prevPos = currentPos > 0 ? currentPos - 1 : enabledIndices.length - 1;
        const targetIdx = enabledIndices[prevPos];
        setFocusedIndex(targetIdx);
        itemRefs.current[targetIdx]?.focus();
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, focusedIndex, items]);

  const toggleOpen = () => {
    setIsOpen(prev => {
      const next = !prev;
      if (next) {
        // Focus first enabled item upon opening
        const firstEnabled = items.findIndex(item => !item.disabled);
        if (firstEnabled !== -1) {
          setFocusedIndex(firstEnabled);
          setTimeout(() => itemRefs.current[firstEnabled]?.focus(), 10);
        }
      }
      return next;
    });
  };

  const handleTriggerKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
      e.preventDefault();
      toggleOpen();
    }
  };

  const alignStyles = align === "end" ? "right-0" : "left-0";

  return (
    <div ref={containerRef} className={`relative inline-block text-left font-sans ${className}`}>
      <div
        ref={triggerRef}
        role="button"
        tabIndex={0}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={isOpen ? menuId : undefined}
        onClick={toggleOpen}
        onKeyDown={handleTriggerKeyDown}
        className="cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-md inline-block"
      >
        {trigger}
      </div>

      {isOpen && (
        <div
          id={menuId}
          role="menu"
          tabIndex={-1}
          className={`absolute ${alignStyles} mt-1 w-48 bg-surface border border-divider rounded-lg shadow-lg z-50 p-1 animate-fade-in focus:outline-none`}
        >
          {items.map((item, idx) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                ref={el => { itemRefs.current[idx] = el; }}
                role="menuitem"
                tabIndex={focusedIndex === idx ? 0 : -1}
                disabled={item.disabled}
                onClick={() => {
                  if (item.disabled) return;
                  setIsOpen(false);
                  item.onClick();
                  triggerRef.current?.focus();
                }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-xs rounded-md font-medium transition-colors cursor-pointer select-none text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary disabled:opacity-50 disabled:cursor-not-allowed ${
                  item.destructive
                    ? "text-danger hover:bg-danger-surface focus:bg-danger-surface"
                    : "text-primary hover:bg-surface-subtle focus:bg-surface-subtle"
                }`}
              >
                {Icon && <Icon size={14} className="shrink-0" />}
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
