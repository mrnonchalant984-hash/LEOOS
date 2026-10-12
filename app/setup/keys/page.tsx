import { LEOAppShell } from '@/components/LEOAppShell';
import IntegrationStatusCenter from '@/components/IntegrationStatusCenter';

export default function SetupKeysPage() {
  return <LEOAppShell title="Keys & Integrations" subtitle="Manage your platform connections and check which services are ready."><IntegrationStatusCenter /></LEOAppShell>;
}
