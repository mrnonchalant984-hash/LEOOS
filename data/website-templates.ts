export type LeoTemplate = {
  id: string;
  name: string;
  type: string;
  description: string;
  pages: string[];
  style: string;
  suitableFor: string[];
};

export const LEO_TEMPLATES: LeoTemplate[] = [
  {id:'atlas-company',name:'Atlas Company',type:'company',description:'Bold corporate site with services, trust proof and contact conversion.',pages:['Home','About','Services','Contact'],style:'Dark editorial with gold accents',suitableFor:['companies','professional services']},
  {id:'folio-pro',name:'Folio Pro',type:'portfolio',description:'Minimal portfolio with case studies, skills and a strong contact CTA.',pages:['Home','Work','About','Contact'],style:'Minimal dark portfolio',suitableFor:['developers','designers','freelancers']},
  {id:'spark-agency',name:'Spark Agency',type:'agency',description:'Conversion-focused agency layout for services and case studies.',pages:['Home','Services','Work','Contact'],style:'Premium glass cards',suitableFor:['creative agencies','marketing teams']},
  {id:'ember-kitchen',name:'Ember Kitchen',type:'restaurant',description:'Food-first restaurant layout with menu, location and reservations.',pages:['Home','Menu','About','Contact'],style:'Warm cinematic restaurant',suitableFor:['restaurants','cafes']},
  {id:'harbor-estates',name:'Harbor Estates',type:'real_estate',description:'Property discovery layout with listings, agents and inquiries.',pages:['Home','Properties','Agents','Contact'],style:'Luxury property editorial',suitableFor:['real estate agencies','property managers']},
  {id:'cartly-store',name:'Cartly Store',type:'ecommerce',description:'Product storefront structure with categories, product detail and checkout-ready UX.',pages:['Home','Shop','Product','Cart'],style:'Clean commerce grid',suitableFor:['retailers','online stores']},
  {id:'digital-vault',name:'Digital Vault',type:'digital_products',description:'Digital product sales layout with product cards and delivery information.',pages:['Home','Products','FAQ','Contact'],style:'Tech marketplace',suitableFor:['creators','digital sellers']},
  {id:'bookwise',name:'Bookwise',type:'booking',description:'Service booking layout with availability-focused calls to action.',pages:['Home','Services','Book','Contact'],style:'Calm scheduling interface',suitableFor:['consultants','salons','service businesses']},
  {id:'circle-members',name:'Circle Members',type:'membership',description:'Membership landing page with plans, benefits and member journey.',pages:['Home','Benefits','Plans','Join'],style:'Community-first dark UI',suitableFor:['communities','clubs']},
  {id:'cloudbase-saas',name:'CloudBase SaaS',type:'saas',description:'SaaS marketing shell with product value, features and pricing.',pages:['Home','Features','Pricing','Docs'],style:'Futuristic product UI',suitableFor:['software products','startups']},
  {id:'ink-journal',name:'Ink Journal',type:'blog',description:'Readable publishing layout for articles, categories and authors.',pages:['Home','Articles','Article','About'],style:'Editorial reading experience',suitableFor:['writers','personal brands']},
  {id:'pulse-magazine',name:'Pulse Magazine',type:'magazine',description:'Multi-category publication layout with featured stories and sections.',pages:['Home','Latest','Categories','About'],style:'Newsroom editorial',suitableFor:['media brands','publications']},
  {id:'commons-forum',name:'Commons Forum',type:'forum',description:'Community entry layout with categories, rules and moderation cues.',pages:['Home','Categories','Community','Rules'],style:'Community dashboard',suitableFor:['communities','discussion platforms']},
  {id:'summit-event',name:'Summit Event',type:'event',description:'Event site for schedules, speakers, tickets and venue information.',pages:['Home','Schedule','Speakers','Tickets'],style:'Event poster energy',suitableFor:['conferences','events']},
  {id:'bright-school',name:'Bright School',type:'school',description:'School information architecture for admissions, programs and contact.',pages:['Home','Programs','Admissions','Contact'],style:'Trustworthy education UI',suitableFor:['schools','training centers']},
  {id:'learnlab',name:'LearnLab',type:'course',description:'Course platform marketing shell for instructors, courses and enrollment.',pages:['Home','Courses','Instructors','Enroll'],style:'Learning platform UI',suitableFor:['educators','course creators']},
  {id:'grace-community',name:'Grace Community',type:'church_ngo',description:'Mission-driven organization layout for programs, events and support.',pages:['Home','About','Programs','Contact'],style:'Human-centered community design',suitableFor:['churches','NGOs']},
  {id:'civic-service',name:'Civic Service',type:'government',description:'Clear public-service layout focused on information and official links.',pages:['Home','Services','Notices','Contact'],style:'Accessible civic interface',suitableFor:['public agencies','civic projects']},
  {id:'launchpad',name:'Launchpad',type:'landing',description:'Single-purpose landing page for an offer, product or campaign.',pages:['Landing'],style:'High-clarity conversion page',suitableFor:['products','campaigns']},
  {id:'resume-modern',name:'Resume Modern',type:'cv',description:'Professional CV layout for experience, education, skills and links.',pages:['Home','Experience','Projects','Contact'],style:'Modern professional',suitableFor:['job seekers','professionals']}
];
