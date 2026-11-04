import type { CSSProperties } from "react"

/**
 * Hero name entrance, black & white, manga print style: a sumi brush stroke lays each
 * word down as a screentone, a second pass fills the letters solid, then a diagonal
 * hatch bar and a barcode stamp the lockup.
 */
export function NameIntro({ first, last }: { first: string; last: string }) {
  const word = (text: string, wordIndex: number, className?: string) => (
    <span className={`intro-word block ${className ?? ""}`} style={{ "--w": wordIndex } as CSSProperties} aria-hidden="true">
      <span className="ink-tone">{text}</span>
      <span className="ink-sharp">{text}</span>
      {wordIndex === 0 && <span className="manga-hatch" />}
      {wordIndex === 1 && <span className="manga-code" />}
    </span>
  )

  return (
    <h1
      aria-label={`${first} ${last}`}
      className="display hero-name intro-manga pointer-events-none flex h-full flex-col justify-between"
    >
      {word(first, 0)}
      {word(last, 1, "self-end")}
    </h1>
  )
}
