import type { Deal, Filters } from './types';

export function applyFilters(deals: Deal[], f: Filters): Deal[] {
  const teams = f.salesTeams.length ? new Set(f.salesTeams) : null;
  const branches = f.branches.length ? new Set(f.branches) : null;
  const utilities = f.utilities.length ? new Set(f.utilities) : null;
  const ahjs = f.ahjs.length ? new Set(f.ahjs) : null;
  const fromMs = f.soldFrom ? f.soldFrom.getTime() : null;
  const toMs = f.soldTo ? f.soldTo.getTime() + 86_399_999 : null;

  return deals.filter((d) => {
    if (teams && !teams.has(d.organization)) return false;
    if (branches && !branches.has(d.branch)) return false;
    if (utilities && !utilities.has(d.utility)) return false;
    if (ahjs && !ahjs.has(d.ahj)) return false;
    if (fromMs != null && (!d.createdAt || d.createdAt.getTime() < fromMs)) return false;
    if (toMs != null && (!d.createdAt || d.createdAt.getTime() > toMs)) return false;
    return true;
  });
}
