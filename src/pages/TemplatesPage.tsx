import { useState } from "react";
import { useNavigate } from "react-router";
import { Check, LayoutTemplate, Sparkles } from "lucide-react";
import { TIER_PRESETS } from "../lib/presets";
import { useBoard } from "../store/board";
import { toast } from "../store/toast";
import { Button } from "../components/ui/button";
import { PresetSwitchDialog } from "../components/PresetSwitchDialog";

export function TemplatesPage() {
  const navigate = useNavigate();
  const [pending, setPending] = useState<string | null>(null);
  const activePresetId = useBoard(s => s.presetId);

  function use(id: string) {
    const s = useBoard.getState();
    if (s.tiers.some(t => t.items.length)) {
      setPending(id);
      return;
    }
    s.applyPreset(id);
    toast(`已应用「${TIER_PRESETS[id].name}」模板`);
    navigate("/");
  }

  return (
    <div className="mx-auto max-w-[1120px] px-5 pb-20 pt-10">
      <div className="mb-8 text-center">
        <h1 className="inline-flex items-center gap-2 text-2xl font-extrabold">
          <LayoutTemplate className="size-6 text-accent" /> 模板库
        </h1>
        <p className="mt-2 text-sm text-muted">选一套评级模式快速开工；应用后仍可在编辑器里自由改名、换色、增删档位。</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {Object.entries(TIER_PRESETS).map(([id, p]) => (
          <div key={id} className="rounded-2xl border border-line bg-panel p-5 shadow-[0_2px_12px_rgba(16,24,40,.06)]">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">{p.name}</h2>
              {activePresetId === id && (
                <span className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2.5 py-0.5 text-xs font-semibold text-accent">
                  <Check className="size-3.5" /> 使用中
                </span>
              )}
            </div>
            <div className="mt-3 flex flex-col gap-1.5">
              {p.tiers.map(([name, color]) => (
                <div key={name} className="flex items-center gap-2.5">
                  <span className="h-5 w-14 shrink-0 rounded" style={{ background: color }} />
                  <span className="text-sm text-ink/80">{name}</span>
                </div>
              ))}
            </div>
            <Button variant="primary" className="mt-4 w-full" onClick={() => use(id)}>
              使用该模式
            </Button>
          </div>
        ))}

        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line p-5 text-center text-muted">
          <Sparkles className="size-6" />
          <p className="mt-2 text-sm font-semibold">题材模板库</p>
          <p className="mt-1 text-xs">游戏强度榜 / 热梗榜 / 追剧榜等一键填充，开发中（见 ROADMAP.md）</p>
        </div>
      </div>

      <PresetSwitchDialog presetId={pending} onClose={() => setPending(null)} />
    </div>
  );
}
