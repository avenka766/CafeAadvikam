import {useEffect,useState,type ReactNode} from 'react';

/** Defer a workspace until first use, then retain its drafts while hidden. */
export function RetainedPanel({active,children}:{active:boolean;children:ReactNode}) {
  const [visited,setVisited]=useState(active);
  useEffect(()=>{if(active)setVisited(true);},[active]);
  if(!active&&!visited)return null;
  return <div hidden={!active}>{children}</div>;
}
