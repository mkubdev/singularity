import { StrictMode } from "react"
import { renderToString } from "react-dom/server"
import App from "./App"
export { site } from "./content"

/** Static HTML of the page, rendered at build time (see scripts/prerender.mjs). */
export function render() {
  return renderToString(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
