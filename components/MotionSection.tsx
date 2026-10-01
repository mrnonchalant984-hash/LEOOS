"use client";
import { motion } from "framer-motion";
export default function MotionSection({ children, className = "" }: { children: React.ReactNode; className?: string }) { return <motion.div className={className} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.15 }} transition={{ duration: .55, ease: "easeOut" }}>{children}</motion.div>; }
