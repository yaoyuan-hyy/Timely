"use client";
import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { exportTimelyState, parseTimelyExport, mergeTimelyImport, MAX_BACKUP_BYTES } from "@/lib/data-export";
import type { TimelyState } from "@/lib/types";

export function DataTransfer({ state, setState }: { state: TimelyState; setState: Dispatch<SetStateAction<TimelyState>> }) {
  const [incoming, setIncoming] = useState<TimelyState | null>(null);
  const [notice, setNotice] = useState("");
  const preview = incoming ? mergeTimelyImport(state, incoming) : null;
  function download() {
    try {
      const url = URL.createObjectURL(new Blob([exportTimelyState(state)], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `timely-backup-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice("已生成备份，请保管好下载的文件。");
    } catch { setNotice("导出失败，请检查本地记录是否完整或超过 10 MB。"); }
  }
  return <section className="data-transfer" aria-label="本地备份">
    <h3>本地备份</h3>
    <p className="quiet-copy">记录仅保存在当前浏览器。备份包含日程（含已取消）和流水，不含聊天和未确认草稿。</p>
    <div className="record-actions">
      <button type="button" onClick={download}>导出备份</button>
      <label className="backup-file">选择备份文件<input type="file" accept=".json,application/json" aria-label="选择备份文件" onChange={async e => {
        const file = e.target.files?.[0];
        e.target.value = "";
        setIncoming(null);
        setNotice("");
        if (!file) return;
        try {
          if (file.size > MAX_BACKUP_BYTES) throw new Error("文件过大");
          setIncoming(parseTimelyExport(await file.text()));
        } catch { setNotice("无法导入：请使用有效的 Timely 备份文件（不超过 10 MB）。现有记录未改动。"); }
      }} /></label>
    </div>
    {preview && incoming && <div className="import-preview">
      <p>将新增 {preview.added} 条，跳过 {preview.skipped} 条重复记录。{preview.conflicts > 0 && `${preview.conflicts} 条编号冲突，保留当前版本。`}</p>
      <p className="quiet-copy">导入会合并记录，保留你目前的数据。</p>
      <div className="record-actions"><button type="button" onClick={() => {
        setState(current => mergeTimelyImport(current, incoming).state);
        setIncoming(null);
        setNotice("备份已合并，同编号记录保留当前版本。");
      }}>确认导入</button><button type="button" onClick={() => setIncoming(null)}>取消</button></div>
    </div>}
    {notice && <p role="status">{notice}</p>}
  </section>;
}
