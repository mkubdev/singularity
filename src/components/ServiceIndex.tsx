import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"

type Service = { title: string; text: string; kanji: string }

/**
 * Pinned services stage. The section is one viewport tall per service; its content
 * sticks to the screen while the scroll inside it selects the active service.
 * The active service is shown large, the others sit on a small rail.
 *
 * Two invisible [data-scene] markers (start / end) hold the camera in the 漆 lacquer
 * scene for the whole length of the section.
 */
export function ServiceIndex({ services, onActive }: { services: Service[]; onActive?: (s: Service, index: number) => void }) {
  const sectionRef = useRef<HTMLElement>(null)
  const [active, setActive] = useState(0)

  useEffect(() => {
    onActive?.(services[active], active)
  }, [active, services, onActive])

  useEffect(() => {
    let raf = 0
    const update = () => {
      raf = 0
      const el = sectionRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const span = Math.max(1, r.height - window.innerHeight)
      const p = Math.min(0.9999, Math.max(0, -r.top / span))
      setActive(Math.floor(p * services.length))
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
    }
  }, [services.length])

  // Rail click: scroll to the middle of that service's slice of the section.
  const goTo = (i: number) => {
    const el = sectionRef.current
    if (!el) return
    const top = el.getBoundingClientRect().top + window.scrollY
    const span = el.offsetHeight - window.innerHeight
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    window.scrollTo({ top: top + span * ((i + 0.5) / services.length), behavior: reduced ? "instant" : "smooth" })
  }

  const s = services[active]

  return (
    <section
      ref={sectionRef}
      aria-label="Ce que je fais"
      className="relative"
      style={{ height: `${services.length * 100 + 40}dvh` }}
    >
      {/* Every service, always in the markup (the stage only shows the active one). */}
      <ul className="sr-only">
        {services.map((x) => (
          <li key={x.title}>
            <h3>{x.title}</h3>
            <p>{x.text}</p>
          </li>
        ))}
      </ul>
      <div data-scene aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-dvh" />
      <div data-scene aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-dvh" />

      <div className="sticky top-0 flex h-dvh flex-col justify-center overflow-hidden px-5 md:px-10">
        <span key={`k${active}`} aria-hidden="true" className="kanji">
          {s.kanji}
        </span>
        <h2 className="absolute top-24 left-5 text-sm font-medium text-muted-foreground md:top-28 md:left-10">Ce que je fais</h2>

        <div className="grid items-end gap-10 md:grid-cols-[1fr_auto] md:gap-16">
          <div aria-live="polite">
            <ActiveService key={active} service={s} cut={active % 4} />
          </div>

          <ul className="text-halo flex flex-col gap-2 text-sm md:gap-3 md:text-right">
            {services.map((x, i) => (
              <li key={x.title}>
                <button
                  type="button"
                  onClick={() => goTo(i)}
                  aria-current={i === active ? "true" : undefined}
                  className={cn("rail-item font-medium transition-colors", i === active ? "text-foreground" : "text-foreground/40 hover:text-foreground/80")}
                >
                  {x.title}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}

/**
 * Remounted on every switch: the title is cut in half by a blade and slides back
 * together, along a different direction for each service (matches the shader slash).
 */
function ActiveService({ service, cut }: { service: Service; cut: number }) {
  return (
    <>
      <h3 className="display cut-in text-[clamp(2.4rem,8vw,9.5rem)]" data-text={service.title} data-cut={cut}>
        {service.title}
      </h3>
      <div className="mt-6 flex items-start gap-5 md:mt-8">
        <span aria-hidden="true" className="hanko">
          {service.kanji}
        </span>
        <p className="text-halo net-rule max-w-[46ch] text-base leading-relaxed font-medium text-foreground/90 md:text-xl">
          {service.text}
        </p>
      </div>
    </>
  )
}
