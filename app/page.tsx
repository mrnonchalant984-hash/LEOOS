import Image from 'next/image';
import Link from 'next/link';
import { ArrowDown, ArrowRight, Bot, Boxes, Check, Code2, GitBranch, Globe2, Play, ShieldCheck, Sparkles, Terminal } from 'lucide-react';
import { Reveal } from '@/components/Reveal';
import LandingExperience from '@/components/LandingExperience';

const stages = [
  ['IDEA','Start with a description, a problem, or a product you want to bring to life.'],
  ['LEO','Leo turns the intent into a structured plan and coordinates the work.'],
  ['BUILD','Code, interfaces, project files and product systems take shape inside the workspace.'],
  ['TEST','Run checks, inspect failures and iterate instead of guessing whether the result works.'],
  ['DEPLOY','Move a verified project toward production through the infrastructure you connect.'],
  ['MANAGE','Keep projects, integrations, activity and operational state in one place.'],
  ['IMPROVE','Continue building from evidence, feedback and the next idea.'],
] as const;

const capabilities = [
  ['Project workspaces','A real place for the product to live — not a conversation that disappears when the chat ends.',Globe2],
  ['Specialized agents','Coding, design, research, testing, debugging, deployment and other agents can take responsibility for specific work.',Boxes],
  ['Developer infrastructure','APIs, scoped access, webhooks, integrations and SDK foundations connect LEO OS to the systems around your product.',Code2],
] as const;

export default function Home(){
 return <main className="landing-page">
  <section className="landing-hero">
    <LandingExperience/>
    <div className="landing-hero-content">
      <div className="landing-eyebrow"><span/> LEONARD X <span className="slash">/</span> AI SOFTWARE CREATION</div>
      <h1>Turn bold ideas into <em>working software.</em></h1>
      <p className="landing-lead">Start with a thought, a brief, or a problem. Leonard X gives you the workspace, AI agents, and delivery tools to shape it into something real.</p>
      <div className="landing-actions"><Link href="/app" className="landing-primary">Start building <ArrowRight size={16}/></Link><Link href="/leo-ai" className="landing-secondary"><Bot size={16}/> Meet Leo</Link></div>
      <div className="landing-proof"><span>IDEA</span><i>→</i><span>LEO</span><i>→</i><span>BUILD</span><i>→</i><span>TEST</span><i>→</i><span>DEPLOY</span></div>
    </div>
    <a href="#story" className="landing-scroll"><ArrowDown size={15}/> Explore the platform</a>
  </section>

  <section id="story" className="landing-story section-space">
    <Reveal><div className="editorial-grid"><div><p className="landing-kicker">THE IDEA</p><h2>Most development tools begin after the hardest decision has already been made.</h2></div><div className="editorial-copy"><p>You already know what you want to create. What usually comes next is a long chain of decisions: architecture, files, interfaces, dependencies, integrations, tests, deployments and the endless work of keeping everything aligned.</p><p>Leonard X is designed around that entire journey. You bring the intention. Leo helps turn it into structured work, then works with the project and its connected tools as the product becomes real.</p></div></div></Reveal>
  </section>

  <section className="landing-showcase section-space"><Reveal><div className="showcase-heading"><div><p className="landing-kicker">SEE THE WORK</p><h2>Leo is more useful when intelligence can touch the work.</h2></div><p>Instead of presenting AI as a mysterious answer box, LEO OS makes execution visible: what is being worked on, which stage the project is in, and what still needs attention.</p></div><div className="execution-window"><div className="execution-top"><div><span className="window-dot"/><span className="window-dot"/><span className="window-dot"/> <b>LEONARD X / PROJECT WORKSPACE</b></div><span className="running">● RUNNING</span></div><div className="execution-body"><div className="execution-copy"><p className="landing-kicker">LEO EXECUTION</p><h3>Building the product, not just describing it.</h3><p>Leo can move from planning into project work, use permitted tools, surface useful execution state and hand control back when confirmation is required.</p><div className="execution-list"><span><Check/> Project context analyzed</span><span><Check/> Build plan prepared</span><span className="active-line"><Play/> Updating application shell</span><span><Terminal/> Running verification</span><span><GitBranch/> Deployment preparation</span></div></div><div className="execution-code"><div className="code-header"><span>workspace</span><span>page.tsx</span><span>preview</span></div><pre>{`const product = await leo.plan({\n  idea: "Build my next product"\n})\n\nawait leo.build(product)\nawait leo.test(product)\nawait leo.deploy(product)`}</pre><div className="code-signal"><span/> execution state synchronized</div></div></div></div></Reveal></section>

  <section className="landing-lifecycle section-space"><Reveal><div className="lifecycle-intro"><p className="landing-kicker">ONE CONTINUOUS WORKFLOW</p><h2>From an unfinished thought to a product you can keep improving.</h2><p>The important part is continuity. The idea, project, code, tests, deployment and operational context should not live in separate worlds.</p></div><div className="lifecycle-list">{stages.map(([name,desc],i)=><article key={name} className="lifecycle-item"><div className="stage-index">0{i+1}</div><div><p>{name}</p><h3>{desc}</h3></div><ArrowRight className="stage-arrow" size={20}/></article>)}</div></Reveal></section>

  <section className="landing-capabilities section-space"><Reveal><div className="editorial-grid"><div><p className="landing-kicker">THE PLATFORM</p><h2>A workspace built around doing, not just answering.</h2></div><div className="editorial-copy"><p>LEO OS combines the pieces that normally get scattered across AI chats, coding environments, deployment dashboards and separate automation tools.</p><p>That does not mean every task happens automatically. It means the platform has somewhere for the work to happen, clear permissions for what can happen, and real infrastructure underneath it.</p></div></div><div className="capability-list">{capabilities.map(([title,desc,Icon])=><article key={title}><div className="capability-icon"><Icon size={20}/></div><div><h3>{title}</h3><p>{desc}</p></div><ArrowRight size={18}/></article>)}</div></Reveal></section>

  <section className="landing-integrations section-space"><Reveal><div className="integration-visual"><div className="integration-center"><Sparkles size={25}/><strong>LEO</strong><span>intelligence layer</span></div>{['Supabase','OpenAI','Vercel','Paystack','GitHub','Google'].map((name,i)=><div key={name} className={`integration-node node-${i}`}><span>{name}</span></div>)}<div className="integration-lines"/></div><div className="integration-copy"><p className="landing-kicker">CONNECTED SYSTEMS</p><h2>Your AI should understand the systems your product depends on.</h2><p>LEO OS is designed to work with the infrastructure around your projects. Current platform foundations include Supabase, OpenAI, Vercel and Paystack. Other providers are surfaced honestly according to configuration and approval state.</p><Link href="/integrations" className="text-action">Explore integrations <ArrowRight size={15}/></Link></div></Reveal></section>

  <section className="landing-belief section-space"><Reveal><div className="belief-wrap"><p className="landing-kicker">THE PRINCIPLE</p><h2>AI should make software creation feel more accessible without making the engineering less real.</h2><p>That means showing useful execution state instead of pretending to expose private reasoning. It means server-side permissions instead of trust placed in a button. It means real deployment results instead of optimistic messages. And it means building a platform that can grow with the person using it.</p><div className="belief-points"><span><ShieldCheck/> Real permissions</span><span><Code2/> Real project state</span><span><GitBranch/> Real deployment paths</span></div></div></Reveal></section>

  <section className="landing-founder section-space"><Reveal><div className="founder-grid"><div className="founder-visual"><Image src="/profile.png" alt="Leonard Udoh working at his development desk" fill sizes="(max-width: 900px) 100vw, 34vw" className="founder-photo"/><div className="founder-caption"><strong>Leonard Udoh</strong><span>Founder · Developer</span></div></div><div><p className="landing-kicker">BUILT BY LEONARD</p><h2>Leonard X is founder-led — and still being built.</h2></div><div className="editorial-copy"><p>LEO OS is an ambitious platform, but it is not presented as something it has not become. No invented customer numbers. No manufactured testimonials. No fake teams. No imaginary integrations.</p><p>The product is being built in public, one real system at a time — with the goal of giving builders a place where an idea can become software and then continue evolving.</p><Link href="/about" className="text-action">Learn about Leonard X <ArrowRight size={15}/></Link></div></div></Reveal></section>

  <section className="landing-final"><div className="final-glow"/><Reveal><p className="landing-kicker">YOUR NEXT PRODUCT</p><h2>Start with the idea.</h2><p>Give Leo the problem, the vision or the product you have been thinking about. Then build from there.</p><div className="landing-actions"><Link href="/app" className="landing-primary">Start building <ArrowRight size={16}/></Link><Link href="/pricing" className="landing-secondary">View plans</Link></div></Reveal></section>
 </main>;
}
