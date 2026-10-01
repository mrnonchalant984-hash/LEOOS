export type Project = { id: string; name: string; type: string; description: string; image: string; url: string; status: "live" | "preview" }

const projectUrl = (id: string) => process.env[`NEXT_PUBLIC_PROJECT_${id.toUpperCase().replace(/-/g, '_')}_URL`] || '';

export const big12Projects: Project[] = [
  {id:"cutmaster",name:"Cutmaster Barbershop",type:"Barbershop",description:"A modern barbershop experience with services, gallery, booking and direct contact.",image:"https://images.unsplash.com/photo-1585747860715-2ba37e788b70?auto=format&fit=crop&w=1600&q=85",url:projectUrl("cutmaster"),status:projectUrl("cutmaster")?"live":"preview"},
  {id:"tastehub",name:"Tastehub",type:"Restaurant",description:"A polished restaurant concept with menu, food photography and customer-focused ordering flow.",image:"https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1600&q=85",url:projectUrl("tastehub"),status:projectUrl("tastehub")?"live":"preview"},
  {id:"john-doe",name:"John Doe Portfolio",type:"Portfolio",description:"A professional personal portfolio for showcasing skills, projects and career work.",image:"https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1600&q=85",url:projectUrl("john-doe"),status:projectUrl("john-doe")?"live":"preview"},
  {id:"gracelife",name:"GraceLife",type:"Church / NGO",description:"A welcoming community website concept for services, events, ministries and outreach.",image:"https://images.unsplash.com/photo-1438032005730-c779502df39b?auto=format&fit=crop&w=1600&q=85",url:projectUrl("gracelife"),status:projectUrl("gracelife")?"live":"preview"},
  {id:"primenest",name:"PrimeNest",type:"Real Estate",description:"A premium real-estate showcase for properties, listings and enquiries.",image:"https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1600&q=85",url:projectUrl("primenest"),status:projectUrl("primenest")?"live":"preview"},
  {id:"techvault",name:"TechVault",type:"Technology",description:"A technology-focused product and services concept with a clean, modern visual system.",image:"https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1600&q=85",url:projectUrl("techvault"),status:projectUrl("techvault")?"live":"preview"},
  {id:"azure-bay",name:"Azure Bay",type:"Hotel / Resort",description:"A luxury hospitality concept focused on rooms, amenities, atmosphere and booking.",image:"https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1600&q=85",url:projectUrl("azure-bay"),status:projectUrl("azure-bay")?"live":"preview"},
  {id:"medicalplus",name:"MedicalPlus",type:"Medical",description:"A healthcare website concept for services, doctors, appointments and patient information.",image:"https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?auto=format&fit=crop&w=1600&q=85",url:projectUrl("medicalplus"),status:projectUrl("medicalplus")?"live":"preview"},
  {id:"noxva-export",name:"Noxva Export",type:"Export / Business",description:"A global export business concept for products, logistics, company information and enquiries.",image:"https://images.unsplash.com/photo-1494412574643-ff11b0a5c1c3?auto=format&fit=crop&w=1600&q=85",url:projectUrl("noxva-export"),status:projectUrl("noxva-export")?"live":"preview"},
  {id:"explorenijia",name:"ExploreNijia",type:"Travel",description:"A travel discovery concept for destinations, experiences and trip inspiration.",image:"https://images.unsplash.com/photo-1500534623283-312aade485b7?auto=format&fit=crop&w=1600&q=85",url:projectUrl("explorenijia"),status:projectUrl("explorenijia")?"live":"preview"},
  {id:"leonard-collage",name:"Leonard Collage",type:"Creative Portfolio",description:"A visual creative portfolio concept for artwork, design projects and personal work.",image:"https://images.unsplash.com/photo-1549490349-8643362247b5?auto=format&fit=crop&w=1600&q=85",url:projectUrl("leonard-collage"),status:projectUrl("leonard-collage")?"live":"preview"},
  {id:"pixel-forge",name:"Pixel Forge",type:"Gaming",description:"A gaming and digital entertainment concept with an immersive visual direction.",image:"https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=1600&q=85",url:projectUrl("pixel-forge"),status:projectUrl("pixel-forge")?"live":"preview"}
]

export const projects = big12Projects
export const profileImage = '/profile.png'

export const siteData = {
  owner: 'Leonard Udoh', title: 'Web Developer', description: 'I build modern, responsive websites and AI-powered digital experiences for people and businesses.', tagline: 'I build websites that help businesses attract customers and grow online.', price: 'Starting at ₦350,000', location: 'Remote — Worldwide', whatsapp: 'https://wa.me/2349115936466', whatsappLabel: 'Message LeonardX on WhatsApp', email: 'leonardudoh5@gmail.com', phone: '+2349115936466', phoneDisplay: '+234 911 593 6466', brand: '#FFD700', cv: '/documents/Leonard-Udoh-CV.pdf',
  liveProjects: [
    {name:'Qveli',description:'A social media platform for creators.',url:process.env.NEXT_PUBLIC_LIVE_QVELI_URL||'',image:'/qveli-logo.svg'},
    {name:'LeonardX',description:'A freelancing platform connecting clients with freelancers.',url:process.env.NEXT_PUBLIC_LIVE_LEONARDX_URL||'',image:'https://images.unsplash.com/photo-1556761175-b413da4baf72?auto=format&fit=crop&w=1600&q=85'}
  ],
  demoProjects: big12Projects,
  services: [
    {name:'AI Mockup',price:'₦50,000',description:'Turn a business idea into a polished visual website direction before development.',href:'/app',details:'You get a visual concept, page direction, section ideas, content direction, and a clearer blueprint for the final website.'},
    {name:'Full Website',price:'Starting at ₦350,000',description:'A polished, responsive business website built around your goals and customers.',href:'/contact',details:'The number of pages depends on the website: a simple business site may need 3–5 pages, while larger projects can include 6–15+ pages. Final scope is agreed before development.'},
    {name:'Code Review',price:'₦20,000',description:'A practical review of your codebase with prioritized problems, explanations, and fixes.',href:'/app',details:'Leo can inspect structure, bugs, responsiveness, performance, security risks, accessibility, SEO, and code quality, then give practical fixes.'}
  ],
  testimonials: [{name:'Sarah Okafor',company:'BellaMart',comment:'Leonard built us a site that doubled our sales in 30 days',status:'approved'}]
};
