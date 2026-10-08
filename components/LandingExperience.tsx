"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { Float, Sparkles, Torus } from "@react-three/drei";
import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import * as THREE from "three";

function Core() {
  const mesh = useRef<THREE.Mesh>(null);
  const ring = useRef<THREE.Group>(null);
  useFrame(({ pointer, clock }, delta) => {
    if (mesh.current) {
      mesh.current.rotation.x += delta * 0.22;
      mesh.current.rotation.y += delta * 0.38;
      const s = 1 + Math.sin(clock.elapsedTime * 1.5) * 0.045;
      mesh.current.scale.setScalar(s);
    }
    if (ring.current) {
      ring.current.rotation.x = THREE.MathUtils.lerp(ring.current.rotation.x, pointer.y * 0.2, delta * 1.5);
      ring.current.rotation.y = THREE.MathUtils.lerp(ring.current.rotation.y, pointer.x * 0.3, delta * 1.5);
    }
  });
  return <group ref={ring}>
    <Float speed={1.1} rotationIntensity={0.25} floatIntensity={0.65}>
      <mesh ref={mesh}>
        <icosahedronGeometry args={[1.55, 3]} />
        <meshStandardMaterial color="#d4af37" emissive="#7b5e18" emissiveIntensity={1.5} metalness={0.82} roughness={0.18} transparent opacity={0.82} />
      </mesh>
      <mesh scale={1.08}>
        <icosahedronGeometry args={[1.55, 2]} />
        <meshBasicMaterial color="#d4af37" wireframe transparent opacity={0.26} />
      </mesh>
    </Float>
    {[2.3, 2.85, 3.4].map((r, i) => <Torus key={r} args={[r, i === 1 ? 0.025 : 0.014, 24, 160]} rotation={[i * .55, i * .35, i * .2]}><meshBasicMaterial color={i === 1 ? '#d4af37' : '#d4af37'} transparent opacity={.24 - i * .045}/></Torus>)}
  </group>;
}

function Scene() {
  return <>
    <ambientLight intensity={0.22}/>
    <pointLight position={[0, 1, 3]} intensity={14} distance={18} color="#d4af37"/>
    <pointLight position={[-5, 4, -1]} intensity={8} distance={14} color="#d4af37"/>
    <pointLight position={[5, -3, -2]} intensity={7} distance={14} color="#d4af37"/>
    <Sparkles count={120} scale={[12, 9, 9]} size={1.35} speed={0.2} opacity={0.4} color="#f0d37a"/>
    <Core/>
  </>;
}

export default function LandingExperience() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [0, -170]);
  const scale = useTransform(scrollYProgress, [0, 1], [1, .82]);
  const opacity = useTransform(scrollYProgress, [0, .72, 1], [1, .9, 0]);
  return <motion.section ref={ref} className="landing-visual" style={{ y, scale, opacity }} aria-hidden="true">
    <Canvas dpr={[1, 1.5]} camera={{position:[0,0,8.5],fov:48}}>
      <Scene/>
    </Canvas>
    <div className="landing-visual-glow"/>
    <div className="landing-orbit-label label-one">LEO / ACTIVE</div>
    <div className="landing-orbit-label label-two">TOOLS CONNECTED</div>
    <div className="landing-orbit-label label-three">BUILD → TEST → DEPLOY</div>
  </motion.section>;
}
