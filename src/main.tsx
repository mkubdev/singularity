import { StrictMode } from "react"
import { createRoot, hydrateRoot } from "react-dom/client"
import "./index.css"
import App from "./App"

const root = document.getElementById("root")!
const app = (
  <StrictMode>
    <App />
  </StrictMode>
)

// The production build ships the page pre-rendered (readable without JavaScript, for
// search and AI crawlers); React then takes over that markup instead of redrawing it.
if (root.firstElementChild) hydrateRoot(root, app)
else createRoot(root).render(app)
