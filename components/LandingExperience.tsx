"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { Float, Line, Sparkles, Torus } from "@react-three/drei";
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
        <sphereGeometry args={[1.38, 64, 64]} />
        <meshPhysicalMaterial color="#d7a45f" emissive="#6b4218" emissiveIntensity={0.72} metalness={0.8} roughness={0.12} clearcoat={1} clearcoatRoughness={0.08} transparent opacity={0.84} />
      </mesh>
      <mesh scale={1.08} rotation={[0.2, 0.35, 0]}>
        <icosahedronGeometry args={[1.38, 2]} />
        <meshBasicMaterial color="#f2c985" wireframe transparent opacity={0.25} />
      </mesh>
    </Float>
    {[2.05, 2.55, 3.05].map((r, i) => <Torus key={r} args={[r, i === 1 ? 0.018 : 0.01, 24, 160]} rotation={[i * .55, i * .35, i * .2]}><meshBasicMaterial color="#d2a261" transparent opacity={.22 - i * .035}/></Torus>)}
    {[0, 1, 2].map((i) => <mesh key={i} position={[Math.cos(i * 2.1) * 2.65, Math.sin(i * 2.1) * 2.65, 0.1]}><sphereGeometry args={[0.075, 16, 16]} /><meshBasicMaterial color="#f5d29a" transparent opacity={0.85} /></mesh>)}
  </group>;
}

function LaptopModel() {
  return <Float speed={0.7} rotationIntensity={0.07} floatIntensity={0.16}>
    <group position={[-3.55, -1.05, -0.7]} rotation={[0.05, 0.3, 0.02]} scale={0.72}>
      <mesh position={[0, 0.72, 0]} rotation={[-0.12, 0, 0]}><boxGeometry args={[2.45, 1.52, 0.08]}/><meshStandardMaterial color="#343438" metalness={0.78} roughness={0.26}/></mesh>
      <mesh position={[0, 0.72, 0.052]} rotation={[-0.12, 0, 0]}><planeGeometry args={[2.25, 1.32]}/><meshBasicMaterial color="#09090b"/></mesh>
      {[-0.42, -0.18, 0.06, 0.3].map((y, i) => <mesh key={y} position={[-0.48 + (i % 2) * 0.18, 0.72 + y, 0.061]} rotation={[-0.12, 0, 0]}><planeGeometry args={[0.72 + (i % 3) * 0.2, 0.035]}/><meshBasicMaterial color={i === 1 ? '#e4e4e7' : '#71717a'} transparent opacity={0.75}/></mesh>)}
      <mesh position={[0, -0.08, 0.32]} rotation={[-0.08, 0, 0]}><boxGeometry args={[2.65, 0.1, 1.75]}/><meshStandardMaterial color="#a1a1aa" metalness={0.9} roughness={0.25}/></mesh>
      <mesh position={[0, -0.025, 0.32]}><boxGeometry args={[0.62, 0.015, 0.32]}/><meshStandardMaterial color="#55555b" metalness={0.6} roughness={0.3}/></mesh>
    </group>
  </Float>;
}

function ComputeRack() {
  return <Float speed={0.55} rotationIntensity={0.05} floatIntensity={0.12}>
    <group position={[3.45, -0.45, -1.1]} rotation={[0.02, -0.24, 0]} scale={0.76}>
      <mesh><boxGeometry args={[1.28, 3.45, 0.78]}/><meshStandardMaterial color="#242428" metalness={0.72} roughness={0.3}/></mesh>
      {[-1.25, -0.58, 0.09, 0.76, 1.43].map((y, i) => <group key={y} position={[0, y, 0.405]}>
        <mesh><boxGeometry args={[1.06, 0.53, 0.045]}/><meshStandardMaterial color="#0a0a0c" metalness={0.3} roughness={0.5}/></mesh>
        {[-0.36, -0.2, -0.04, 0.12].map((x, j) => <mesh key={x} position={[x, 0, 0.028]}><boxGeometry args={[0.08, 0.025, 0.012]}/><meshBasicMaterial color={i === 2 && j === 1 ? '#ffffff' : '#77777f'}/></mesh>)}
      </group>)}
      <mesh position={[0, 1.82, 0]}><boxGeometry args={[1.34, 0.08, 0.84]}/><meshStandardMaterial color="#b98242" metalness={0.8} roughness={0.22}/></mesh>
    </group>
  </Float>;
}

function BuildPath() {
  const points: [number, number, number][] = [
    [-2.8, -2.2, -1.5], [-1.8, -2.45, -1.2], [-0.7, -2.65, -1],
    [0.45, -2.45, -.8], [1.5, -2.15, -.7], [2.35, -1.65, -.6], [3.1, -1.1, -.5],
  ];
  return <Float speed={0.45} rotationIntensity={0.05} floatIntensity={0.12}>
    <group>
      <Line points={points} color="#d2a261" transparent opacity={0.38} lineWidth={1.1} />
      {points.map((position, index) => <mesh key={index} position={position}>
        <sphereGeometry args={[index === points.length - 1 ? 0.1 : 0.065, 16, 16]} />
        <meshBasicMaterial color={index === points.length - 1 ? '#f5d29a' : '#bc8140'} transparent opacity={0.85} />
      </mesh>)}
    </group>
  </Float>;
}

function Scene() {
  return <>
    <ambientLight intensity={0.42}/>
    <pointLight position={[0, 1, 3]} intensity={12} distance={18} color="#f3c77e"/>
    <pointLight position={[-5, 4, -1]} intensity={4} distance={14} color="#b98242"/>
    <pointLight position={[5, -3, -2]} intensity={4} distance={14} color="#d6a15b"/>
    <Sparkles count={42} scale={[12, 9, 9]} size={0.9} speed={0.1} opacity={0.18} color="#f0c987"/>
    <LaptopModel/>
    <ComputeRack/>
    <BuildPath/>
    <Core/>
  </>;
}

export default function LandingExperience() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [0, -110]);
  const scale = useTransform(scrollYProgress, [0, 1], [1, .9]);
  const opacity = useTransform(scrollYProgress, [0, .72, 1], [1, .88, 0]);
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
