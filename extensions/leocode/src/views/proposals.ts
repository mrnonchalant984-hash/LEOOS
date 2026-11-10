export type FileProposal = { path: string; contents: string };
export type ProposalSnapshot = {
  expectedVersion?: number;
  actualVersion?: number;
  expectedContents: string;
  actualContents?: string;
  expectedToExist: boolean;
  exists: boolean;
};

export function isProposalStale(snapshot: ProposalSnapshot) {
  if (snapshot.expectedToExist !== snapshot.exists) return true;
  if (!snapshot.exists) return false;
  return snapshot.expectedContents !== snapshot.actualContents
    || snapshot.expectedVersion !== snapshot.actualVersion;
}

export function parseFileProposals(reply: string): FileProposal[] {
  const proposals: FileProposal[] = [];
  const pattern = /(?:^|\r?\n)###\s+File:\s*([^\r\n]+)\r?\n```[^\r\n]*\r?\n([\s\S]*?)```/g;
  for (const match of reply.matchAll(pattern)) {
    const filePath = match[1].trim().replaceAll('\\', '/');
    const contents = match[2].replace(/\r\n/g, '\n');
    if (!filePath || !contents.trim()) continue;
    if (proposals.some(proposal => proposal.path.toLowerCase() === filePath.toLowerCase())) {
      throw new Error(`Leo returned more than one proposal for ${filePath}. Ask for a single proposal per file.`);
    }
    proposals.push({ path: filePath, contents });
    if (proposals.length > 5) throw new Error('Leo returned more than five file proposals. Ask for a smaller change set.');
  }
  return proposals;
}

export function hasFencedCode(reply: string) {
  return /```[^\r\n]*\r?\n[\s\S]+?```/.test(reply);
}
