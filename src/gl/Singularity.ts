import * as THREE from "three"
import vert from "./shaders/fullscreen.vert?raw"
import sceneFrag from "./shaders/singularity.frag?raw"
import postFrag from "./shaders/post.frag?raw"
import particlesVert from "./shaders/particles.vert?raw"
import particlesFrag from "./shaders/particles.frag?raw"
import { RIBBON_NODES, ribbonY } from "./ribbon"

/** One camera / effect state, anchored to a section of the page. */
export type Keyframe = {
  dist: number
  elev: number
  azim: number
  fov: number
  /** 漆 lacquer scene weight (services). */
  lacquer: number
  glass: number
  gain: number
  tint: number
  /** Faint red security lines. */
  lines: number
}

export type Telemetry = { radius: number }

/** A liquid-glass pane in CSS pixels (viewport coordinates). */
export type Pane = { x: number; y: number; w: number; h: number; radius: number; tint: number; frost: number }

const MAX_PANES = 12

/** Slash directions (radians) for services 1..4: near-horizontal, rising, vertical, falling. */
const CUT_ANGLES = [-0.07, 0.62, Math.PI / 2, -0.62]

const KEYS = ["dist", "elev", "azim", "fov", "lacquer", "glass", "gain", "tint", "lines"] as const
const smooth = (t: number) => t * t * (3 - 2 * t)

export class Singularity {
  private renderer: THREE.WebGLRenderer
  private target: THREE.WebGLRenderTarget
  private sceneMat: THREE.ShaderMaterial
  private postMat: THREE.ShaderMaterial
  private sceneScene = new THREE.Scene()
  private postScene = new THREE.Scene()
  private cam = new THREE.Camera()
  private view = new THREE.PerspectiveCamera(60, 1, 0.1, 200)
  private particlesMat: THREE.ShaderMaterial
  private clock = new THREE.Clock()
  private raf = 0
  private time = 0
  private intro = 0

  private progress = 0
  private smoothProgress = 0
  private mouse = new THREE.Vector2()
  private smoothMouse = new THREE.Vector2()
  // Raymarch resolution relative to CSS pixels (not device pixels).
  private renderScale = 0.75
  private frameTimes: number[] = []
  // Composite pixel density cap; lowered at runtime if the GPU struggles.
  private maxDpr = 2
  // Rendered-frame stats for the ?perf overlay.
  private statFrames = 0
  private statStart = performance.now()
  private statMs = 0
  private lastStats = { fps: 0, ms: 0 }
  private idleNow = false
  // Rest-mode frame cap. Close to the singularity the slow drift (and the disk
  // particles sweeping past the lens) is visible, so it keeps 60 fps there.
  private idleCap = 30
  private lastActive = performance.now()
  private pending = 0

  private particleCount: number
  private keyframes: Keyframe[] = []
  private panes: () => Pane[] = () => []
  // Jump transition: 0 idle, 1 fading out, 2 fading in.
  private jumpPhase = 0
  private jumpT = 0
  private jumpApply: (() => void) | null = null
  // Blade cut envelope when the active service changes (1 -> 0).
  private cutT = 0
  // Process signal: time since each node was reached, global surge, orb travel phase.
  private nodeAge = [99, 99, 99, 99]
  private surge = 0
  private orbPhase = 0
  private jumpWarp = 0
  private ribbonHeadX = -1
  private ribbonPhaseV = 0
  private dpr = 1
  private anchors: number[] = []

  constructor(
    private canvas: HTMLCanvasElement,
    private onTelemetry: (t: Telemetry) => void,
    private reducedMotion: boolean,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: "high-performance" })
    this.renderer.setClearColor(0x000000, 1)

    this.target = new THREE.WebGLRenderTarget(4, 4, {
      type: THREE.HalfFloatType,
      generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
    })

    const quad = new THREE.PlaneGeometry(2, 2)

    this.sceneMat = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: sceneFrag,
      uniforms: {
        uRes: { value: new THREE.Vector2() },
        uTime: { value: 0 },
        uCamPos: { value: new THREE.Vector3() },
        uCamTarget: { value: new THREE.Vector3() },
        uFov: { value: 1 },
        uIntro: { value: 0 },
        uDiskGain: { value: 1 },
        uTint: { value: 0 },
      },
      depthTest: false,
      depthWrite: false,
    })

    this.postMat = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: postFrag,
      uniforms: {
        tScene: { value: this.target.texture },
        uRes: { value: new THREE.Vector2() },
        uTime: { value: 0 },
        uLacquer: { value: 0 },
        uGlass: { value: 0 },
        uFade: { value: 1 },
        uWarp: { value: 0 },
        uHole: { value: new THREE.Vector3() },
        uLines: { value: 0 },
        uRibbonOn: { value: 0 },
        uRibbonP: { value: 0 },
        uRibbonPhase: { value: 0 },
        uRibbonFade: { value: 1 },
        uNodeAge: { value: [99, 99, 99, 99] },
        uSurge: { value: 0 },
        uOrbPhase: { value: 0 },
        uHeadY: { value: 0.5 },
        uNodeY: { value: [0.5, 0.5, 0.5, 0.5] },
        uOrbs: { value: Array.from({ length: 5 }, () => new THREE.Vector3()) }, // x, y, life // singularity center (device px) + shadow radius
        uCut: { value: 0 },
        uCutAngle: { value: 0 },
        uCutPower: { value: 1 },
        uDpr: { value: 1 },
        uPaneRect: { value: Array.from({ length: MAX_PANES }, () => new THREE.Vector4()) },
        uPaneParam: { value: Array.from({ length: MAX_PANES }, () => new THREE.Vector4()) },
        uPaneCount: { value: 0 },
      },
      depthTest: false,
      depthWrite: false,
    })

    const backdrop = new THREE.Mesh(quad, this.sceneMat)
    backdrop.frustumCulled = false
    backdrop.renderOrder = 0
    this.sceneScene.add(backdrop)

    // Accretion particles share the raymarch camera so they sit inside the disk.
    const mobile = window.innerWidth < 768
    this.particleCount = mobile ? 35000 : 90000
    const orbit = new Float32Array(this.particleCount * 4)
    for (let i = 0; i < this.particleCount; i++) {
      const u = Math.random()
      orbit[i * 4] = 2.2 + Math.pow(u, 1.6) * 13.8
      orbit[i * 4 + 1] = Math.random() * Math.PI * 2
      orbit[i * 4 + 2] = (Math.random() + Math.random() + Math.random() - 1.5) * 1.2
      orbit[i * 4 + 3] = Math.random()
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(this.particleCount * 3), 3))
    geo.setAttribute("aOrbit", new THREE.BufferAttribute(orbit, 4))
    this.particlesMat = new THREE.ShaderMaterial({
      vertexShader: particlesVert,
      fragmentShader: particlesFrag,
      uniforms: {
        uTime: { value: 0 },
        uPixel: { value: 40 },
        uGain: { value: 1 },
        uTint: { value: 0 },
        uCamPos: { value: new THREE.Vector3() },
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
    })
    const points = new THREE.Points(geo, this.particlesMat)
    points.frustumCulled = false
    points.renderOrder = 1
    this.sceneScene.add(points)

    this.postScene.add(new THREE.Mesh(quad, this.postMat))

    this.renderScale = window.innerWidth < 768 ? 0.9 : 0.75

    this.resize()
    window.addEventListener("resize", this.resize)
    window.addEventListener("pointermove", this.onPointer)
    document.addEventListener("visibilitychange", this.onVisibility)
    this.start()
  }

  /** Bind keyframes to scroll positions (0..1) measured from the page sections. */
  setTimeline(anchors: number[], keyframes: Keyframe[]) {
    this.anchors = anchors
    this.keyframes = keyframes
    this.computeTangents()
  }

  /** Called every frame to read the glass panes' current on-screen geometry. */
  setPanes(provider: () => Pane[]) {
    this.panes = provider
  }

  private updatePanes() {
    const dpr = this.dpr
    const vh = window.innerHeight
    const rects = this.postMat.uniforms.uPaneRect.value as THREE.Vector4[]
    const params = this.postMat.uniforms.uPaneParam.value as THREE.Vector4[]
    let n = 0
    for (const p of this.panes()) {
      if (n >= MAX_PANES) break
      // Skip panes fully off screen (with margin for the contact shadow).
      if (p.y + p.h < -40 || p.y > vh + 40 || p.w <= 0) continue
      rects[n].set((p.x + p.w / 2) * dpr, (vh - p.y - p.h / 2) * dpr, (p.w / 2) * dpr, (p.h / 2) * dpr)
      params[n].set(Math.min(p.radius, p.w / 2, p.h / 2) * dpr, p.tint, p.frost, 0)
      n++
    }
    this.postMat.uniforms.uPaneCount.value = n
  }

  /**
   * Teleport to another part of the page without flying the camera through the
   * scenes in between: fade to black, run `apply` (which moves the page), snap the
   * camera to the new position, fade back in.
   */
  jump(apply: () => void) {
    this.lastActive = performance.now()
    if (this.reducedMotion) {
      apply()
      this.smoothProgress = this.progress
      return
    }
    if (this.jumpPhase === 1) {
      this.jumpApply = apply
      return
    }
    // Interrupting a fade-in resumes the fade-out from the current brightness.
    const from = this.jumpPhase === 2 ? 1 - this.jumpT : 0
    this.jumpApply = apply
    this.jumpPhase = 1
    this.jumpT = from
  }

  private stepJump(dt: number) {
    const pu = this.postMat.uniforms
    if (this.jumpPhase === 1) {
      this.jumpT = Math.min(1, this.jumpT + dt / 0.22)
      pu.uFade.value = 1 - smooth(this.jumpT)
      this.jumpWarp = smooth(this.jumpT)
      if (this.jumpT >= 1) {
        this.jumpApply?.()
        this.jumpApply = null
        this.smoothProgress = this.progress
        this.jumpPhase = 2
        this.jumpT = 0
      }
    } else if (this.jumpPhase === 2) {
      this.jumpT = Math.min(1, this.jumpT + dt / 0.38)
      pu.uFade.value = smooth(this.jumpT)
      this.jumpWarp = 1 - smooth(this.jumpT)
      if (this.jumpT >= 1) this.jumpPhase = 0
    }
  }

  /**
   * The active service changed: blade cut across the lacquer. Each service has its
   * own slash direction and the strength grows along the list, like a combo.
   */
  cut(index = 0) {
    const pu = this.postMat.uniforms
    pu.uCutAngle.value = CUT_ANGLES[index % CUT_ANGLES.length]
    pu.uCutPower.value = 1 + 0.15 * (index % CUT_ANGLES.length)
    this.cutT = this.reducedMotion ? 0 : 1
    this.lastActive = performance.now()
  }

  private stepCut(dt: number) {
    if (this.cutT <= 0 && this.postMat.uniforms.uCut.value === 0) return
    this.cutT = Math.max(0, this.cutT - dt / 0.45)
    this.postMat.uniforms.uCut.value = this.cutT
  }

  /** Light signal across the fluted glass: `head` is its tip (0..1 of the width), `phase` rolls the wave. */
  setRibbon(on: boolean, head: number, phase: number, fade = 1) {
    const pu = this.postMat.uniforms
    pu.uRibbonOn.value = on ? 1 : 0
    pu.uRibbonFade.value = fade
    pu.uRibbonP.value = head
    pu.uRibbonPhase.value = phase
    this.ribbonHeadX = head
    this.ribbonPhaseV = phase
    pu.uHeadY.value = ribbonY(head, phase)
    ;(pu.uNodeY.value as number[]).splice(0, 4, ...RIBBON_NODES.map((x) => ribbonY(x, phase)))
    this.lastActive = performance.now()
  }

  /** The signal reached node `i`: shockwave from the node and an energy surge. */
  boostNode(i: number) {
    if (i < 0 || i >= this.nodeAge.length) return
    this.nodeAge[i] = 0
    this.surge = 1
    this.lastActive = performance.now()
  }

  private stepSignal(dt: number) {
    for (let i = 0; i < this.nodeAge.length; i++) this.nodeAge[i] = Math.min(99, this.nodeAge[i] + dt)
    this.surge = Math.max(0, this.surge - dt / 1.1)
    // Orbs accelerate during a surge.
    this.orbPhase = (this.orbPhase + dt * 0.11 * (1 + 2.6 * this.surge)) % 1000
    const pu = this.postMat.uniforms
    ;(pu.uNodeAge.value as number[]).splice(0, 4, ...this.nodeAge)
    pu.uSurge.value = this.surge
    pu.uOrbPhase.value = this.orbPhase
    // Energy orbs, placed once per frame instead of per pixel.
    const head = this.ribbonHeadX
    const onScreen = Math.min(1, Math.max(0, (head - 0.02) / 0.1))
    ;(pu.uOrbs.value as THREE.Vector3[]).forEach((o, k) => {
      const t = (((this.orbPhase + k * 0.2) % 1) + 1) % 1
      const x = -0.04 + (head + 0.04) * t
      const life = Math.min(1, t / 0.12) * (1 - Math.min(1, Math.max(0, (t - 0.82) / 0.18))) * onScreen
      o.set(x, ribbonY(x, this.ribbonPhaseV), life)
    })
    // A faint chromatic kick at the start of a surge, on top of any jump tear.
    pu.uWarp.value = Math.max(this.jumpWarp, Math.pow(this.surge, 4) * 0.12)
  }

  setProgress(p: number) {
    this.progress = p
    this.lastActive = performance.now()
  }

  private onVisibility = () => {
    cancelAnimationFrame(this.raf)
    if (!document.hidden && this.started) {
      this.clock.getDelta()
      this.snapNext = true
      this.loop()
    }
  }

  private onPointer = (e: PointerEvent) => {
    this.mouse.set((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1)
    this.lastActive = performance.now()
  }

  private resize = () => {
    // The composite carries crisp UI (glass edges, ASCII) so it runs at native density
    // up to 2x; the expensive raymarch stays at CSS-pixel scale (soft by nature).
    const dpr = Math.min(window.devicePixelRatio, this.maxDpr)
    this.dpr = dpr
    const w = window.innerWidth
    const h = window.innerHeight
    this.renderer.setPixelRatio(dpr)
    this.renderer.setSize(w, h, false)
    const tw = Math.max(2, Math.floor(w * this.renderScale))
    const th = Math.max(2, Math.floor(h * this.renderScale))
    this.target.setSize(tw, th)
    this.sceneMat.uniforms.uRes.value.set(tw, th)
    this.postMat.uniforms.uRes.value.set(w * dpr, h * dpr)
    this.postMat.uniforms.uDpr.value = dpr
    this.view.aspect = w / h
    this.particlesMat.uniforms.uPixel.value = th * 0.05
  }

  /**
   * Camera / effects along the scroll: monotone cubic interpolation (Fritsch–Carlson)
   * through the keyframes. The motion keeps its speed across each keyframe instead of
   * stopping there (the old per-segment ease made the zoom stutter), and never
   * overshoots a keyframe value.
   */
  private sample(p: number): Keyframe {
    const a = this.anchors
    const k = this.keyframes
    if (k.length === 0) return { dist: 26, elev: 0.1, azim: 0, fov: 1, lacquer: 0, glass: 0, gain: 1, tint: 0, lines: 0 }
    if (p <= a[0]) return k[0]
    if (p >= a[a.length - 1]) return k[k.length - 1]
    let i = 0
    while (i < a.length - 2 && p > a[i + 1]) i++
    const h = Math.max(1e-5, a[i + 1] - a[i])
    const t = (p - a[i]) / h
    const t2 = t * t
    const t3 = t2 * t
    const h00 = 2 * t3 - 3 * t2 + 1
    const h10 = t3 - 2 * t2 + t
    const h01 = -2 * t3 + 3 * t2
    const h11 = t3 - t2
    const out = {} as Keyframe
    for (const key of KEYS) {
      const m = this.tangents[key]
      out[key] = h00 * k[i][key] + h10 * h * m[i] + h01 * k[i + 1][key] + h11 * h * m[i + 1]
    }
    return out
  }

  private tangents = {} as Record<keyof Keyframe, number[]>

  private computeTangents() {
    const a = this.anchors
    const k = this.keyframes
    const n = k.length
    for (const key of KEYS) {
      const y = k.map((f) => f[key])
      const d: number[] = []
      for (let i = 0; i < n - 1; i++) d.push((y[i + 1] - y[i]) / Math.max(1e-5, a[i + 1] - a[i]))
      const m = new Array(n).fill(0)
      for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] > 0 ? (d[i - 1] + d[i]) / 2 : 0
      // Start and end at rest.
      m[0] = 0
      m[n - 1] = 0
      // Fritsch–Carlson limiter: keeps each segment monotone (no overshoot).
      for (let i = 0; i < n - 1; i++) {
        if (d[i] === 0) {
          m[i] = 0
          m[i + 1] = 0
          continue
        }
        const al = m[i] / d[i]
        const be = m[i + 1] / d[i]
        const r = al * al + be * be
        if (r > 9) {
          const tau = 3 / Math.sqrt(r)
          m[i] = tau * al * d[i]
          m[i + 1] = tau * be * d[i]
        }
      }
      this.tangents[key] = m
    }
  }

  private adaptQuality(dt: number) {
    // Ignore the first seconds (font loading, texture uploads, the name entrance):
    // they say nothing about the machine and used to lock in a lower resolution.
    if (performance.now() - this.startAt < 3500) return
    this.frameTimes.push(dt)
    if (this.frameTimes.length < 90) return
    const avg = this.frameTimes.reduce((s, v) => s + v, 0) / this.frameTimes.length
    this.frameTimes = []
    if (avg <= 1 / 50) return
    // First the raymarch resolution, then the composite density (crisp UI last).
    if (this.renderScale > 0.45) {
      this.renderScale = Math.max(0.45, this.renderScale - 0.1)
      this.resize()
    } else if (this.maxDpr > 1.25 && window.devicePixelRatio > 1.25) {
      this.maxDpr = this.maxDpr > 1.5 ? 1.5 : 1.25
      this.resize()
    }
  }

  /** Live stats for the ?perf overlay. */
  stats() {
    return {
      ...this.lastStats,
      idle: this.idleNow,
      idleCap: this.idleCap,
      scale: this.renderScale,
      dpr: Math.min(window.devicePixelRatio, this.maxDpr),
      raymarch: `${this.target.width}×${this.target.height}`,
      composite: `${this.renderer.domElement.width}×${this.renderer.domElement.height}`,
    }
  }

  // Compile both programs off the main thread when the driver allows it
  // (KHR_parallel_shader_compile), so the first frame doesn't freeze the page.
  private started = false
  private snapNext = true
  private startAt = 0
  private start() {
    const go = () => {
      if (this.started || this.disposed) return
      this.started = true
      this.startAt = performance.now()
      this.clock.getDelta()
      this.loop()
    }
    Promise.all([
      this.renderer.compileAsync(this.sceneScene, this.view),
      this.renderer.compileAsync(this.postScene, this.cam),
    ]).then(go, go)
    // Never wait forever on a driver that doesn't report completion.
    window.setTimeout(go, 1500)
  }
  private disposed = false

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop)
    const gap = this.clock.getDelta()
    this.pending += gap
    // First frame, or resuming after a stall (shader compile, hidden tab, long task):
    // put the camera straight where the page is instead of flying through every scene
    // in between to catch up.
    if (this.snapNext || gap > 0.25) {
      this.smoothProgress = this.progress
      this.snapNext = false
    }

    // At rest (no scroll, no pointer, camera settled) the scene only drifts: 30 fps is enough.
    const settled = Math.abs(this.progress - this.smoothProgress) < 2e-4
    const idle = this.intro >= 1 && settled && this.jumpPhase === 0 && this.cutT === 0 && this.surge === 0 && performance.now() - this.lastActive > 1200
    this.idleNow = idle
    // 4 ms of tolerance so vsync jitter doesn't drop extra frames (60 Hz: 60 or 30 fps,
    // 120 Hz: 60 or 30 fps).
    if (idle && this.pending < 1 / this.idleCap - 0.004) return
    const dt = Math.min(this.pending, 0.1)
    this.pending = 0
    const frameStart = performance.now()

    this.time += dt * (this.reducedMotion ? 0.2 : 1)
    this.intro = Math.min(1, this.intro + dt / 2.4)
    if (!idle) this.adaptQuality(dt)
    this.stepJump(dt)
    this.stepCut(dt)
    this.stepSignal(dt)

    // Camera inertia: tight enough to follow a fast scroll, loose enough to stay fluid.
    const k = 1 - Math.exp(-dt * 9)
    this.smoothProgress += (this.progress - this.smoothProgress) * k
    this.smoothMouse.lerp(this.mouse, 1 - Math.exp(-dt * 2.5))

    const s = this.sample(this.smoothProgress)
    const portrait = window.innerHeight > window.innerWidth
    const dist = s.dist * (portrait ? 1.35 : 1)
    this.idleCap = s.dist < 7.5 ? 60 : 30
    const elev = s.elev + this.smoothMouse.y * 0.05
    const azim = s.azim + this.smoothMouse.x * 0.08 + this.time * 0.006

    const u = this.sceneMat.uniforms
    u.uTime.value = this.time
    u.uCamPos.value.set(Math.cos(azim) * Math.cos(elev) * dist, Math.sin(elev) * dist, Math.sin(azim) * Math.cos(elev) * dist)
    u.uCamTarget.value.set(0, 0, 0)
    u.uFov.value = s.fov
    u.uIntro.value = smooth(this.intro)
    u.uDiskGain.value = s.gain
    u.uTint.value = s.tint

    // Match the raymarch projection: tan(fovY / 2) = 0.5 * uFov.
    this.view.fov = THREE.MathUtils.radToDeg(2 * Math.atan(0.5 * s.fov))
    this.view.position.copy(u.uCamPos.value)
    this.view.lookAt(0, 0, 0)
    this.view.updateProjectionMatrix()
    this.view.updateMatrixWorld()

    // Singularity on screen (device px) and the apparent radius of its shadow.
    const ndc = new THREE.Vector3(0, 0, 0).project(this.view)
    const H = window.innerHeight * this.dpr
    const W = window.innerWidth * this.dpr
    const shadowAng = Math.asin(Math.min(0.99, 2.6 / dist))
    this.postMat.uniforms.uHole.value.set(
      (ndc.x * 0.5 + 0.5) * W,
      (ndc.y * 0.5 + 0.5) * H,
      (Math.tan(shadowAng) / (0.5 * s.fov)) * (H / 2),
    )
    const pm = this.particlesMat.uniforms
    pm.uTime.value = this.time
    pm.uGain.value = s.gain * smooth(this.intro)
    pm.uTint.value = s.tint
    pm.uCamPos.value.copy(u.uCamPos.value)


    const pu = this.postMat.uniforms
    pu.uTime.value = this.time
    pu.uLacquer.value = s.lacquer
    pu.uGlass.value = s.glass
    pu.uLines.value = s.lines
    this.updatePanes()

    this.renderer.setRenderTarget(this.target)
    this.renderer.render(this.sceneScene, this.view)
    this.renderer.setRenderTarget(null)
    this.renderer.render(this.postScene, this.cam)

    // CPU-side frame cost (GPU work is async) and rendered fps.
    this.statMs += performance.now() - frameStart
    this.statFrames++
    const now = performance.now()
    if (now - this.statStart >= 1000) {
      this.lastStats = { fps: Math.round((this.statFrames * 1000) / (now - this.statStart)), ms: +(this.statMs / this.statFrames).toFixed(2) }
      this.statFrames = 0
      this.statMs = 0
      this.statStart = now
    }

    this.onTelemetry({ radius: dist })
  }

  /** Dev only: average GPU-bound ms per frame at the current scroll position. */
  benchmark(frames = 60) {
    const gl = this.renderer.getContext()
    const render = () => {
      this.renderer.setRenderTarget(this.target)
      this.renderer.render(this.sceneScene, this.view)
      this.renderer.setRenderTarget(null)
      this.renderer.render(this.postScene, this.cam)
    }
    const px = new Uint8Array(4)
    const sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px)
    render()
    sync()
    const t0 = performance.now()
    for (let i = 0; i < frames; i++) {
      render()
      sync()
    }
    return +((performance.now() - t0) / frames).toFixed(2)
  }

  dispose() {
    this.disposed = true
    cancelAnimationFrame(this.raf)
    window.removeEventListener("resize", this.resize)
    window.removeEventListener("pointermove", this.onPointer)
    document.removeEventListener("visibilitychange", this.onVisibility)
    this.target.dispose()
    this.sceneMat.dispose()
    this.postMat.dispose()
    this.particlesMat.dispose()
    this.renderer.dispose()
  }
}
