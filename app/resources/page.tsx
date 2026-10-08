import { ResourceExplorer } from '@/components/ResourceExplorer';
import { LEOAppShell } from '@/components/LEOAppShell';
export const metadata={title:'Resources — Leonard X'};
export default function Resources(){return <LEOAppShell title="Resources" subtitle="A living library for building with Leo."><div className="hub-hero"><div><span className="mini-label">RESOURCE LIBRARY</span><h2>Find the next thing you need.</h2><p>Documentation, tutorials, developer references, templates and product updates — organized around the work you are actually trying to do.</p></div><div className="hub-orbit"><span>LEO</span><i/><i/><i/></div></div><ResourceExplorer/></LEOAppShell>}
