/**
 * Vector teaser banners for the game-mode cards. Flat, stylized, in the app
 * palette — placeholders with intent, to be replaced by real illustrations.
 */

export function RaceBanner() {
  return (
    <svg viewBox="0 0 360 140" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Chariot race">
      {/* sky + sun */}
      <rect width="360" height="140" fill="#9ec7e0" />
      <rect width="360" height="140" y="20" fill="#b7d5e7" />
      <circle cx="300" cy="34" r="22" fill="#f3c465" />
      {/* dunes */}
      <ellipse cx="60" cy="105" rx="150" ry="38" fill="#e0b576" />
      <ellipse cx="300" cy="112" rx="180" ry="42" fill="#e8c997" />
      <rect y="98" width="360" height="42" fill="#d9a963" />
      {/* track lines */}
      <line x1="0" y1="116" x2="360" y2="116" stroke="#8e3b1e" strokeWidth="2" strokeDasharray="10 8" opacity="0.4" />
      {/* finish flag */}
      <rect x="318" y="58" width="4" height="52" fill="#2b1e12" />
      <g>
        <rect x="322" y="58" width="11" height="11" fill="#2b1e12" />
        <rect x="333" y="58" width="11" height="11" fill="#fcf6e2" />
        <rect x="322" y="69" width="11" height="11" fill="#fcf6e2" />
        <rect x="333" y="69" width="11" height="11" fill="#2b1e12" />
      </g>
      {/* dust */}
      <circle cx="76" cy="106" r="7" fill="#fcf6e2" opacity="0.55" />
      <circle cx="64" cy="98" r="5" fill="#fcf6e2" opacity="0.4" />
      <circle cx="88" cy="98" r="4" fill="#fcf6e2" opacity="0.35" />
      {/* horse — toy-style primitives */}
      <g fill="#8e3b1e">
        <path d="M200 80 q-16 -8 -26 4" stroke="#8e3b1e" strokeWidth="7" fill="none" strokeLinecap="round" />
        <rect x="202" y="96" width="7" height="22" rx="3.5" transform="rotate(14 205 96)" />
        <rect x="216" y="98" width="7" height="20" rx="3.5" />
        <rect x="232" y="98" width="7" height="20" rx="3.5" />
        <rect x="244" y="96" width="7" height="22" rx="3.5" transform="rotate(-14 247 96)" />
        <rect x="196" y="74" width="58" height="26" rx="13" />
        <rect x="241" y="52" width="16" height="34" rx="8" transform="rotate(18 249 69)" />
        <ellipse cx="259" cy="52" rx="13" ry="10" />
        <ellipse cx="270" cy="55" rx="7" ry="5" />
        <path d="M251 44 l3 -11 l8 7 z" />
      </g>
      <path d="M246 46 q-5 14 -1 28" stroke="#c45a36" strokeWidth="5" fill="none" strokeLinecap="round" />
      {/* harness */}
      <line x1="152" y1="90" x2="200" y2="84" stroke="#2b1e12" strokeWidth="3" />
      {/* chariot basket + driver */}
      <circle cx="134" cy="64" r="9" fill="#fcf6e2" stroke="#8e3b1e" strokeWidth="2.5" />
      <path d="M126 74 q8 8 17 0 l3 6 h-22 z" fill="#2a72d4" stroke="#8e3b1e" strokeWidth="2" />
      <path d="M116 100 h40 l-6 -24 h-28 z" fill="#c45a36" stroke="#8e3b1e" strokeWidth="3.5" />
      <circle cx="136" cy="104" r="16" fill="#c45a36" stroke="#8e3b1e" strokeWidth="4" />
      <line x1="136" y1="92" x2="136" y2="116" stroke="#8e3b1e" strokeWidth="3" />
      <line x1="124" y1="104" x2="148" y2="104" stroke="#8e3b1e" strokeWidth="3" />
      <circle cx="136" cy="104" r="5" fill="#f0b528" />
    </svg>
  )
}

export function ArenaBanner() {
  return (
    <svg viewBox="0 0 360 140" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Open arena">
      <rect width="360" height="140" fill="#e8c997" />
      {/* arena tiers */}
      <ellipse cx="180" cy="150" rx="220" ry="92" fill="#c45a36" />
      <ellipse cx="180" cy="158" rx="190" ry="78" fill="#d9a963" />
      <ellipse cx="180" cy="166" rx="160" ry="64" fill="#c45a36" />
      <ellipse cx="180" cy="176" rx="130" ry="52" fill="#e0b576" />
      {/* crowd rows */}
      {[
        { y: 66, n: 13, r: 5 },
        { y: 82, n: 11, r: 6 },
        { y: 100, n: 9, r: 7 },
      ].map((row, ri) =>
        Array.from({ length: row.n }, (_, i) => {
          const x = 180 + (i - (row.n - 1) / 2) * (300 / row.n)
          const colors = ['#fcf6e2', '#f0b528', '#8e3b1e', '#2a72d4', '#3ba23b']
          return <circle key={`${ri}-${i}`} cx={x} cy={row.y} r={row.r} fill={colors[(ri + i) % colors.length]} />
        }),
      )}
      {/* central stage */}
      <rect x="140" y="108" width="80" height="26" rx="6" fill="#fcf6e2" stroke="#8e3b1e" strokeWidth="3" />
      <text x="180" y="128" textAnchor="middle" fontSize="20" fontWeight="700" fill="#c45a36" fontFamily="inherit">
        ?
      </text>
      {/* banners */}
      <path d="M30 14 h26 v30 l-13 -9 l-13 9 z" fill="#2a72d4" stroke="#8e3b1e" strokeWidth="2.5" />
      <path d="M304 14 h26 v30 l-13 -9 l-13 9 z" fill="#e0393f" stroke="#8e3b1e" strokeWidth="2.5" />
    </svg>
  )
}

export function PracticeBanner() {
  return (
    <svg viewBox="0 0 360 140" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Practice">
      <rect width="360" height="140" fill="#e8c997" />
      <circle cx="180" cy="150" r="120" fill="#f0d9ac" />
      {/* sun rays */}
      <g stroke="#f0b528" strokeWidth="5" strokeLinecap="round" opacity="0.7">
        <line x1="180" y1="20" x2="180" y2="38" />
        <line x1="120" y1="38" x2="132" y2="52" />
        <line x1="240" y1="38" x2="228" y2="52" />
      </g>
      {/* open book */}
      <path d="M100 70 q40 -16 80 0 q40 -16 80 0 v44 q-40 -14 -80 0 q-40 -14 -80 0 z" fill="#fcf6e2" stroke="#8e3b1e" strokeWidth="4" />
      <line x1="180" y1="58" x2="180" y2="114" stroke="#8e3b1e" strokeWidth="3" />
      <g stroke="#d9a963" strokeWidth="3" strokeLinecap="round">
        <line x1="116" y1="78" x2="164" y2="74" />
        <line x1="116" y1="90" x2="164" y2="86" />
        <line x1="116" y1="102" x2="164" y2="98" />
        <line x1="196" y1="74" x2="244" y2="78" />
        <line x1="196" y1="86" x2="244" y2="90" />
        <line x1="196" y1="98" x2="244" y2="102" />
      </g>
      {/* floating question marks */}
      <text x="84" y="48" fontSize="26" fontWeight="700" fill="#c45a36" fontFamily="inherit">?</text>
      <text x="262" y="40" fontSize="20" fontWeight="700" fill="#2a72d4" fontFamily="inherit">?</text>
      <text x="288" y="78" fontSize="16" fontWeight="700" fill="#3ba23b" fontFamily="inherit">?</text>
    </svg>
  )
}
