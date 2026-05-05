import type { SVGProps } from 'react'

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'stroke'> {
  d?: string
  size?: number
  stroke?: number
  fill?: string
}

const Icon = ({ d, size = 16, stroke = 1.5, fill = 'none', children, ...rest }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none"
    stroke="currentColor" strokeWidth={stroke}
    strokeLinecap="round" strokeLinejoin="round" {...rest}>
    {d ? <path d={d} fill={fill} /> : children}
  </svg>
)

type P = Omit<IconProps, 'd' | 'fill'>

export const I = {
  Dashboard: (p: P) => <Icon {...p}><rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="2" width="5" height="5" rx="1"/><rect x="2" y="9" width="5" height="5" rx="1"/><rect x="9" y="9" width="5" height="5" rx="1"/></Icon>,
  Server: (p: P) => <Icon {...p}><rect x="2" y="3" width="12" height="4" rx="1"/><rect x="2" y="9" width="12" height="4" rx="1"/><circle cx="4.5" cy="5" r="0.4" fill="currentColor"/><circle cx="4.5" cy="11" r="0.4" fill="currentColor"/></Icon>,
  Terminal: (p: P) => <Icon {...p}><rect x="1.5" y="2.5" width="13" height="11" rx="1.5"/><path d="M4 6l2 2-2 2M8 10h4"/></Icon>,
  Folder: (p: P) => <Icon {...p}><path d="M1.5 4.5a1 1 0 0 1 1-1H6l1.5 1.5h6a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1V4.5z"/></Icon>,
  Key: (p: P) => <Icon {...p}><circle cx="5" cy="11" r="2.5"/><path d="m7 9 6.5-6.5M11 5l1.5 1.5M9 7l1.5 1.5"/></Icon>,
  Settings: (p: P) => <Icon {...p}><path d="M8 5a3 3 0 1 0 0 6 3 3 0 0 0 0-6zm0 1.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3z"/><path d="M8 1.5A6.5 6.5 0 0 1 13.8 4.9l.7-.4 1 1.7-.7.4c.1.5.2.9.2 1.4s-.1.9-.2 1.4l.7.4-1 1.7-.7-.4A6.5 6.5 0 0 1 8 14.5a6.5 6.5 0 0 1-5.8-3.4l-.7.4-1-1.7.7-.4A6.5 6.5 0 0 1 1 8c0-.5.1-.9.2-1.4l-.7-.4 1-1.7.7.4A6.5 6.5 0 0 1 8 1.5z" strokeLinecap="round"/></Icon>,
  Plus: (p: P) => <Icon {...p}><path d="M8 3v10M3 8h10"/></Icon>,
  Search: (p: P) => <Icon {...p}><circle cx="7" cy="7" r="4.5"/><path d="m13 13-2.7-2.7"/></Icon>,
  X: (p: P) => <Icon {...p}><path d="m4 4 8 8M12 4l-8 8"/></Icon>,
  ChevronDown: (p: P) => <Icon {...p}><path d="m4 6 4 4 4-4"/></Icon>,
  Sun: (p: P) => <Icon {...p}><circle cx="8" cy="8" r="3"/><path d="M8 1.5v1.5M8 13v1.5M14.5 8H13M3 8H1.5M12.6 3.4l-1 1M4.4 11.6l-1 1M12.6 12.6l-1-1M4.4 4.4l-1-1"/></Icon>,
  Moon: (p: P) => <Icon {...p}><path d="M13.5 9.5A6 6 0 1 1 6.5 2.5a5 5 0 0 0 7 7z"/></Icon>,
  Split: (p: P) => <Icon {...p}><rect x="1.5" y="2.5" width="13" height="11" rx="1"/><path d="M8 2.5v11"/></Icon>,
  Cmd: (p: P) => <Icon {...p}><path d="M5 3a2 2 0 1 0 0 4h6a2 2 0 1 0 0-4 2 2 0 0 0-2 2v6a2 2 0 1 0 4 0 2 2 0 0 0-2-2H5a2 2 0 1 1 2 2v-6a2 2 0 1 0-2 2"/></Icon>,
  Activity: (p: P) => <Icon {...p}><path d="M1.5 8h3l2-5 3 10 2-5h3"/></Icon>,
  Lock: (p: P) => <Icon {...p}><rect x="3" y="7" width="10" height="7" rx="1"/><path d="M5 7V5a3 3 0 0 1 6 0v2"/></Icon>,
  Upload: (p: P) => <Icon {...p}><path d="M8 11V3m-3 3 3-3 3 3M2.5 13.5h11"/></Icon>,
  Download: (p: P) => <Icon {...p}><path d="M8 3v8m-3-3 3 3 3-3M2.5 13.5h11"/></Icon>,
  More: (p: P) => <Icon {...p}><circle cx="3" cy="8" r="1" fill="currentColor"/><circle cx="8" cy="8" r="1" fill="currentColor"/><circle cx="13" cy="8" r="1" fill="currentColor"/></Icon>,
  Copy: (p: P) => <Icon {...p}><rect x="5" y="5" width="9" height="9" rx="1"/><path d="M3 11V3a1 1 0 0 1 1-1h7"/></Icon>,
  Trash: (p: P) => <Icon {...p}><path d="M2 4h12M5.5 4V2.5h5V4M3.5 4l.7 9a1 1 0 0 0 1 1h5.6a1 1 0 0 0 1-1l.7-9"/></Icon>,
  Edit: (p: P) => <Icon {...p}><path d="M11 2.5 13.5 5 5 13.5H2.5V11L11 2.5z"/></Icon>,
  Star: (p: P) => <Icon {...p}><path d="m8 1.5 1.9 4 4.4.6-3.2 3 .8 4.4L8 11.4 4.1 13.5l.8-4.4-3.2-3 4.4-.6L8 1.5z"/></Icon>,
  Refresh: (p: P) => <Icon {...p}><path d="M14 8a6 6 0 1 1-1.8-4.3M14 2v3.5h-3.5"/></Icon>,
  Check: (p: P) => <Icon {...p}><path d="m3 8 3.5 3.5L13 5"/></Icon>,
  ArrowRight: (p: P) => <Icon {...p}><path d="M3 8h10m-4-4 4 4-4 4"/></Icon>,
  Bolt: (p: P) => <Icon {...p}><path d="M9 1.5 3 9h4l-1 5.5L13 7H8.5L9 1.5z"/></Icon>,
  Pin: (p: P) => <Icon {...p}><path d="M8 1.5v4.5M5 6h6l-1 4H6L5 6zM8 10v4.5"/></Icon>,
  File: (p: P) => <Icon {...p}><path d="M3 1.5h6L13 5.5v9H3v-13z"/><path d="M9 1.5V5.5h4"/></Icon>,
  ChevLeft: (p: P) => <Icon {...p}><path d="m10 4-4 4 4 4"/></Icon>,
  CornerArrow: (p: P) => <Icon {...p}><path d="M4 4v5a2 2 0 0 0 2 2h6m0 0-3-3m3 3-3 3"/></Icon>,
}
