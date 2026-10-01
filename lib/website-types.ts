export const WEBSITE_TYPES=[
['company','Company','Building2'],['portfolio','Portfolio','BriefcaseBusiness'],['agency','Agency','Sparkles'],['restaurant','Restaurant','Utensils'],['real_estate','Real Estate','House'],['ecommerce','E-commerce Store','ShoppingCart'],['digital_products','Digital Products','Download'],['booking','Booking','CalendarDays'],['membership','Membership','Users'],['saas','SaaS','Cloud'],['blog','Blog','PenLine'],['magazine','Magazine','Newspaper'],['forum','Forum','MessagesSquare'],['event','Event','Ticket'],['school','School','GraduationCap'],['course','Course Platform','BookOpen'],['church_ngo','Church / NGO','HeartHandshake'],['government','Government','Landmark'],['landing','Landing Page','PanelsTopLeft'],['cv','CV','FileText'],] as const;
export const DB_NEEDED=new Set(['real_estate','ecommerce','digital_products','booking','membership','saas','magazine','forum','school','course','government']);
export const TYPE_QUESTIONS:Record<string,string[]>= {
 ecommerce:['What are you selling?','How many products will you launch with?','Payment: Paystack, bank transfer, cash, or manual email?','User accounts or guest checkout?','Business name and contact number?'],
 restaurant:['Business name and location?','Menu categories and prices?','Do customers need table reservations?','Delivery or pickup?','Business contact number?'],
 portfolio:['Your name and professional title?','Which projects should appear?','Your bio and skills?','Photo, CV, testimonials and social links?','Contact email/phone?'],
 cv:['Full name and title?','Education and credentials?','Work experience?','Skills, references and links?','Photo and contact details?'],
 real_estate:['Agency name and locations?','Property types and listings?','Do you need inquiries or booking?','Payment/deposit required?','Agent/team photos and credentials?'],
 booking:['What can customers book?','Availability and duration?','Payment required before booking?','Cancellation rules?','Business contact details?'],
 school:['School name and campus?','Programs/classes?','Admissions workflow?','Fees/payment method?','Staff and contact details?'],
 course:['Course names and instructors?','Free or paid courses?','Student accounts?','Certificates?','Payment method?'],
 church_ngo:['Organization name and mission?','Leadership/team details?','Events/donations?','Donation/payment method?','Contact and social links?'],
 landing:['Business/product name?','Main offer and CTA?','Proof/testimonials?','Contact/payment needed?','Brand assets?'],
 company:['Company name and services?','About/mission?','Team members and credentials?','Testimonials and contact links?','Payment/booking needed?'],
 agency:['Agency name and services?','Team members and credentials?','Portfolio/case studies?','Testimonials and links?','Lead/contact workflow?'],
 digital_products:['What digital products?','Prices and delivery format?','Customer accounts?','Payment method?','Support/contact details?'],
 membership:['Membership benefits?','Plans/prices?','Member accounts?','Content to protect?','Payment method?'],
 saas:['Product name and features?','Pricing tiers?','User accounts?','Billing/payment provider?','Support/contact?'],
 blog:['Blog name and topics?','Author profile?','Categories?','Newsletter/contact?','Social links?'],
 magazine:['Publication name?','Editors/authors?','Categories?','Subscriptions/ads?','Contact/social links?'],
 forum:['Community name and rules?','User accounts?','Moderation team?','Categories?','Email/contact?'],
 event:['Event name/date/location?','Tickets or registration?','Speakers/team?','Payment method?','Contact details?'],
 government:['Agency name and jurisdiction?','Services/forms?','Departments/team?','Public notices?','Official contact/links?'],
};
