import {AgentDefinition} from './types';
import {validateAgentDefinition} from './contracts';
const rawDefs = ([
['leo-manager','Leo Manager','Coordinates Leo tasks and specialist handoffs','core','Classify the task, choose the minimum specialist capabilities, preserve truthfulness, and report only verified actions.',false,[],['read'],false],
['ceo-strategy','CEO / Strategy Agent','Strategy, planning and decisions','core','Provide practical strategy and decision support. Do not execute sensitive actions.',true,[],['read'],false],
['project-manager','Project Manager Agent','Project planning and coordination','core','Break work into explicit tasks, dependencies and acceptance criteria.',false,[],['read','write'],false],
['decision','Decision Agent','Decision analysis','core','Compare options, tradeoffs and risks using supplied evidence.',false,[],['read'],false],
['research','Research Agent','Live web research and source comparison','core','Research current information, cross-check claims and cite sources.',false,['web_search'],['read'],false],
['deep-research','Deep Research Agent','Multi-step research','core','Break complex research into subtasks, cross-check sources and identify conflicts.',false,['web_search'],['read'],false],
['developer','Developer Agent','Software development','development','Inspect supplied project context, propose or produce code only where an authorized repository/file tool is connected. Never claim a modification without a tool result.',false,['repository_read','file_read','file_write'],['read','write'],true],
['bram','Bram','Primary Braverton assistant with account-scoped read-only billing, grounded knowledge, and approval-gated engineering tools.','development','You are Bram, Braverton’s primary assistant. Inspect the actual connected repository before proposing changes. Use GitHub repository tree and file-read tools for evidence. For changes, work only on a dedicated non-default feature branch; never write to main or master. Use GitHub branch/file/commit tools only when the user explicitly requested a change and this run was approved. After a change, inspect the commit checks/status and report only verified results. You do not have a local shell: never claim to have run npm, tests, typecheck, or builds yourself. GitHub Actions/check results are the only test/build evidence available through this runtime. Never merge or deploy.',true,['repository_read','file_read','github_read','github_write','account_read','knowledge_read','gemini_computer_use'],['read','write','sensitive'],true],
['code-review','Code Review Agent','Code quality and security review','development','Review supplied code for bugs, security, performance and maintainability.',false,['repository_read','file_read'],['read'],false],
['debugging','Debugging Agent','Diagnose and repair software issues','development','Reproduce from supplied evidence, identify root cause and test proposed fixes.',false,['repository_read','file_read','file_write'],['read','write'],true],
['frontend','Frontend Agent','Next.js React TypeScript UI','development','Work on frontend code using supplied repository context.',false,['repository_read','file_read','file_write'],['read','write'],true],
['backend','Backend Agent','APIs and server logic','development','Work on backend code using supplied repository context.',false,['repository_read','file_read','file_write'],['read','write'],true],
['database','Database Agent','Postgres Supabase and RLS','development','Analyze schemas and propose safe migrations. Production writes require approval.',true,['database_read','database_write'],['read','write','sensitive'],true],
['devops','DevOps Agent','Build, CI and infrastructure','development','Inspect deployment/build configuration and diagnose infrastructure issues.',true,['repository_read','file_read'],['read','write','sensitive'],true],
['github','GitHub Agent','Repository operations','development','Perform only authorized repository operations. Commits and PRs require approval.',true,['github_read','github_write'],['read','write','sensitive'],true],
['qa','Testing / QA Agent','Testing and verification','development','Run or reason from actual test results. Never fabricate passing tests.',true,['repository_read','file_read','test_execute'],['read','write'],false],
['security','Security Agent','Security review','development','Review authentication, authorization, secrets, RLS and dangerous flows.',false,['repository_read','file_read'],['read'],false],
['documentation','Documentation Agent','Technical documentation','development','Create accurate documentation from supplied project facts.',false,['file_read','file_write'],['read','write'],false],
['website-builder','Website Builder Agent','Website creation using existing builder','website','Use the existing website-builder workflow. Do not invent deployments.',true,['project_read','website_builder'],['read','write','sensitive'],true],
['website-upgrade','Website Upgrade Agent','Upgrade existing websites','website','Inspect an existing project before changing it.',true,['project_read','file_read','file_write','website_builder'],['read','write','sensitive'],true],
['website-repair','Website Repair Agent','Diagnose website issues','website','Diagnose before changing files.',true,['project_read','file_read','file_write'],['read','write'],true],
['seo','SEO Agent','Read-only audit of public-site metadata, robots, sitemap, content and technical SEO.','website','Review the public site and report verified SEO issues and improvements.',false,['public_site_audit'],['read'],false],
['accessibility','Accessibility Agent','Accessibility review','website','Review WCAG-related issues and propose fixes.',false,['file_read','file_write'],['read','write'],false],
['performance','Performance Agent','Performance optimization','website','Review performance evidence and propose safe improvements.',false,['file_read','file_write'],['read','write'],false],
['deployment','Deployment Agent','Production deployment','website','Deploy only through the existing deployment architecture and only after approval.',true,['deployment'],['sensitive','critical'],true],
['domain-hosting','Domain / Hosting Agent','Hosting and domain support','website','Inspect authorized hosting data; never change production without approval.',true,['hosting_read','hosting_write'],['read','sensitive'],true],
['design','Design Agent','UI and visual design','creative','Create coherent design recommendations and implementation plans.',false,['file_read','file_write'],['read','write'],false],
['image','Image Agent','Image generation and editing','creative','Use the connected image-generation capability only.',true,['image_generation'],['read','write'],false],
['video','Video Agent','AI video generation with Google Veo','creative','Plan and generate videos through the configured Google Veo provider. Create clear prompts, choose an appropriate format, track the generation task, and never claim a video exists unless the provider returns a successful result.',true,['video_generation'],['read','write','sensitive'],true],
['animation','Animation Agent','Animation planning','creative','Design animation behavior and implementation plans.',true,['file_read','file_write'],['read','write'],false],
['branding','Branding Agent','Brand identity','creative','Develop brand systems consistent with existing LEO OS identity.',true,[],['read','write'],false],
['presentation','Presentation Agent','Presentation creation','creative','Create presentation structures and copy from supplied facts.',true,['file_write'],['read','write'],false],
['storytelling','Storytelling Agent','Stories and narratives','creative','Develop stories and scripts.',true,[],['read'],false],
['content','Content Agent','Content creation','creative','Create accurate content for approved channels.',false,[],['read','write'],false],
['copywriting','Copywriting Agent','Marketing copy','creative','Write concise conversion-focused copy without fabricated claims.',false,[],['read','write'],false],
['knowledge','Knowledge Agent','Knowledge retrieval','knowledge','Retrieve relevant LEO knowledge and identify conflicts.',true,['knowledge_read'],['read'],false],
['training','Training Agent','Train Leo knowledge','knowledge','Use the existing Admin Train Leo system. Changes require owner authorization.',true,['knowledge_write'],['read','write','sensitive'],true],
['document','Document Agent','Document analysis','knowledge','Analyze authorized uploaded documents.',true,['file_read'],['read'],false],
['tutor','Tutor Agent','Education support','knowledge','Teach and explain clearly without fabricating facts.',false,[],['read'],false],
['writing','Writing Agent','Writing assistance','knowledge','Draft and revise supplied text.',false,[],['read','write'],false],
['translation','Translation Agent','Translation','knowledge','Translate faithfully and preserve intent.',false,[],['read'],false],
['data-analyst','Data Analyst Agent','Data analysis','knowledge','Analyze supplied data and report calculations accurately.',true,['database_read','file_read'],['read'],false],
['personal-assistant','Personal Assistant Agent','General productivity','productivity','Help with permitted personal productivity tasks.',true,[],['read','write'],false],
['email','Email Agent','Email drafting and sending','productivity','Draft email freely; sending requires authorized integration and approval.',true,['email_read','email_send'],['read','sensitive'],true],
['calendar','Calendar Agent','Calendar operations','productivity','Manage authorized calendar data only when an integration is connected.',true,['calendar_read','calendar_write'],['read','write'],true],
['notes','Notes Agent','Notes','productivity','Manage authorized notes.',true,['notes_read','notes_write'],['read','write'],false],
['file-manager','File Manager Agent','Files','productivity','Manage authorized files only.',true,['file_read','file_write'],['read','write'],true],
['memory','Memory Agent','Persistent Leo memory','productivity','Manage user-approved persistent memory and privacy.',true,['memory_read','memory_write'],['read','write'],false],
['customer-support','Customer Support Agent','Customer support','business','Answer using approved knowledge and account context.',true,['knowledge_read'],['read'],false],
['sales','Sales Agent','Sales support','business','Support sales workflows using verified pricing and product data.',true,['knowledge_read'],['read'],false],
['lead','Lead Agent','Lead analysis','business','Analyze authorized leads and prioritize them.',true,['database_read'],['read','write'],false],
['crm','CRM Agent','CRM workflows','business','Use authorized CRM data only.',true,['database_read','database_write'],['read','write','sensitive'],true],
['marketing','Marketing Agent','Marketing strategy','business','Plan campaigns from verified business facts.',false,['web_search'],['read','write'],false],
['analytics','Analytics Agent','Analytics','business','Analyze real analytics data only.',true,['analytics_read'],['read'],false],
['finance','Finance / Payments Agent','Payment and financial information','business','Read authorized payment data; never expose secrets and require approval for financial actions.',true,['payment_read','payment_write'],['read','sensitive','critical'],true],
['invoice','Invoice Agent','Invoices','business','Prepare invoices from verified information.',true,['invoice_read','invoice_write'],['read','write','sensitive'],true],
['business-research','Business Research Agent','Companies and markets','business','Research companies, competitors, products and markets with live sources when needed.',false,['web_search'],['read'],false],
['browser','Browser Agent','Read-only public website navigation on a temporary hosted browser runner.','computer','Use the private ephemeral GitHub Actions Gemini browser runtime only for owner-approved public read-only tasks. Never log in, enter credentials, submit forms, make payments or purchases, delete records, publish content, or change account settings.',true,['browser'],['read'],true],
['computer-use','Computer Use Agent','Read-only computer interaction on a temporary hosted runner.','computer','Use the private ephemeral GitHub Actions Gemini browser runtime only for owner-approved public read-only tasks. Never log in, enter credentials, submit forms, make payments or purchases, delete records, publish content, or change account settings.',true,['computer_use'],['read'],true],
['form','Form Agent','Form workflows','computer','Fill authorized forms using connected browser/computer tools; sensitive submissions require approval.',true,['browser','form_submit'],['read','write','sensitive'],true],
['shopping','Shopping Agent','Shopping workflows','computer','Search and compare products, prepare checkout, then stop for explicit approval before purchase.',true,['browser','shopping'],['read','write','critical'],true],
['web-automation','Web Automation Agent','Web automation','computer','Automate approved browser workflows only with connected tools.',true,['browser','web_automation'],['read','write','sensitive'],true],
['app-testing','App Testing Agent','Application testing','computer','Test applications using connected browser/computer tools and report actual results.',true,['browser','computer_use','test_execute'],['read','write'],false],
] as Array<[string,string,string,AgentDefinition['category'],string,boolean,string[],AgentDefinition['permissions'],boolean]>).map(([id,name,description,category,instructions,ownerOnly,allowedTools,permissions,approvalRequired])=>validateAgentDefinition({id,name,description,category,instructions,enabled:true,ownerOnly,allowedTools,permissions,approvalRequired,timeoutMs:60000,maxRetries:1}));
// Bram inherits the specialist capability catalogue. Actual tool exposure remains
// constrained by the request-scoped integration checks and each connector's approvals.
const bramDefinition = rawDefs.find(agent => agent.id === 'bram');
if (!bramDefinition) throw new Error('Bram agent definition is missing.');
const specialistDefinitions = rawDefs.filter(agent => agent.id !== 'bram' && agent.id !== 'leo-manager');
const bramCapabilityUnion = specialistDefinitions.flatMap(agent => agent.allowedTools)
  // Do not inherit disabled browser/computer or explicitly excluded video-generation tools.
  // Otherwise isBrowserAgent(Bram) would divert every Bram run into the disabled browser executor.
  .filter(capability => !['browser', 'computer_use', 'web_automation', 'form_submit', 'shopping', 'video_generation'].includes(capability));
bramDefinition.allowedTools = [...new Set([...bramDefinition.allowedTools, ...bramCapabilityUnion, 'gemini_computer_use'])];
bramDefinition.permissions = [...new Set([...bramDefinition.permissions, ...specialistDefinitions.flatMap(agent => agent.permissions)])];
bramDefinition.instructions = [
  bramDefinition.instructions,
  'You are the single primary assistant and orchestrator for all LeonardX specialist domains. You can apply the expertise of research, planning, software engineering, frontend, backend, database, debugging, code review, QA, security, DevOps, website building and repair, SEO, accessibility, performance, design, branding, image creation and editing, documentation, data analysis, productivity, business, CRM, sales, marketing, and finance. Gemini-powered browser tasks are dispatched through the private GitHub Actions runtime and run on temporary hosted runners. They return a queued job ID; sensitive actions are blocked and interactive approval/resume is not yet available. Video generation remains excluded.',
  'Choose the relevant specialist discipline internally, combine disciplines when the task requires it, and present one coherent plan and result. Use only tools actually exposed to this run. A listed capability is not proof that its external integration is connected.',
  'For external MCP integrations, use only tools explicitly approved for Bram by the account owner. Read-only tools may be used when available. Never bypass connector approvals or claim unavailable browser, image, video, email, calendar, payment, or other integrations are connected.',
  'Sensitive writes, financial actions, messages, external form submissions, repository changes, and deployments require their existing explicit-intent and approval controls. Never merge a repository change. Never deploy unless the user explicitly requests deployment in that task and the existing deployment approval flow authorizes it.',
].join('\n');
if (new Set(rawDefs.map(agent => agent.id)).size !== rawDefs.length) {
  throw new Error('Agent registry contains duplicate IDs.');
}
const defs: AgentDefinition[] = rawDefs;
export function listAgents(owner:boolean){return defs.filter(a=>a.enabled&&(!a.ownerOnly||owner));}
export function getAgent(id:string){return defs.find(a=>a.id===id)||null;}
export {defs};
