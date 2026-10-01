import Image from 'next/image';
import {Card,CardContent} from '@/components/ui/card';
import {Button} from '@/components/ui/button';

export function ProjectCard({project}:{project:any}){
  return <Card data-3d-card className='group overflow-hidden'>
    <div className='relative aspect-video overflow-hidden bg-zinc-900'>
      <Image src={project.image} alt={project.name} fill unoptimized className='object-cover transition duration-700 group-hover:scale-110' sizes='(max-width:768px) 100vw, 33vw'/>
      <div className='absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent opacity-70 transition duration-500 group-hover:opacity-100'/>
      <div className='absolute bottom-3 left-3 rounded-full border border-white/20 bg-black/45 px-3 py-1 text-[10px] font-bold uppercase tracking-[.16em] text-white/80 backdrop-blur-md'>{project.status}</div>
    </div>
    <CardContent className='relative'>
      <div className='text-xs uppercase text-yellow-300'>{project.type}</div>
      <h3 className='mt-1 text-lg font-bold'>{project.name}</h3>
      <p className='mt-2 text-sm text-zinc-400'>{project.description}</p>
      {project.url?<a href={project.url} target='_blank' rel='noreferrer'><Button className='mt-4 w-full'>View Project</Button></a>:<Button className='mt-4 w-full' disabled>Project URL coming soon</Button>}
    </CardContent>
  </Card>
}
