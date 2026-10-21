import React from 'react';
import { Link } from 'react-router-dom';
import { assets } from './data';
const paths = {
  arrow: ['M4 12h16', 'm13 5 7 7-7 7'], down: ['m6 9 6 6 6-6'],
  heart: ['M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z'],
  shield: ['M12 3 3 7v6c0 4 5 7 9 9 4-2 9-5 9-9V7Z', 'm8 12 3 3 5-6'],
  users: ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', 'M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8', 'M17 4a4 4 0 0 1 0 8', 'M18 15a4 4 0 0 1 4 4v2'],
  qr: ['M3 3h6v6H3z', 'M15 3h6v6h-6z', 'M3 15h6v6H3z', 'M15 15h3v3h3v3h-6z', 'M12 3v3', 'M3 12h3', 'M12 9v6h-3', 'M18 12h3', 'M12 18v3'],
  lock: ['M5 10h14v11H5z', 'M8 10V6a4 4 0 0 1 8 0v4', 'M12 14v3'],
  pin: ['M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z', 'M12 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6'],
  car: ['m3 10 2-6h14l2 6', 'M3 10h18v8H3z', 'M5 18v3', 'M19 18v3', 'M6 14h2', 'M16 14h2'],
  card: ['M3 4h18v16H3z', 'M3 9h18', 'M6 15h4', 'M15 15h3'],
  clock: ['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20', 'M12 6v6l4 2'],
  phone: ['M7 2h10a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Z', 'M10 5h4', 'M11 18h2'],
  school: ['M3 10 12 3l9 7v11H3Z', 'M9 21v-6h6v6', 'M7 11h.01', 'M17 11h.01'],
  briefcase: ['M3 7h18v14H3z', 'M8 7V3h8v4', 'M3 12c5 3 13 3 18 0', 'M10 14h4'],
  compass: ['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20', 'm16 8-3 5-5 3 3-5Z'],
  check: ['m5 12 4 4L19 6'], play: ['m8 4 12 8-12 8Z'],
  bell: ['M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9', 'M9 21h6'],
  menu: ['M3 6h18', 'M3 12h18', 'M3 18h18'], close: ['m6 6 12 12', 'M18 6 6 18'],
  spark: ['m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z'],
  search: ['M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14', 'm15 15 6 6'],
  mail: ['M3 5h18v14H3z', 'm3 5 9 8 9-8'], download: ['M12 3v12', 'm7 10 5 5 5-5', 'M4 16v5h16v-5'],
  home: ['m3 10 9-8 9 8v11H3Z', 'M9 21v-8h6v8'], eye: ['M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z', 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6'],
};
export function Icon({ name = 'shield', size = 22, className = '', ...props }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className} {...props}>{(paths[name] || paths.shield).map((d, i) => <path key={i} d={d} />)}</svg>;
}
export function Brand({ light = false, staticMark = false }) {
  const Wrapper = staticMark ? "div" : Link;
  return <Wrapper to={staticMark ? undefined : "/"} className={`ns-brand${light ? ' ns-brand-light' : ''}`} aria-label="Nek Sathi home"><img src={assets.logo} alt="" width="44" height="48" /><span><b>Nek<span>Sathi</span><i aria-hidden="true"></i></b><small lang="hi">आपकी सुरक्षा, हमारी जिम्मेदारी</small></span></Wrapper>;
}
