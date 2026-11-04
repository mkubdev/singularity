import { useEffect, useRef, useState, type CSSProperties } from "react"
import { cn } from "@/lib/utils"

type Step = { name: string; detail: string }

import { RIBBON_NODES, ribbonHead, ribbonPhase, ribbonY } from "@/gl/ribbon"

export { ribbonHead, ribbonPhase }

/**
 * "De l'idée à la mise en ligne": a pinned section where scrolling runs a signal
 * of light across the screen (drawn in the shader, in front of the iridescent glass).
 * Each node it reaches unlocks a step with a shockwave and an energy surge; the last
 * one is the only red on this screen.
 */
export function Process({
  title,
  text,
  steps,
  onProgress,
  onReach,
}: {
  title: string
  text: string
  steps: Step[]
  onProgress?: (p: number, on: boolean, fade: number) => void
  /** Called when scrolling forward brings the signal onto node `i`. */
  onReach?: (i: number) => void
}) {
  const ref = useRef<HTMLElement>(null)
  const [p, setP] = useState(0)
  const reached = useRef<number | null>(null)

  useEffect(() => {
    let raf = 0
    const update = () => {
      raf = 0
      const el = ref.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const span = Math.max(1, r.height - window.innerHeight)
      const v = Math.min(1, Math.max(0, -r.top / span))
      setP(v)
      // Once the pinned part is over, the section scrolls away: fade the signal out
      // within ~0.35 screen, before the "en ligne" label leaves the viewport.
      const exit = Math.max(0, -r.top - span) / (window.innerHeight * 0.35)
      onProgress?.(v, true, 1 - Math.min(1, exit))
      // Count the nodes behind the head; boost the newly reached ones (forward only).
      const head = ribbonHead(v)
      const count = RIBBON_NODES.filter((x) => head >= x).length
      if (reached.current !== null && count > reached.current) {
        for (let i = reached.current; i < count; i++) onReach?.(i)
      }
      reached.current = count
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update)
    }
    update()
    window.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("resize", onScroll)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", onScroll)
      onProgress?.(0, false, 0)
    }
  }, [onProgress, onReach])

  const head = ribbonHead(p)
  const phase = ribbonPhase(p)

  return (
    <section ref={ref} aria-label={title} className="relative" style={{ height: "320dvh" }}>
      <div data-scene aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-dvh" />
      <div data-scene aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-dvh" />

      <div className="sticky top-0 h-dvh overflow-hidden px-5 md:px-10">
        <div className="scrim absolute top-24 left-5 max-w-md md:top-28 md:left-10">
          <h2 className="display text-halo text-[clamp(1.5rem,3.4vw,3.4rem)] text-balance">{title}</h2>
          <p className="text-halo mt-4 max-w-[38ch] text-sm leading-relaxed font-medium text-foreground md:text-base">{text}</p>
        </div>

        <div aria-hidden="true" className="absolute inset-0">
          {steps.map((s, i) => {
            const x = RIBBON_NODES[i]
            const top = (1 - ribbonY(x, phase)) * 100
            const above = i % 2 === 0
            return (
              <div
                key={s.name}
                className={cn("proc-node", head >= x && "lit", above ? "above" : "below", i === steps.length - 1 && "last")}
                style={{ left: `${x * 100}%`, "--ny": `${top}%` } as CSSProperties}
              >
                <span className="proc-index">{`0x0${i + 1}`}</span>
                <span className="proc-node-name display">{s.name}</span>
                <span className="proc-detail">{s.detail}</span>
                {i === steps.length - 1 && <span className="live-badge">En ligne</span>}
              </div>
            )
          })}
        </div>

        <ol className="sr-only">
          {steps.map((s) => (
            <li key={s.name}>
              {s.name} : {s.detail}
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
