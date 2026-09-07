"use client";

import type { ReactNode } from "react";
import type { AppView } from "@/lib/types";

const viewLabels: Record<AppView, string> = {
  chat: "对话",
  calendar: "日历",
  ledger: "流水",
  settings: "设置"
};

export function NavButton({
  icon,
  view,
  activeView,
  onClick
}: {
  icon: ReactNode;
  view: AppView;
  activeView: AppView;
  onClick: (view: AppView) => void;
}) {
  const isActive = view === activeView;

  return (
    <button className={`nav-button ${isActive ? "active" : ""}`} aria-current={isActive ? "page" : undefined} type="button" onClick={() => onClick(view)}>
      {icon}
      <span>{viewLabels[view]}</span>
    </button>
  );
}
