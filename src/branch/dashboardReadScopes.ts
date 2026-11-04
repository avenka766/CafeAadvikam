import type {BranchDataScope} from './branchStore';
/** Reports and closure own their exact date/session reads; billing needs no history. */
export function dashboardReadScopes(tab:string):BranchDataScope[]{
 switch(tab){
  case 'bill':return ['stock','thresholds'];
  case 'advance':return ['stock','advance'];
  case 'alerts':return ['stock','incoming','thresholds'];
  case 'settings':return ['stock','thresholds'];
  case 'returns':case 'purchase':case 'po':return ['stock'];
  case 'reports':return ['stock','sales'];
  default:return [];
 }
}
