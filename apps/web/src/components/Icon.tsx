const paths = {
  overview: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  workspace: 'M3 7h18v14H3z M8 7V3h8v4 M3 12h18',
  task: 'M9 5h12 M9 12h12 M9 19h12 M3 5l1 1 2-2 M3 12l1 1 2-2 M3 19l1 1 2-2',
  notification: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9 M10 21h4',
  profile: 'M8 6a4 4 0 1 0 8 0a4 4 0 1 0-8 0 M3 21v-3a6 6 0 0 1 6-6h6a6 6 0 0 1 6 6v3',
  board: 'M3 4h5v16H3z M10 4h5v12h-5z M17 4h4v9h-4z',
  clock: 'M12 8v5l3 2 M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0',
  check: 'M5 12l4 4L19 6',
  arrow: 'M5 12h14 M13 6l6 6-6 6',
} as const;
export function Icon({ name }: { name: keyof typeof paths }) {
  return <svg className="ui-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
