import Link from "next/link";
import {
  ArrowRight,
  Bot,
  Code2,
  Crown,
  LockKeyhole,
  Users,
} from "lucide-react";
import { LEOAppShell, Panel, StatusPill } from "@/components/LEOAppShell";
export const metadata = { title: "Team & Organizations — Leonard X" };
const roles = [
  [
    "OWNER",
    "Full organization control",
    "Can manage organization settings, members and owned resources.",
  ],
  [
    "ADMIN",
    "Operations and members",
    "Can manage members and operational settings allowed by the organization.",
  ],
  [
    "DEVELOPER",
    "Build and project work",
    "Can work with projects and developer surfaces within granted scope.",
  ],
  [
    "VIEWER",
    "Read-only access",
    "Can inspect shared resources without changing protected state.",
  ],
];
export default function Team() {
  return (
    <LEOAppShell
      title="Team & Organizations"
      subtitle="A collaboration model for customers, not a fictional company roster."
    >
      <div className="team-hero">
        <div>
          <span className="mini-label">COLLABORATION</span>
          <h2>Bring people into the work without blurring ownership.</h2>
          <p>
            Organizations give customers a controlled way to share projects,
            permissions and integrations. Leonard remains the founder of the
            platform; customer organizations are separate boundaries.
          </p>
          <div className="hero-actions">
            <Link href="/organizations" className="primary-button">
              Open organization workspace <ArrowRight size={14} />
            </Link>
            <Link href="/docs" className="secondary-button">
              Read the model
            </Link>
          </div>
        </div>
        <div className="team-map">
          <div className="team-node main">
            <Crown size={17} />
            <strong>OWNER</strong>
            <small>Organization boundary</small>
          </div>
          <div className="team-line l1" />
          <div className="team-line l2" />
          <div className="team-line l3" />
          <div className="team-node">
            <Users size={16} />
            <strong>ADMIN</strong>
          </div>
          <div className="team-node">
            <Code2 size={16} />
            <strong>DEVELOPER</strong>
          </div>
          <div className="team-node">
            <LockKeyhole size={16} />
            <strong>VIEWER</strong>
          </div>
        </div>
      </div>
      <div className="metric-grid mt-3">
        <div className="metric">
          <Users size={15} />
          <strong>4</strong>
          <small>Defined roles</small>
        </div>
        <div className="metric">
          <Bot size={15} />
          <strong>Leo</strong>
          <small>Shared intelligence layer</small>
        </div>
        <div className="metric">
          <LockKeyhole size={15} />
          <strong>RLS</strong>
          <small>Database boundary</small>
        </div>
        <div className="metric">
          <strong>Server</strong>
          <small>Permission enforcement</small>
        </div>
      </div>
      <div className="two-grid">
        <Panel>
          <div className="panel-title">Role architecture</div>
          <div className="data-list mt-4">
            {roles.map(([r, d, b]) => (
              <div className="data-card" key={r}>
                <div className="data-icon">
                  <Users size={15} />
                </div>
                <main>
                  <strong>{r}</strong>
                  <small>
                    {d} — {b}
                  </small>
                </main>
                <StatusPill status="DEFINED" />
              </div>
            ))}
          </div>
        </Panel>
        <Panel>
          <div className="panel-title">What stays isolated</div>
          <div className="team-boundaries">
            <span>Projects</span>
            <span>Credentials</span>
            <span>API keys</span>
            <span>Activity</span>
            <span>Integrations</span>
            <span>Files</span>
          </div>
          <p className="mt-4 text-[10px] leading-6 text-zinc-500">
            Every sensitive operation should be authorized server-side and
            constrained by the authenticated user or organization boundary.
          </p>
        </Panel>
      </div>
    </LEOAppShell>
  );
}
