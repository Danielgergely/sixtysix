import { useGameStore } from '../game/store'

export function BottomNav({ active }: { active: 'home' | 'profile' }) {
  const goTo = useGameStore((s) => s.goTo)
  return (
    <nav className="bottom-nav">
      <button className={`nav-item ${active === 'home' ? 'nav-active' : ''}`} onClick={() => goTo('menu')}>
        🏠<span>Home</span>
      </button>
      <button className="nav-item" disabled>
        🛒<span>Shop</span>
      </button>
      <button className="nav-item" disabled>
        🏆<span>Ranks</span>
      </button>
      <button className={`nav-item ${active === 'profile' ? 'nav-active' : ''}`} onClick={() => goTo('profile')}>
        👤<span>Profile</span>
      </button>
    </nav>
  )
}
