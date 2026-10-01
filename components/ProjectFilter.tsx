"use client";
import { useState } from "react";
import { Project } from "@/data/site";
import { ProjectCard } from "@/components/ProjectCard";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
export default function ProjectFilter({ projects }: { projects: Project[] }) { const [filter,setFilter]=useState("all"); const visible=filter==="all"?projects:projects.filter(p=>p.status===filter); return <Tabs value={filter} onValueChange={setFilter}><TabsList><TabsTrigger value="all" active={filter==="all"} onClick={()=>setFilter("all")}>All</TabsTrigger><TabsTrigger value="live" active={filter==="live"} onClick={()=>setFilter("live")}>Live</TabsTrigger><TabsTrigger value="preview" active={filter==="preview"} onClick={()=>setFilter("preview")}>Awaiting URL</TabsTrigger></TabsList><div className="mt-8 grid gap-6 md:grid-cols-2">{visible.map(p=><ProjectCard key={p.id} project={p}/>)}</div></Tabs> }
