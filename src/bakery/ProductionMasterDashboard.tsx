import BakerDashboard from './BakerDashboard';
import { useAuthStore } from '@/stores/authStore';
import type { ProductionDestination } from './productionRouting';

const MASTER_DESTINATIONS: Partial<Record<string, ProductionDestination>> = {
  sweet_master: 'sweet_master',
  savouries_master: 'savouries_master',
  cookies_master: 'cookies_master',
  puffs_master: 'puffs_master',
  bakery_master: 'bakery_master',
};

export default function ProductionMasterDashboard() {
  const role = useAuthStore(state => state.currentUser?.role);
  const destination = role ? MASTER_DESTINATIONS[role] : undefined;
  if (!destination) return null;
  return <BakerDashboard destination={destination} />;
}
