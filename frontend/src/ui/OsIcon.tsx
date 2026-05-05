/** OS icon based on detected os_type string from /etc/os-release ID or uname */

interface Props { os?: string | null; size?: number }

export function OsIcon({ os, size = 14 }: Props) {
  const id = (os ?? '').toLowerCase()

  // Match distro/OS
  if (id.includes('ubuntu'))   return <Ubuntu size={size} />
  if (id.includes('debian'))   return <Debian size={size} />
  if (id.includes('fedora'))   return <Fedora size={size} />
  if (id.includes('centos') || id.includes('rhel') || id.includes('redhat')) return <RedHat size={size} />
  if (id.includes('arch'))     return <Arch size={size} />
  if (id.includes('alpine'))   return <Alpine size={size} />
  if (id.includes('windows'))  return <Windows size={size} />
  if (id.includes('darwin') || id.includes('macos') || id.includes('mac os')) return <Apple size={size} />
  if (id.includes('rocky') || id.includes('almalinux')) return <RedHat size={size} />
  if (id.includes('opensuse') || id.includes('suse')) return <Suse size={size} />
  if (id.includes('linux') || id.includes('gnu')) return <Linux size={size} />
  return <Linux size={size} />
}

const s = (size: number) => ({ width: size, height: size, display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 })

function Ubuntu({ size }: { size: number }) {
  return <svg style={s(size)} viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="11" fill="#E95420"/>
    <circle cx="12" cy="12" r="4" fill="none" stroke="white" strokeWidth="2.5"/>
    <circle cx="12" cy="3.5" r="2" fill="white"/>
    <circle cx="20.9" cy="17.25" r="2" fill="white"/>
    <circle cx="3.1" cy="17.25" r="2" fill="white"/>
  </svg>
}

function Debian({ size }: { size: number }) {
  return <svg style={s(size)} viewBox="0 0 24 24" fill="#A80030">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1.5 14.5c-1.93.55-4-.2-5.15-1.8-.55-.77-.8-1.7-.65-2.6.15-.9.65-1.7 1.35-2.2.7-.5 1.55-.7 2.4-.6.85.1 1.6.55 2.1 1.2.5.65.7 1.5.55 2.3-.15.8-.6 1.5-1.25 2.0-.3.2-.65.35-1 .45l.15-.35c.5-.25.9-.65 1.15-1.15.25-.5.3-1.05.15-1.55-.15-.5-.5-.95-.95-1.2-.45-.25-.95-.3-1.45-.15-.5.15-.9.5-1.15.95-.25.45-.3 1-.15 1.5.15.5.5.9.95 1.15l-.35 1.05z"/>
  </svg>
}

function Fedora({ size }: { size: number }) {
  return <svg style={s(size)} viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="11" fill="#294172"/>
    <path d="M12 6v6h-6" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"/>
    <path d="M12 12v6h6" stroke="#3c6eb4" strokeWidth="2.5" strokeLinecap="round"/>
    <circle cx="12" cy="12" r="2" fill="#fff"/>
  </svg>
}

function RedHat({ size }: { size: number }) {
  return <svg style={s(size)} viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="11" fill="#EE0000"/>
    <path d="M7 14.5s2-1 3.5-1 3.5 1.5 5.5.5" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
    <circle cx="9" cy="10" r="1.5" fill="white"/>
    <circle cx="15" cy="10" r="1.5" fill="white"/>
  </svg>
}

function Arch({ size }: { size: number }) {
  return <svg style={s(size)} viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="11" fill="#1793D1"/>
    <path d="M12 4L17.5 17H6.5L12 4z" fill="none" stroke="white" strokeWidth="1.5" strokeLinejoin="round"/>
    <path d="M9.5 14h5" stroke="#1793D1" strokeWidth="2.5"/>
  </svg>
}

function Alpine({ size }: { size: number }) {
  return <svg style={s(size)} viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="11" fill="#0D597F"/>
    <path d="M5 17L10 9l4 5 3-4 5 7" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
  </svg>
}

function Linux({ size }: { size: number }) {
  return <svg style={s(size)} viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="11" fill="#555"/>
    <ellipse cx="12" cy="10" rx="4" ry="5" fill="none" stroke="white" strokeWidth="1.5"/>
    <circle cx="10" cy="9" r="1" fill="white"/>
    <circle cx="14" cy="9" r="1" fill="white"/>
    <path d="M8 16c0 2 3 3 8 1" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
}

function Windows({ size }: { size: number }) {
  return <svg style={s(size)} viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="11" fill="#00A4EF"/>
    <rect x="5" y="5.5" width="7" height="6" rx="0.5" fill="white"/>
    <rect x="13" y="5.5" width="7" height="6" rx="0.5" fill="white"/>
    <rect x="5" y="12.5" width="7" height="6" rx="0.5" fill="white"/>
    <rect x="13" y="12.5" width="7" height="6" rx="0.5" fill="white"/>
  </svg>
}

function Apple({ size }: { size: number }) {
  return <svg style={s(size)} viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="11" fill="#555"/>
    <path d="M15.5 8.5c-1.2-1.5-3-1.5-3-1.5s.2-1.5 1.5-2c0 0-1 0-2 1s-1 2.5-1 2.5c-2.5.5-4 3-4 5s1 5 2.5 5c.8 0 1.5-.5 2-.5s1.2.5 2 .5c1.5 0 2.5-2 3-3.5a4 4 0 0 1-2-3.5c0-1.5 1-2.5 1-3z" fill="white"/>
  </svg>
}

function Suse({ size }: { size: number }) {
  return <svg style={s(size)} viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="11" fill="#73BA25"/>
    <path d="M6 12c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke="white" strokeWidth="2" strokeLinecap="round" fill="none"/>
    <circle cx="12" cy="15" r="2.5" fill="white"/>
  </svg>
}
