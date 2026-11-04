import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Copy } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Toaster } from "@/components/ui/sonner"
import { Singularity, type Keyframe, type Pane } from "@/gl/Singularity"
import { site } from "@/content"
import { ServiceIndex } from "@/components/ServiceIndex"
import { NameIntro } from "@/components/NameIntro"
import { MangaTitle } from "@/components/MangaTitle"
import { Analytics } from "@vercel/analytics/react"
import { PerfHud } from "@/components/PerfHud"
import { Process, ribbonHead, ribbonPhase } from "@/components/Process"

// Camera / effect state per section, in page order.
const SCENES: Keyframe[] = [
  { dist: 26, elev: 0.12, azim: 0.0, fov: 1.0, lacquer: 0, glass: 0, gain: 1.0, tint: 0.0, lines: 0.55 },
  { dist: 15, elev: 0.34, azim: 0.5, fov: 0.95, lacquer: 0, glass: 0, gain: 1.05, tint: 0.0, lines: 0 },
  // Services: two keyframes (section start / end) so the lacquer holds for the whole pinned section,
  // with a slow orbit in between.
  { dist: 11, elev: 0.95, azim: 1.15, fov: 0.9, lacquer: 1, glass: 0, gain: 1.15, tint: 0.0, lines: 0 },
  { dist: 10, elev: 0.82, azim: 1.75, fov: 0.88, lacquer: 1, glass: 0, gain: 1.15, tint: 0.0, lines: 0 },
  // Breath between the red lacquer and the glass: the lacquer dissolves into black,
  // the singularity comes back alone, in silver.
  { dist: 9.5, elev: 0.55, azim: 1.95, fov: 0.9, lacquer: 0, glass: 0, gain: 0.85, tint: 0.0, lines: 0 },
  // Process (glass): start / end keyframes so the glass holds over the pinned section.
  { dist: 8.5, elev: 0.3, azim: 2.2, fov: 0.9, lacquer: 0, glass: 0.85, gain: 0.9, tint: 0.2, lines: 0 },
  { dist: 7.8, elev: 0.24, azim: 2.6, fov: 0.88, lacquer: 0, glass: 0.85, gain: 0.9, tint: 0.2, lines: 0 },
  // Approach: the iridescence fades, the camera dives toward the shadow.
  { dist: 6.6, elev: 0.28, azim: 2.85, fov: 0.74, lacquer: 0, glass: 0.25, gain: 0.7, tint: 0.0, lines: 0 },
  { dist: 5.6, elev: 0.32, azim: 3.0, fov: 0.62, lacquer: 0, glass: 0, gain: 0.5, tint: 0.0, lines: 0 },
]

const fmt = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const readoutRef = useRef<HTMLSpanElement>(null)
  const engineRef = useRef<Singularity | null>(null)

  const onProcess = useCallback((p: number, on: boolean, fade: number, vertical: boolean) => {
    engineRef.current?.setRibbon(on && fade > 0, ribbonHead(p), ribbonPhase(p), fade, vertical)
  }, [])
  const [perf] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).has("perf"))
  const onReach = useCallback((i: number) => engineRef.current?.boostNode(i), [])
  // Each change of active service cuts across the lacquer.
  const onService = useCallback((_: unknown, i: number) => engineRef.current?.cut(i), [])
  const [webgl, setWebgl] = useState(true)

  useEffect(() => {
    const canvas = canvasRef.current!
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    let engine: Singularity
    try {
      engine = new Singularity(
        canvas,
        ({ radius }) => {
          if (readoutRef.current) readoutRef.current.textContent = fmt.format(radius)
        },
        reduced,
      )
    } catch {
      setWebgl(false)
      document.documentElement.classList.add("no-webgl", "is-ready")
      return
    }

    if (import.meta.env.DEV) (window as unknown as { __engine: Singularity }).__engine = engine

    // The name entrance waits for a calm page: the scene has rendered its first frames
    // (shader compile + uploads done) and every font is in, the JP subset included.
    // Before that, the first frames are the heaviest of the visit and made it stutter.
    const html = document.documentElement
    window.scrollTo(0, 0)
    let sceneReady = false
    let fontsReady = false
    const markReady = () => {
      if (sceneReady && fontsReady) html.classList.add("is-ready")
    }
    engine.onReady = () => {
      sceneReady = true
      markReady()
    }
    Promise.all([
      document.fonts?.ready,
      document.fonts?.load('900 16px "Noto Serif JP"', "特"),
      document.fonts?.load('800 16px "Archivo Display"', "M"),
      // The brush mask must be decoded before the entrance, or the name would show
      // unmasked for a moment.
      (() => {
        const img = new Image()
        img.src = "/brush-mask.png"
        return img.decode()
      })(),
    ])
      .catch(() => {})
      .finally(() => {
        fontsReady = true
        markReady()
      })
    const readyFallback = window.setTimeout(() => html.classList.add("is-ready"), 2500)
    engineRef.current = engine

    // Every [data-glass] element is rendered as a liquid-glass pane by the shader.
    // data-glass is the tint (0 = clear, 1 = milky); data-frost diffuses what is behind
    // the pane (0 = sharp, 1 = fully frosted). Queried every frame so the panes always
    // match the live DOM (elements added, removed or restyled).
    const radii = new WeakMap<HTMLElement, number>()
    engine.setPanes(() =>
      [...document.querySelectorAll<HTMLElement>("[data-glass]")].map((el): Pane => {
        let radius = radii.get(el)
        if (radius === undefined) {
          radius = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0
          radii.set(el, radius)
        }
        const r = el.getBoundingClientRect()
        return {
          x: r.left,
          y: r.top,
          w: r.width,
          h: r.height,
          radius,
          tint: parseFloat(el.dataset.glass || "0") || 0,
          frost: parseFloat(el.dataset.frost || "0") || 0,
        }
      }),
    )

    const sections = [...document.querySelectorAll<HTMLElement>("[data-scene]")]
    const measure = () => {
      const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight)
      const anchors = sections.map((el, i) => {
        if (i === 0) return 0
        if (i === sections.length - 1) return 1
        const top = el.getBoundingClientRect().top + window.scrollY
        const mid = top + el.offsetHeight / 2 - window.innerHeight / 2
        return Math.min(1, Math.max(0, mid / max))
      })
      engine.setTimeline(anchors, SCENES)
      onScroll()
    }
    const onScroll = () => {
      const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight)
      engine.setProgress(window.scrollY / max)
    }

    measure()
    document.fonts?.ready.then(() => {
      measure()
    })
    // In-page links teleport instead of scrolling: the camera would otherwise fly
    // through every scene in between (ASCII, glass...) in a fraction of a second.
    const root = document.documentElement
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const link = (e.target as Element).closest<HTMLAnchorElement>('a[href^="#"]')
      const id = link?.getAttribute("href")?.slice(1)
      const target = id ? document.getElementById(id) : null
      if (!target) return
      e.preventDefault()
      root.classList.add("is-jumping")
      engine.jump(() => {
        const y = target.getBoundingClientRect().top + window.scrollY
        window.scrollTo({ top: id === "top" ? 0 : y, behavior: "instant" })
        onScroll()
        history.replaceState(null, "", id === "top" ? location.pathname : `#${id}`)
        target.focus({ preventScroll: true })
        requestAnimationFrame(() => root.classList.remove("is-jumping"))
      })
    }

    window.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("resize", measure)
    document.addEventListener("click", onClick)
    return () => {
      document.removeEventListener("click", onClick)
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", measure)
      window.clearTimeout(readyFallback)
      engineRef.current = null
      engine.dispose()
    }
  }, [])

  const copyEmail = async () => {
    try {
      await navigator.clipboard.writeText(site.email)
      toast.success("Adresse copiée")
    } catch {
      toast("Copie impossible, l'adresse est sélectionnable ci-dessus")
    }
  }

  return (
    <>
      <canvas ref={canvasRef} aria-hidden="true" className="fixed inset-0 -z-10 h-dvh w-full" />
      {!webgl && <div aria-hidden="true" className="fallback fixed inset-0 -z-10" />}

      <header className="pointer-events-none fixed inset-x-0 top-0 z-20 flex items-center justify-between px-5 py-4 md:px-10 md:py-6">
        <a
          href="#top"
          className="display text-halo pointer-events-auto text-xl text-foreground md:text-2xl"
          aria-label={`${site.firstName} ${site.lastName}, retour en haut`}
        >
          MK
        </a>
        <div className="pointer-events-auto flex items-center gap-5">
          <div className="text-halo hidden font-mono text-xs whitespace-nowrap text-muted-foreground tabular-nums sm:block" aria-hidden="true">
            r = <span ref={readoutRef} className="text-foreground">26,0</span> r<sub>s</sub>
          </div>
          <a href="#contact" className="glass-btn inline-flex h-10 items-center rounded-full px-5 text-sm font-medium text-foreground">
            Contact
          </a>
        </div>
      </header>

      <main id="top" tabIndex={-1} className="outline-none">
        <section data-scene className="hero relative grid h-dvh grid-rows-[1fr_auto] px-5 pt-20 pb-6 md:px-10 md:pb-10">
          <NameIntro first={site.firstName} last={site.lastName} />
          {/* 特異点: "singularity", written vertically like a signature on the edge. */}
          <span aria-hidden="true" className="tategaki">
            特異点
          </span>
          <div className="mt-6 flex flex-col gap-1 text-sm md:flex-row md:items-end md:justify-between">
            <div className="flex items-center gap-3">
              {/* 匠 (takumi): the master craftsman, a personal seal next to the role. */}
              <span aria-hidden="true" className="hanko hanko-sm">
                匠
              </span>
              <p className="max-w-sm text-balance font-medium text-foreground">
                {site.role}. {site.intro}
              </p>
            </div>
            <p className="text-muted-foreground">Faites défiler pour approcher</p>
          </div>
        </section>

        <section data-scene className="flex min-h-[110dvh] items-center px-5 md:px-10">
          <div className="scrim relative md:ml-[6vw]">
            <p className="display text-halo max-w-[14ch] text-[clamp(2.2rem,5.4vw,5.5rem)] text-balance">
              {site.manifesto.lead}
            </p>
            <p className="text-halo mt-8 max-w-[40ch] text-base leading-relaxed font-medium text-foreground/90 md:text-lg">
              {site.manifesto.body}
            </p>
          </div>
        </section>

        <ServiceIndex services={site.services} onActive={onService} />

        {/* Breath between the services and the process: no content, only the scene. */}
        <div data-scene aria-hidden="true" className="h-[90dvh]" />

        <Process
          title={site.approach.title}
          text={site.approach.text}
          steps={site.approach.steps}
          onProgress={onProcess}
          onReach={onReach}
        />

        {/* Approach: after « en ligne », the camera dives slowly toward the singularity. */}
        <div data-scene aria-hidden="true" className="h-[100dvh]" />

        <section id="contact" tabIndex={-1} data-scene className="relative outline-none flex min-h-dvh flex-col items-center justify-center px-5 text-center md:px-10">
          {/* 連絡: "contact", the vertical signature that answers 特異点 on the hero. */}
          <span aria-hidden="true" className="tategaki contact-sign">
            連絡
          </span>
          <MangaTitle text={site.contact.title} className="text-[clamp(2rem,4.4vw,4.2rem)]" />
          <p className="mt-3 max-w-[40ch] text-muted-foreground">{site.contact.text}</p>
          <a
            href={`mailto:${site.email}`}
            className="mt-10 text-[clamp(1.4rem,4.4vw,3.8rem)] leading-none font-semibold tracking-[-0.04em] break-all transition-opacity hover:opacity-70 sm:break-normal"
          >
            {site.email}
          </a>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button
              asChild
              variant="ghost"
              size="lg"
              className="glass-btn glass-btn-strong h-12 rounded-full px-7 text-foreground hover:bg-transparent dark:hover:bg-transparent"
            >
              <a href={`mailto:${site.email}`}>Écrire un e-mail</a>
            </Button>
            <Button
              variant="ghost"
              size="lg"
              className="glass-btn h-12 rounded-full px-6 text-foreground hover:bg-transparent dark:hover:bg-transparent"
              onClick={copyEmail}
            >
              <Copy className="size-4" />
              Copier l'adresse
            </Button>
          </div>
          <p className="mt-10 text-sm text-muted-foreground">
            Basé à {site.location.city}, {site.location.region}
          </p>
          {site.links.length > 0 && (
            <ul className="mt-4 flex gap-6 text-sm">
              {site.links.map((l) => (
                <li key={l.href}>
                  <a href={l.href} className="link-line" target="_blank" rel="noreferrer">
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      {/* Mobile: a floor of black under the footer, since the disk's bright band sits right behind it.
          Desktop: just the line itself, floating over the scene. */}
      <footer className="bg-gradient-to-t from-black via-black/85 to-transparent px-5 pt-14 md:bg-none md:px-10 md:pt-0">
        <div className="flex items-center justify-between border-t border-white/10 py-5 md:border-t-0 md:py-6 font-mono text-[11px] tracking-wide text-muted-foreground">
          <span>
            © {new Date().getFullYear()} {site.firstName} {site.lastName}
          </span>
          <a href="#top" className="transition-colors hover:text-foreground md:text-[var(--net)] md:hover:text-[#ff3c46]">
            Retour en haut ↑
          </a>
        </div>
      </footer>

      {perf && <PerfHud engineRef={engineRef} />}
      <Analytics />
      <Toaster position="bottom-center" />
    </>
  )
}
