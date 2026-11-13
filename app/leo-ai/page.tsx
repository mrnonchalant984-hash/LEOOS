import { createPublicMetadata } from '@/lib/seo';
import Link from 'next/link';
import { ArrowRight, Bot, Code2, Globe, Workflow, ShieldCheck, Sparkles } from 'lucide-react';

export const metadata = createPublicMetadata({
  title: 'Meet Leo AI',
  description: 'Learn how Leo AI helps organize software ideas, project context and development work inside the LeonardX workspace.',
  path: "/leo-ai",
  type: 'website',
});

const features = [
  { icon: Code2, title: 'Build with project context', text: 'Keep development work connected to project files, requirements and next steps instead of treating every task as a disconnected chat.' },
  { icon: Workflow, title: 'Coordinate specialist workflows', text: 'Organize coding, research, design, testing and delivery tasks with clear checkpoints and review before important changes.' },
  { icon: Globe, title: 'Create websites and web apps', text: 'Plan pages, develop product features and prepare projects for deployment through the services connected to your account.' },
  { icon: ShieldCheck, title: 'Keep control of delivery', text: 'Review generated work, manage integrations and use account permissions before taking important actions.' },
];

export default function LeoAIPage() {
  const faq = [
    ['What is Leo AI?', 'Leo AI is the assistant experience in LeonardX, designed to help organize software work and support website, application and developer workflows.'],
    ['Can Leo AI deploy a website automatically?', 'Deployment depends on project setup, account permissions and configured providers. Review the deployment result from the connected service.'],
    ['Is LeonardX only for developers?', 'No. The platform is intended for developers, creators, freelancers and businesses, with more technical tools available for advanced workflows.'],
  ];
  const faqSchema = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq.map(([question, answer]) => ({ '@type': 'Question', name: question, acceptedAnswer: { '@type': 'Answer', text: answer } })) };

  return <main className="leo-ai-marketing">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema).replace(/</g, '\\u003c') }} />
    <section className="leo-ai-hero">
      <div className="leo-ai-hero-copy">
        <p className="leo-ai-eyebrow"><span><Sparkles size={15}/></span> AI assistant for building software</p>
        <h1>Meet Leo AI.<br/><em>Make the work move.</em></h1>
        <p className="leo-ai-lead">Turn your ideas into structured project work. Leo helps you plan, coordinate specialist tasks, work with project context and verify progress inside LeonardX.</p>
        <div className="leo-ai-actions">
          <Link href="/app" className="leo-ai-primary">Open Leo AI <ArrowRight size={17}/></Link>
          <Link href="/pricing" className="leo-ai-secondary">Explore plans</Link>
        </div>
        <div className="leo-ai-proof"><span><Bot size={15}/> Project-aware assistance</span><span><ShieldCheck size={15}/> Review before action</span></div>
      </div>
      <div className="leo-ai-product-card" aria-label="Leo AI workflow overview">
        <div className="leo-ai-card-head"><span className="leo-ai-avatar"><Bot size={21}/></span><div><strong>Leo AI</strong><small>Software workspace assistant</small></div><span className="leo-ai-online"><i/> READY</span></div>
        <div className="leo-ai-card-message"><small>YOUR IDEA</small><p>Build a customer portal with account access, project tracking and a responsive dashboard.</p></div>
        <div className="leo-ai-card-step"><span>01</span><div><strong>Understand the request</strong><small>Requirements and project context</small></div><span className="leo-ai-step-state">Ready</span></div>
        <div className="leo-ai-card-step"><span>02</span><div><strong>Coordinate the work</strong><small>Design, engineering and testing</small></div><span className="leo-ai-step-state">Planned</span></div>
        <div className="leo-ai-card-step"><span>03</span><div><strong>Review the result</strong><small>Evidence, checks and approvals</small></div><span className="leo-ai-step-state">Review</span></div>
        <p className="leo-ai-card-foot">Illustrative workflow · Not a live execution report</p>
      </div>
    </section>

    <section className="leo-ai-section leo-ai-features">
      <div className="leo-ai-section-heading"><span>WHAT LEO CAN HELP WITH</span><h2>One assistant. A connected way to work.</h2><p>Keep the idea, the plan and the work connected as your product takes shape.</p></div>
      <div className="leo-ai-feature-grid">{features.map(({ icon: Icon, title, text }) => <article className="leo-ai-feature-card" key={title}><span className="leo-ai-feature-icon"><Icon size={22}/></span><h3>{title}</h3><p>{text}</p></article>)}</div>
    </section>

    <section className="leo-ai-section leo-ai-process">
      <div><span className="leo-ai-section-kicker">A CLEARER PROCESS</span><h2>From first idea to verified work.</h2><p>Leo helps keep each stage visible, so you can review what is proposed and what has actually happened.</p></div>
      <div className="leo-ai-process-list"><article><b>01</b><div><strong>Describe the outcome</strong><p>Start with the website, application, feature or problem you want to solve.</p></div></article><article><b>02</b><div><strong>Organize the work</strong><p>Turn the request into requirements and practical steps, then review the proposed direction.</p></div></article><article><b>03</b><div><strong>Build and verify</strong><p>Work with project files and available tools, run supported checks and review results before deployment.</p></div></article></div>
    </section>

    <section className="leo-ai-section leo-ai-faq"><div className="leo-ai-section-heading"><span>COMMON QUESTIONS</span><h2>Frequently asked questions</h2></div><div className="leo-ai-faq-list">{faq.map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div></section>

    <section className="leo-ai-cta"><div><span>READY WHEN YOU ARE</span><h2>Start with the idea you want to build.</h2><p>Open your workspace and bring your next project into focus.</p></div><Link href="/app" className="leo-ai-primary">Get started with Leo <ArrowRight size={17}/></Link></section>
  </main>;
}
