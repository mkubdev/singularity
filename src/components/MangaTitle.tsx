import { useEffect, useRef, useState, type CSSProperties } from "react"
import { cn } from "@/lib/utils"

/**
 * A heading revealed like the hero name (sumi brush laying a screentone, then the
 * solid letters), played once when it comes into view.
 */
export function MangaTitle({ text, className }: { text: string; className?: string }) {
  const ref = useRef<HTMLHeadingElement>(null)
  const [seen, setSeen] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setSeen(true)
          io.disconnect()
        }
      },
      { threshold: 0.6 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <h2 ref={ref} aria-label={text} className={cn("display", seen && "intro-manga", className)}>
      <span className="intro-word block" style={{ "--w": 0 } as CSSProperties} aria-hidden="true">
        {seen ? (
          <>
            <span className="ink-tone">{text}</span>
            <span className="ink-sharp">{text}</span>
          </>
        ) : (
          <span className="opacity-0">{text}</span>
        )}
      </span>
    </h2>
  )
}
