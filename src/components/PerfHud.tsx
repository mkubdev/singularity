import { useEffect, useState, type RefObject } from "react"
import type { Singularity } from "@/gl/Singularity"

type Stats = ReturnType<Singularity["stats"]>

/** ?perf=1: live frame stats, to compare sections and settings on a real machine. */
export function PerfHud({ engineRef }: { engineRef: RefObject<Singularity | null> }) {
  const [s, setS] = useState<Stats | null>(null)
  useEffect(() => {
    const id = window.setInterval(() => engineRef.current && setS(engineRef.current.stats()), 500)
    return () => window.clearInterval(id)
  }, [engineRef])
  if (!s) return null
  return (
    <div className="fixed bottom-4 left-4 z-50 rounded-md bg-black/80 px-3 py-2 font-mono text-[11px] leading-relaxed text-white/90">
      <div>
        {s.idle ? (
          <span className="text-sky-300">repos · {s.fps} fps (plafond {s.idleCap})</span>
        ) : (
          <span className={s.fps < 50 ? "text-red-400" : "text-emerald-400"}>{s.fps} fps</span>
        )}{" "}
        · cpu {s.ms} ms
      </div>
      <div>raymarch {s.raymarch} (×{s.scale.toFixed(2)})</div>
      <div>
        composite {s.composite} (dpr {s.dpr})
      </div>
    </div>
  )
}
