"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

const MODEL_URL = "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260929_212926_92423081-b0e4-4f5a-b650-14af6c05c058.glb";

const vertexShader = `
  varying vec3 vNormal;
  varying vec3 vEye;
  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vec4 mvPos = viewMatrix * worldPos;
    gl_Position = projectionMatrix * mvPos;
    vNormal = normalize(normalMatrix * normal);
    vEye = normalize(mvPos.xyz);
  }
`;

const fragmentShader = `
  uniform sampler2D uTexture;
  uniform vec2 uResolution;
  uniform float uBackside;
  uniform float uRefractPower;
  uniform float uChromatic;
  uniform float uSaturation;
  uniform float uShininess;
  uniform float uDiffuseness;
  uniform float uFresnelPower;
  uniform vec3 uLight;
  varying vec3 vNormal;
  varying vec3 vEye;

  float highlight(vec3 light, float shininess, float diffuseness) {
    vec3 lightVector = normalize(-light);
    vec3 viewVector = normalize(-vEye);
    vec3 halfVector = normalize(lightVector + viewVector);
    vec3 normal = normalize(vNormal);
    return pow(max(dot(normal, halfVector), 0.0), shininess)
      + max(0.0, dot(normal, lightVector)) * diffuseness;
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / uResolution;
    vec3 normal = normalize(vNormal);
    if (uBackside > 0.5) normal = -normal;
    vec3 eye = normalize(vEye);
    float slide = 0.028;
    vec2 redUv = uv + refract(eye, normal, 1.0 / 1.15).xy * (uRefractPower + slide) * uChromatic;
    vec2 yellowUv = uv + refract(eye, normal, 1.0 / 1.16).xy * (uRefractPower + slide) * uChromatic;
    vec2 greenUv = uv + refract(eye, normal, 1.0 / 1.18).xy * (uRefractPower + slide * 2.0) * uChromatic;
    vec2 cyanUv = uv + refract(eye, normal, 1.0 / 1.22).xy * (uRefractPower + slide * 2.5) * uChromatic;
    vec2 blueUv = uv + refract(eye, normal, 1.0 / 1.22).xy * (uRefractPower + slide * 3.0) * uChromatic;
    vec3 red = texture2D(uTexture, redUv).rgb;
    vec3 yellow = texture2D(uTexture, yellowUv).rgb;
    vec3 green = texture2D(uTexture, greenUv).rgb;
    vec3 cyan = texture2D(uTexture, cyanUv).rgb;
    vec3 blue = texture2D(uTexture, blueUv).rgb;
    vec3 color = vec3(
      red.r * 0.5 + (yellow.r * 0.7 - cyan.r * 0.15),
      green.g * 0.5 + (yellow.g * 0.7 + cyan.g * 0.35),
      blue.b * 0.5 + (cyan.b * 0.8 - yellow.b * 0.1)
    );
    float luma = dot(color, vec3(0.2125, 0.7154, 0.0721));
    color = mix(vec3(luma), color, uSaturation);
    float specular = highlight(uLight, uShininess, uDiffuseness)
      + 0.6 * highlight(vec3(1.0, 1.0, -1.0), uShininess * 0.6, uDiffuseness * 0.5);
    color += specular * (uBackside > 0.5 ? 0.35 : 1.0);
    float fresnel = pow(1.0 + dot(eye, normal), uFresnelPower);
    color = mix(color, vec3(1.0), fresnel * (uBackside > 0.5 ? 0.25 : 0.55));
    color += vec3(0.004, 0.005, 0.007);
    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`;

type GlassUniforms = {
  uTexture: { value: THREE.Texture | null };
  uResolution: { value: THREE.Vector2 };
  uBackside: { value: number };
  uRefractPower: { value: number };
  uChromatic: { value: number };
  uSaturation: { value: number };
  uShininess: { value: number };
  uDiffuseness: { value: number };
  uFresnelPower: { value: number };
  uLight: { value: THREE.Vector3 };
};

function makeUniforms(backside: boolean): GlassUniforms {
  return {
    uTexture: { value: null },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uBackside: { value: backside ? 1 : 0 },
    uRefractPower: { value: backside ? 0.22 : 0.3 },
    uChromatic: { value: 0.5 },
    uSaturation: { value: 1.08 },
    uShininess: { value: 90 },
    uDiffuseness: { value: 0.02 },
    uFresnelPower: { value: 5 },
    uLight: { value: new THREE.Vector3(-1, 1, 1) },
  };
}

export default function DesignWorldScene() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    renderer.setClearColor(0x000000, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));

    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 0);
    const scene = new THREE.Scene();
    const backgroundScene = new THREE.Scene();
    const pivot = new THREE.Group();
    const spinner = new THREE.Group();
    scene.add(pivot);
    pivot.add(spinner);

    const headlineCanvas = document.createElement("canvas");
    const headlineContext = headlineCanvas.getContext("2d");
    if (!headlineContext) return () => renderer.dispose();
    const headlineTexture = new THREE.CanvasTexture(headlineCanvas);
    headlineTexture.colorSpace = THREE.SRGBColorSpace;
    headlineTexture.minFilter = THREE.LinearFilter;
    headlineTexture.magFilter = THREE.LinearFilter;
    headlineTexture.generateMipmaps = false;
    const backgroundMaterial = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: headlineTexture } },
      vertexShader: "varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}",
      fragmentShader: "uniform sampler2D uTex; varying vec2 vUv; void main(){gl_FragColor=texture2D(uTex,vUv);\n#include <colorspace_fragment>\n}",
      depthTest: false,
      depthWrite: false,
    });
    const backgroundQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), backgroundMaterial);
    backgroundQuad.frustumCulled = false;
    backgroundScene.add(backgroundQuad);

    const backTarget = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
    const frontTarget = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
    const backUniforms = makeUniforms(true);
    const frontUniforms = makeUniforms(false);
    backUniforms.uTexture.value = backTarget.texture;
    frontUniforms.uTexture.value = frontTarget.texture;
    const backMaterial = new THREE.ShaderMaterial({ uniforms: backUniforms, vertexShader, fragmentShader, side: THREE.BackSide });
    const frontMaterial = new THREE.ShaderMaterial({ uniforms: frontUniforms, vertexShader, fragmentShader, side: THREE.FrontSide });
    let frontCube: THREE.Mesh | null = null;
    let backCube: THREE.Mesh | null = null;
    let disposed = false;
    let modelReady = false;

    const drawHeadline = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const dpr = window.devicePixelRatio || 1;
      const mobile = width < 768 || width / height < 1;
      headlineCanvas.width = Math.floor(width * dpr);
      headlineCanvas.height = Math.floor(height * dpr);
      headlineContext.setTransform(dpr, 0, 0, dpr, 0, 0);
      headlineContext.fillStyle = "#000";
      headlineContext.fillRect(0, 0, width, height);
      let fontSize = Math.min(height * 0.21, width * (mobile ? 0.21 : 0.118));
      headlineContext.font = `800 ${fontSize}px Poppins`;
      const lines = ["Explore", "New", "Ideas"];
      const widest = Math.max(...lines.map((line) => headlineContext.measureText(line).width));
      if (widest > width * (mobile ? 0.9 : 0.5)) fontSize *= (width * (mobile ? 0.9 : 0.5)) / widest;
      headlineContext.font = `800 ${fontSize}px Poppins`;
      headlineContext.textAlign = "center";
      headlineContext.textBaseline = "alphabetic";
      headlineContext.fillStyle = "#e9e9e9";
      const x = width * (mobile ? 0.5 : 0.505);
      const y = height * (mobile ? 0.45 : 0.468);
      const capHeight = fontSize * 0.7;
      const lineGap = fontSize * 1.07;
      lines.forEach((line, index) => headlineContext.fillText(line, x, y + capHeight / 2 + (index - 1) * lineGap));
      headlineTexture.needsUpdate = true;
    };

    const resize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const aspect = width / height;
      renderer.setSize(width, height, false);
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
      const dpr = Math.min(window.devicePixelRatio, 1.6);
      backTarget.setSize(Math.floor(width * dpr), Math.floor(height * dpr));
      frontTarget.setSize(Math.floor(width * dpr), Math.floor(height * dpr));
      backUniforms.uResolution.value.set(width * dpr, height * dpr);
      frontUniforms.uResolution.value.set(width * dpr, height * dpr);
      drawHeadline();
      const visibleHeight = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 10;
      const visibleWidth = visibleHeight * aspect;
      const mobile = width < 768 || width / height < 1;
      const sx = mobile ? 0.5 : 0.517;
      const sy = mobile ? 0.45 : 0.488;
      pivot.position.set((sx - 0.5) * visibleWidth, (0.5 - sy) * visibleHeight, 0);
      const edge = Math.min(height * 0.44, width * (mobile ? 0.45 : 0.29));
      pivot.scale.setScalar((edge / height) * visibleHeight);
    };

    const addModel = (geometry: THREE.BufferGeometry) => {
      if (disposed) {
        geometry.dispose();
        return;
      }
      geometry.deleteAttribute("uv");
      geometry.deleteAttribute("color");
      geometry.deleteAttribute("tangent");
      const cleanGeometry = mergeVertices(geometry, 1e-4);
      cleanGeometry.computeVertexNormals();
      cleanGeometry.computeBoundingBox();
      if (!cleanGeometry.boundingBox) return;
      const center = cleanGeometry.boundingBox.getCenter(new THREE.Vector3());
      cleanGeometry.translate(-center.x, -center.y, -center.z);
      const size = cleanGeometry.boundingBox.getSize(new THREE.Vector3());
      const scale = 1 / Math.max(size.x, size.y, size.z);
      cleanGeometry.scale(scale, scale, scale);
      frontCube = new THREE.Mesh(cleanGeometry, frontMaterial);
      backCube = new THREE.Mesh(cleanGeometry.clone(), backMaterial);
      frontCube.visible = false;
      spinner.add(backCube, frontCube);
      modelReady = true;
      resize();
    };

    const fallback = () => addModel(new RoundedBoxGeometry(1, 1, 1, 8, 0.12));
    new GLTFLoader().load(MODEL_URL, (gltf) => {
      const parts: THREE.BufferGeometry[] = [];
      gltf.scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.updateWorldMatrix(true, false);
        const geometry = object.geometry.clone();
        geometry.applyMatrix4(object.matrixWorld);
        parts.push(geometry);
      });
      if (!parts.length) fallback();
      else addModel(mergeGeometries(parts, true) || new RoundedBoxGeometry(1, 1, 1, 8, 0.12));
    }, undefined, fallback);

    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let velocity = new THREE.Vector2();
    let remainingRotation = 0;
    let lastInteraction = performance.now();
    const yAxis = new THREE.Vector3(0, 1, 0);
    const xAxis = new THREE.Vector3(1, 0, 0);
    const rotate = (axis: THREE.Vector3, amount: number) => spinner.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(axis, amount));
    const onPointerDown = (event: PointerEvent) => { dragging = true; canvas.setPointerCapture(event.pointerId); canvas.classList.add("dragging"); lastX = event.clientX; lastY = event.clientY; velocity.set(0, 0); remainingRotation = 0; lastInteraction = performance.now(); };
    const onPointerMove = (event: PointerEvent) => { if (!dragging) return; const dx = event.clientX - lastX; const dy = event.clientY - lastY; rotate(yAxis, dx * 0.008); rotate(xAxis, dy * 0.008); velocity.set(dx * 0.008, dy * 0.008); lastX = event.clientX; lastY = event.clientY; lastInteraction = performance.now(); };
    const onPointerUp = () => { dragging = false; canvas.classList.remove("dragging"); lastInteraction = performance.now(); };
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);

    let pageVisible = document.visibilityState === "visible";
    const onVisibilityChange = () => { pageVisible = document.visibilityState === "visible"; };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("resize", resize, { passive: true });
    resize();

    let previous = performance.now();
    let animationFrame = 0;
    const render = (now: number) => {
      if (disposed) return;
      animationFrame = requestAnimationFrame(render);
      if (!pageVisible) return;
      const delta = Math.min((now - previous) / 1000, 0.05);
      previous = now;
      if (modelReady && !reducedMotion && !dragging) {
        if (Math.abs(remainingRotation) > 0.0005) {
          const step = remainingRotation * Math.min(1, 0.09 * delta * 60);
          rotate(yAxis, step);
          remainingRotation -= step;
        } else {
          rotate(yAxis, velocity.x);
          rotate(xAxis, velocity.y);
          velocity.multiplyScalar(Math.pow(0.94, delta * 60));
          const idleBlend = Math.min(1, Math.max(0, (now - lastInteraction - 600) / 1000));
          rotate(yAxis, 0.0035 * idleBlend);
          rotate(xAxis, 0.0012 * idleBlend);
        }
      }
      renderer.setRenderTarget(backTarget);
      renderer.clear();
      renderer.render(backgroundScene, camera);
      renderer.setRenderTarget(frontTarget);
      renderer.clear();
      renderer.render(backgroundScene, camera);
      if (backCube && frontCube) { backCube.visible = true; frontCube.visible = false; }
      renderer.autoClear = false;
      renderer.clearDepth();
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      renderer.clear();
      renderer.render(backgroundScene, camera);
      if (backCube && frontCube) { backCube.visible = false; frontCube.visible = true; }
      renderer.clearDepth();
      renderer.render(scene, camera);
      renderer.autoClear = true;
    };
    animationFrame = requestAnimationFrame(render);

    return () => {
      disposed = true;
      cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      headlineTexture.dispose();
      backgroundMaterial.dispose();
      backgroundQuad.geometry.dispose();
      backTarget.dispose();
      frontTarget.dispose();
      backMaterial.dispose();
      frontMaterial.dispose();
      frontCube?.geometry.dispose();
      backCube?.geometry.dispose();
      renderer.dispose();
    };
  }, []);

  return <canvas ref={canvasRef} className="lx-design-world-scene" aria-label="Rotatable glass cube. Drag to rotate." />;
}
