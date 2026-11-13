// Animated dithering shader for the boarding pass (Paper Shaders' dithering shader, see
// README credits). WebGL2 only; callers keep a canvas-texture fallback underneath.

const VERT = `#version 300 es
precision mediump float;
layout(location = 0) in vec4 a_position;
void main() { gl_Position = a_position; }`;

const FRAG = `#version 300 es
precision mediump float;
uniform float u_time;
uniform vec2 u_resolution;
uniform float u_pixelRatio;
uniform float u_scale;
uniform float u_rotation;
uniform float u_pxSize;
uniform vec4 u_colorBack;
uniform vec4 u_colorFront;
uniform float u_shape;
out vec4 fragColor;
#define TWO_PI 6.28318530718
#define PI 3.14159265358979323846
float hash21(vec2 p) {
  p = fract(p * vec2(0.3183099, 0.3678794)) + 0.1;
  p += dot(p, p + 19.19);
  return fract(p.x * p.y);
}
vec3 permute(vec3 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m; m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}
void main() {
  float t = .5 * u_time;
  float pxSize = u_pxSize * u_pixelRatio;
  vec2 pxSizeUV = gl_FragCoord.xy - .5 * u_resolution;
  pxSizeUV /= pxSize;
  vec2 canvasPixelizedUV = (floor(pxSizeUV) + .5) * pxSize;
  vec2 shapeUV = canvasPixelizedUV / u_pixelRatio;
  float r = u_rotation * PI / 180.;
  shapeUV = mat2(cos(r), sin(r), -sin(r), cos(r)) * (shapeUV / u_scale);
  float shape = 0.;
  if (u_shape < 1.5) {
    // simplex: soft blobs
    shapeUV *= .004;
    shape = 0.5 + 0.5 * (.5 * snoise(shapeUV - vec2(0., .3 * t)) + .5 * snoise(2. * shapeUV + vec2(0., .32 * t)));
    shape = smoothstep(0.3, 0.9, shape);
  } else {
    // warp: flowing bands
    shapeUV *= .003;
    for (float i = 1.0; i < 6.0; i++) {
      shapeUV.x += 0.6 / i * cos(i * 2.5 * shapeUV.y + t);
      shapeUV.y += 0.6 / i * cos(i * 1.5 * shapeUV.x + t);
    }
    shape = .15 / max(0.001, abs(sin(t - shapeUV.y - shapeUV.x)));
    shape = smoothstep(0.02, 1., shape);
  }
  float dithering = step(hash21(canvasPixelizedUV), shape) - .5;
  float res = step(.5, shape + dithering);
  vec3 color = u_colorFront.rgb * u_colorFront.a * res;
  float opacity = u_colorFront.a * res;
  color += u_colorBack.rgb * u_colorBack.a * (1. - opacity);
  opacity += u_colorBack.a * (1. - opacity);
  fragColor = vec4(color, opacity);
}`;

function hex(c: string): [number, number, number, number] {
  const h = c.replace('#', '');
  return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255, 1];
}

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.warn('dither shader:', gl.getShaderInfoLog(s));
    return null;
  }
  return s;
}

export interface DitherOpts { back: string; front: string; shape?: 'simplex' | 'warp'; size?: number; speed?: number; scale?: number; rotation?: number }

/** Renders the shader into a canvas inside `host`. Returns a stop function, or null without WebGL2. */
export function mountDither(host: HTMLElement, o: DitherOpts): (() => void) | null {
  const canvas = document.createElement('canvas');
  canvas.className = 'dither';
  const gl = canvas.getContext('webgl2', { premultipliedAlpha: true, antialias: false });
  if (!gl) return null;
  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return null;
  const prog = gl.createProgram()!;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const U = (n: string) => gl.getUniformLocation(prog, n);
  gl.uniform4fv(U('u_colorBack'), hex(o.back));
  gl.uniform4fv(U('u_colorFront'), hex(o.front));
  gl.uniform1f(U('u_shape'), o.shape === 'simplex' ? 1 : 2);
  gl.uniform1f(U('u_pxSize'), o.size ?? 1);
  gl.uniform1f(U('u_scale'), o.scale ?? 1);
  gl.uniform1f(U('u_rotation'), o.rotation ?? 0);
  const uTime = U('u_time');
  const uRes = U('u_resolution');
  const uPr = U('u_pixelRatio');
  host.prepend(canvas);

  const ratio = Math.max(2, devicePixelRatio || 1);
  const resize = () => {
    const r = host.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(r.width * ratio));
    canvas.height = Math.max(1, Math.round(r.height * ratio));
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.uniform1f(uPr, ratio);
  };
  const ro = new ResizeObserver(resize);
  ro.observe(host);
  resize();

  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const speed = still ? 0 : (o.speed ?? 0.4);
  let raf = 0;
  let t = 0;
  let last = performance.now();
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const dt = (now - last) / 1000;
    last = now;
    if (document.hidden || !host.isConnected) return; // off screen: keep the loop, skip the work
    t += dt * speed;
    gl.uniform1f(uTime, t);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  };
  raf = requestAnimationFrame(frame);
  return () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    canvas.remove();
  };
}

/** One still frame of the shader at a given size, for exported images. Null without WebGL2. */
export function ditherStill(w: number, h: number, o: DitherOpts, time = 3.2): HTMLCanvasElement | null {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const gl = canvas.getContext('webgl2', { premultipliedAlpha: true, antialias: false, preserveDrawingBuffer: true });
  if (!gl) return null;
  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return null;
  const prog = gl.createProgram()!;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const U = (n: string) => gl.getUniformLocation(prog, n);
  const ratio = 2;
  gl.viewport(0, 0, w, h);
  gl.uniform4fv(U('u_colorBack'), hex(o.back));
  gl.uniform4fv(U('u_colorFront'), hex(o.front));
  gl.uniform1f(U('u_shape'), o.shape === 'simplex' ? 1 : 2);
  gl.uniform1f(U('u_pxSize'), o.size ?? 1);
  gl.uniform1f(U('u_scale'), o.scale ?? 1);
  gl.uniform1f(U('u_rotation'), o.rotation ?? 0);
  gl.uniform2f(U('u_resolution'), w, h);
  gl.uniform1f(U('u_pixelRatio'), ratio);
  gl.uniform1f(U('u_time'), time);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
  return canvas;
}
