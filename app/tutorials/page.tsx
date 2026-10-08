import { TutorialExplorer } from '@/components/TutorialExplorer';
import { LEOAppShell } from '@/components/LEOAppShell';
export const metadata={title:'Tutorials — Leonard X'};
export default function Tutorials(){return <LEOAppShell title="Tutorials" subtitle="Interactive paths for learning the platform by building."><div className="hub-hero tutorial-hero"><div><span className="mini-label">LEARN → BUILD → SHIP</span><h2>Less reading. More doing.</h2><p>Follow focused workflows, mark steps as you complete them, and jump directly into the relevant LEO OS surface.</p></div><div className="tutorial-signal"><span>01</span><b>BUILD</b><em>→</em><span>02</span><b>TEST</b><em>→</em><span>03</span><b>DEPLOY</b></div></div><TutorialExplorer/></LEOAppShell>}
