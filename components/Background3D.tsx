"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { Float, Stars, Sparkles, Torus, Icosahedron } from "@react-three/drei";
import { Suspense, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useReducedMotion } from "framer-motion";
import * as THREE from "three";
import { resolveVisualIdentity } from "@/components/visual-identity";

function EnergyCore() {
  const group = useRef<THREE.Group>(null);
  const core = useRef<THREE.Mesh>(null);

  useFrame(({ pointer, clock }, delta) => {
    if (!group.current || !core.current) return;
    group.current.rotation.x = THREE.MathUtils.lerp(group.current.rotation.x, pointer.y * 0.18, delta * 2);
    group.current.rotation.y = THREE.MathUtils.lerp(group.current.rotation.y, pointer.x * 0.22, delta * 2);
    core.current.rotation.x += delta * 0.32;
    core.current.rotation.y += delta * 0.55;
    const pulse = 1 + Math.sin(clock.elapsedTime * 1.7) * 0.035;
    core.current.scale.setScalar(pulse);
  });

  return (
    <group ref={group} position={[0, 0, -1.8]}>
      <Float speed={1.15} rotationIntensity={0.35} floatIntensity={0.8}>
        <mesh ref={core}>
          <icosahedronGeometry args={[1.35, 2]} />
          <meshStandardMaterial color="#a78bfa" emissive="#3b2b78" emissiveIntensity={0.65} roughness={0.24} metalness={0.75} transparent opacity={0.62} />
        </mesh>
        <mesh scale={1.12}>
          <icosahedronGeometry args={[1.35, 1]} />
          <meshBasicMaterial color="#38bdf8" wireframe transparent opacity={0.24} />
        </mesh>
      </Float>

      {[2.25, 2.9, 3.55].map((radius, index) => (
        <Torus
          key={radius}
          args={[radius, index === 1 ? 0.018 : 0.012, 24, 160]}
          rotation={[index * 0.48, index * 0.35, index * 0.2]}
        >
          <meshBasicMaterial color={index === 1 ? "#38bdf8" : "#a78bfa"} transparent opacity={0.18 - index * 0.03} />
        </Torus>
      ))}
    </group>
  );
}

function FloatingGeometry() {
  const left = useRef<THREE.Mesh>(null);
  const right = useRef<THREE.Mesh>(null);

  useFrame((_, delta) => {
    if (left.current) {
      left.current.rotation.x += delta * 0.18;
      left.current.rotation.y += delta * 0.27;
    }
    if (right.current) {
      right.current.rotation.x -= delta * 0.22;
      right.current.rotation.z += delta * 0.17;
    }
  });

  return (
    <>
      <Float speed={0.75} rotationIntensity={0.7} floatIntensity={1.2}>
        <Icosahedron ref={left} args={[1.1, 1]} position={[-5.2, 2.4, -3]}>
          <meshStandardMaterial color="#38bdf8" wireframe transparent opacity={0.14} />
        </Icosahedron>
      </Float>
      <Float speed={0.65} rotationIntensity={0.8} floatIntensity={1.35}>
        <Icosahedron ref={right} args={[1.35, 1]} position={[5.2, -2.3, -4]}>
          <meshStandardMaterial color="#a78bfa" wireframe transparent opacity={0.14} />
        </Icosahedron>
      </Float>
    </>
  );
}

function Scene() {
  const group = useRef<THREE.Group>(null);

  useFrame(({ pointer }, delta) => {
    if (!group.current) return;
    group.current.rotation.x = THREE.MathUtils.lerp(group.current.rotation.x, pointer.y * 0.035, delta * 1.4);
    group.current.rotation.y = THREE.MathUtils.lerp(group.current.rotation.y, pointer.x * 0.05, delta * 1.4);
  });

  return (
    <group ref={group}>
      <ambientLight intensity={0.28} />
      <pointLight position={[0, 0, 2]} intensity={10} distance={18} color="#8b5cf6" />
      <pointLight position={[-6, 4, -2]} intensity={6} distance={14} color="#38bdf8" />
      <pointLight position={[6, -4, -3]} intensity={5} distance={14} color="#a78bfa" />
      <Stars radius={55} depth={35} count={520} factor={1.7} saturation={0.35} fade speed={0.2} />
      <Sparkles count={46} scale={[16, 10, 12]} size={1.2} speed={0.1} opacity={0.22} color="#67d7ff" />
      <EnergyCore />
      <FloatingGeometry />
    </group>
  );
}

export default function Background3D() {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();
  const [pageVisible, setPageVisible] = useState(true);
  const applicationPrefixes = ['/dashboard','/app','/projects','/agents','/deployments','/analytics','/api-keys','/audit','/auth','/account','/admin','/developers','/docs','/integrations','/leo-ai','/notifications','/observability','/organizations','/resources','/setup','/support','/status','/team','/templates','/tutorials','/webhooks','/whats-new'];
  const inWorkspace = applicationPrefixes.some(prefix => pathname === prefix || pathname?.startsWith(`${prefix}/`));
  const identity = resolveVisualIdentity(pathname);
  useEffect(() => {
    const updateVisibility = () => setPageVisible(document.visibilityState === "visible");
    const frame = window.requestAnimationFrame(updateVisibility);
    document.addEventListener("visibilitychange", updateVisibility);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", updateVisibility);
    };
  }, []);
  if (pathname === "/") return null;
  if (inWorkspace) return <div aria-hidden className="workspace-atmosphere" data-visual-identity={identity} />;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-[#050505]">
      <Canvas dpr={[1, 1.25]} frameloop={reduceMotion || !pageVisible ? "demand" : "always"} camera={{ position: [0, 0, 11], fov: 52 }} gl={{ antialias: false, powerPreference: "low-power" }} fallback={<div className="background-3d-fallback"/>}>
        <Suspense fallback={null}>
          <Scene />
        </Suspense>
      </Canvas>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(139,92,246,.08),transparent_32%),radial-gradient(circle_at_15%_20%,rgba(56,189,248,.035),transparent_25%),radial-gradient(circle_at_85%_75%,rgba(139,92,246,.03),transparent_25%)]" />
      <div className="absolute inset-0 bg-black/65" />
    </div>
  );
}
